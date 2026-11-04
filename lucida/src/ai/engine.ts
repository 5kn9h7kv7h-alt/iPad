import type { Repository } from '../data/repository';
import {
  DEFAULT_PREFS, type Candidate, type Category, type Discovery, type Prefs, type Source,
} from '../domain/types';
import { dateKey, hashText, newId, nowIso } from '../domain/util';
import { CATALOG_CURATED_AT } from './catalog';
import { buildProfileSummary } from './profile';
import type { DiscoveryProvider } from './provider';
import { ruleBasedProvider } from './ruleBased';
import { adaptWeights, matchesInterest, selectTop, tagReactions } from './scoring';

export interface EngineDeps {
  repo: Repository;
  /** 外部AI。未設定ならルールベースのみ。 */
  remote?: DiscoveryProvider | null;
  now?: () => Date;
}

export interface GenerateOptions {
  count: number;
  category?: Category;
  keyword?: string;
  /** いずれかに合致するテーマ（関連発見の探索） */
  keywords?: string[];
  /** 手動の探索で、許可済みならWeb検索を使う（Homeの自動生成では使わない） */
  web?: boolean;
  /** Homeの最後の1枠を、既存の興味から離れたテーマにする */
  exploreLast?: boolean;
}

export interface GenerateResult {
  created: Discovery[];
  notice?: string;
  provider: string;
}

export async function getPrefs(repo: Repository): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...(await repo.preferences.get('prefs')) };
}

const CACHE_TTL_MS = 24 * 3600 * 1000;

export function createEngine(deps: EngineDeps) {
  const { repo } = deps;
  const clock = deps.now ?? (() => new Date());
  let chain: Promise<unknown> = Promise.resolve(); // 同時実行の直列化（二重生成の防止）

  async function runGenerate(opts: GenerateOptions): Promise<GenerateResult> {
    const now = clock();
    const today = dateKey(now);
    const [prefs, interests, discoveries, interactions, usageRow] = await Promise.all([
      getPrefs(repo), repo.interests.list(), repo.discoveries.list(), repo.interactions.list(), repo.usage.get(today),
    ]);
    const used = usageRow?.count ?? 0;
    const remaining = Math.max(0, prefs.dailyLimit - used);
    const want = Math.min(opts.count, remaining);
    if (want <= 0) {
      return { created: [], provider: 'none', notice: `今日の生成上限（${prefs.dailyLimit}件）に達しました。設定で変更できます。` };
    }

    const summary = buildProfileSummary(interests, discoveries, interactions);
    const req = {
      profileSummary: summary,
      interests: interests.map((i) => ({ name: i.name, weight: i.weight })),
      avoidKeys: discoveries.map((d) => d.sourceKey),
      category: opts.category, keyword: opts.keyword, keywords: opts.keywords, count: want,
      allowWebSearch: !!opts.web && prefs.webSearch,
    };

    let provider: DiscoveryProvider = ruleBasedProvider;
    let notice: string | undefined;
    let candidates: Candidate[] = [];
    const useRemote = !!deps.remote && prefs.aiMode === 'auto';
    if (useRemote) {
      const cacheKey = 'gen:' + hashText(JSON.stringify([summary, opts.category, opts.keyword, opts.keywords, req.allowWebSearch, req.avoidKeys.length, today, want]));
      const cached = await repo.cache.get(cacheKey);
      try {
        if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_TTL_MS) {
          candidates = cached.value as Candidate[];
        } else {
          candidates = await deps.remote!.generate(req);
          if (candidates.length) await repo.cache.put({ id: cacheKey, value: candidates, createdAt: nowIso() });
        }
        provider = deps.remote!;
        if (!candidates.length) throw new Error('AIから有効な候補（出典つき）が得られませんでした');
      } catch (e) {
        provider = ruleBasedProvider;
        candidates = [];
        notice = `AI生成に失敗したため、ルールベースの提案に切り替えました（${(e as Error).message}）`;
      }
    }
    if (provider === ruleBasedProvider) candidates = await ruleBasedProvider.generate(req);

    // 重複の除去（同じ題材・同じ内容の再生成を防ぐ）
    const seenHash = new Set(discoveries.map((d) => d.contentHash));
    const seenKey = new Set(discoveries.map((d) => d.sourceKey));
    const uniq: Candidate[] = [];
    for (const c of candidates) {
      const h = hashText(c.title);
      if (seenHash.has(h) || seenKey.has(c.sourceKey)) continue;
      seenHash.add(h);
      uniq.push(c);
    }
    if (uniq.length === 0) {
      return { created: [], provider: provider.id, notice: notice ?? (opts.keyword || opts.keywords?.length || opts.category ? '条件に合う新しい発見はまだありません。' : '新しく出せる発見が尽きました。興味を追加すると広がります。') };
    }

    const recent = [...discoveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
    const picks = selectTop(uniq, want, {
      interests, reactions: tagReactions(discoveries, interactions), recent, now, weights: adaptWeights(interactions),
    }, { exploreLast: opts.exploreLast, categoryExplore: opts.category });

    const created: Discovery[] = [];
    for (const { candidate: c, scores } of picks) {
      const hit = interests.filter((i) => matchesInterest(c, i.name)).sort((a, b) => b.weight - a.weight)[0];
      const reasoning = hit
        ? `${c.reasoning}\nあなたの興味「${hit.name}」と関わりがありそうです（推測）。`
        : c.reasoning;
      const id = newId();
      const d: Discovery = {
        id, sourceKey: c.sourceKey, contentHash: hashText(c.title), title: c.title, category: c.category, tags: c.tags,
        fact: c.fact, reasoning, suggestion: c.suggestion, provenance: c.provenance, scores,
        generatedFor: today, createdAt: new Date(now.getTime() + created.length).toISOString(),
      };
      await repo.discoveries.put(d);
      for (const s of c.sources) {
        const src: Source = {
          id: newId(), discoveryId: id, title: s.title, url: s.url,
          fetchedAt: c.provenance === 'bundled' ? CATALOG_CURATED_AT : nowIso(),
          origin: c.provenance === 'bundled' ? 'bundled' : 'ai',
          note: c.provenance === 'bundled' ? '同梱カタログに記録した出典（リンク先の再確認は未実施）' : undefined,
        };
        await repo.sources.put(src);
      }
      created.push(d);
    }
    await repo.usage.put({ id: today, count: used + created.length });
    await refreshProfileSummary(repo);
    return { created, provider: provider.id, notice };
  }

  return {
    generate(opts: GenerateOptions): Promise<GenerateResult> {
      const run = chain.then(() => runGenerate(opts));
      chain = run.catch(() => undefined);
      return run;
    },
    /** アプリを開いたとき: 今日の分が目標に満たなければ補う。通知・バックグラウンド処理はしない。 */
    async ensureToday(): Promise<GenerateResult | null> {
      const run = chain.then(async () => {
        const prefs = await getPrefs(repo);
        const todayCount = (await repo.discoveries.list()).filter((d) => d.generatedFor === dateKey(clock())).length;
        const need = prefs.dailyTarget - todayCount;
        if (need <= 0) return null;
        return runGenerate({ count: need, exploreLast: true });
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
export type Engine = ReturnType<typeof createEngine>;

export async function refreshProfileSummary(repo: Repository): Promise<string> {
  const [interests, discoveries, interactions, prefs] = await Promise.all([
    repo.interests.list(), repo.discoveries.list(), repo.interactions.list(), getPrefs(repo),
  ]);
  const profileSummary = buildProfileSummary(interests, discoveries, interactions);
  await repo.preferences.put({ ...prefs, profileSummary, summaryUpdatedAt: nowIso() });
  return profileSummary;
}
