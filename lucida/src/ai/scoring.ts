import type { Candidate, Category, Discovery, Interaction, Interest, Scores } from '../domain/types';

export interface Weights { interest: number; novelty: number; utility: number; timing: number; diversity: number }
export const BASE_WEIGHTS: Weights = { interest: 0.32, novelty: 0.22, utility: 0.16, timing: 0.1, diversity: 0.2 };

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** 候補のタグ・題名に、興味の名前が含まれるか（双方向の部分一致） */
export function matchesInterest(c: Pick<Candidate, 'tags' | 'title'>, name: string): boolean {
  const n = norm(name).trim();
  if (n.length === 0) return false;
  const hay = [norm(c.title), ...c.tags.map(norm)];
  return hay.some((h) => h.includes(n) || (h.length >= 2 && n.includes(h)));
}

export interface TagReactions { liked: Set<string>; disliked: Set<string> }

export function tagReactions(discoveries: Discovery[], interactions: Interaction[]): TagReactions {
  const byId = new Map(discoveries.map((d) => [d.id, d]));
  const latest = new Map<string, 'like' | 'dislike' | null>();
  for (const i of [...interactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (i.kind === 'like' || i.kind === 'dislike') latest.set(i.discoveryId, i.kind);
    if (i.kind === 'clear_rating') latest.set(i.discoveryId, null);
  }
  const liked = new Set<string>(), disliked = new Set<string>();
  for (const [id, r] of latest) {
    const d = byId.get(id);
    if (!d || !r) continue;
    for (const t of d.tags) (r === 'like' ? liked : disliked).add(norm(t));
  }
  return { liked, disliked };
}

/** Interest: 0..1。登録した興味の重みと、過去の「興味あり/なし」を反映。 */
export function interestScore(c: Candidate, interests: Interest[], reactions: TagReactions): number {
  let s = 0.2; // 何も情報がなくても完全なゼロにはしない
  for (const it of interests) if (matchesInterest(c, it.name)) s = Math.max(s, 0.4 + it.weight * 0.12);
  const tags = c.tags.map(norm);
  if (tags.some((t) => reactions.liked.has(t))) s += 0.15;
  if (tags.some((t) => reactions.disliked.has(t))) s -= 0.3;
  return clamp(s);
}

/** Novelty: 直近で見たカテゴリ・タグと被らないほど高い。 */
export function noveltyScore(c: Candidate, recent: Discovery[]): number {
  if (recent.length === 0) return 1;
  const sameCat = recent.filter((d) => d.category === c.category).length / recent.length;
  const seenTags = new Set(recent.flatMap((d) => d.tags.map(norm)));
  const tagOverlap = c.tags.length ? c.tags.filter((t) => seenTags.has(norm(t))).length / c.tags.length : 0;
  return clamp(1 - 0.5 * sameCat - 0.5 * tagOverlap);
}

/** Timing: 朝/夜/週末などの文脈が合うほど高い。指定なしは中立。 */
export function timingScore(c: Candidate, now: Date): number {
  if (!c.timing) return 0.6;
  const h = now.getHours(), wd = now.getDay();
  const ok = c.timing === 'morning' ? h >= 5 && h < 12
    : c.timing === 'evening' ? h >= 17 || h < 3
    : c.timing === 'weekend' ? wd === 0 || wd === 6
    : wd >= 1 && wd <= 5;
  return ok ? 1 : 0.3;
}

/** Diversity: すでに選んだ候補とカテゴリ・タグが被らないほど高い。 */
export function diversityScore(c: Candidate, selected: Pick<Candidate, 'category' | 'tags'>[]): number {
  if (selected.length === 0) return 1;
  const sameCat = selected.filter((s) => s.category === c.category).length / selected.length;
  const seen = new Set(selected.flatMap((s) => s.tags.map(norm)));
  const overlap = c.tags.length ? c.tags.filter((t) => seen.has(norm(t))).length / c.tags.length : 0;
  return clamp(1 - 0.7 * sameCat - 0.3 * overlap);
}

/**
 * 直近の反応から重みを調整する（Adaptive）。
 * - 「興味なし」が多い → 興味との関連を重視
 * - 「興味あり」が多い → 新規性・多様性をやや重視して視野を広げる
 */
export function adaptWeights(interactions: Interaction[]): Weights {
  const ratings = [...interactions].filter((i) => i.kind === 'like' || i.kind === 'dislike')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const w = { ...BASE_WEIGHTS };
  if (ratings.length >= 4) {
    const dislikeRate = ratings.filter((r) => r.kind === 'dislike').length / ratings.length;
    if (dislikeRate > 0.5) { w.interest += 0.1; w.novelty -= 0.06; w.diversity -= 0.04; }
    else if (dislikeRate < 0.2) { w.novelty += 0.04; w.diversity += 0.03; w.interest -= 0.07; }
  }
  return w;
}

/**
 * 分野の偏り補正: 最近よく出ているカテゴリほど低く、出ていないカテゴリほど高い（0..1）。
 * 6分野が均等なら 0.5。履歴が少ないうちは中立。
 */
export function exposureBalance(category: Category, history: Pick<Discovery, 'category'>[]): number {
  if (history.length < 6) return 0.5;
  const share = history.filter((d) => d.category === category).length / history.length;
  return clamp(1 - share * 3); // 1/6 → 0.5、1/3 以上 → 0
}

/** カテゴリごとの露出の割合（設定画面の表示用） */
export function categoryShares(history: Pick<Discovery, 'category'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of history) out[d.category] = (out[d.category] ?? 0) + 1;
  for (const k of Object.keys(out)) out[k] = out[k] / history.length;
  return out;
}

export interface ScoreContext {
  interests: Interest[]; reactions: TagReactions; recent: Discovery[]; selected: Candidate[]; now: Date;
  /** 分野の偏り補正に使う、より長い履歴（直近30件ほど）。省略時は補正なし */
  history?: Discovery[];
  weights: Weights; explore: boolean; // explore: 既存の興味から離れたものを優先（Unknown）
}

export function scoreCandidate(c: Candidate, ctx: ScoreContext): Scores {
  const rawInterest = interestScore(c, ctx.interests, ctx.reactions);
  const interest = ctx.explore ? 1 - rawInterest : rawInterest;
  const novelty = noveltyScore(c, ctx.recent);
  const utility = clamp(c.utility ?? 0.6);
  const timing = timingScore(c, ctx.now);
  // 多様性 = 今回選ぶ組の中での散らばり + 長期の分野バランス
  const within = diversityScore(c, ctx.selected);
  const diversity = ctx.history && ctx.history.length >= 6 ? 0.65 * within + 0.35 * exposureBalance(c.category, ctx.history) : within;
  const w = ctx.weights;
  const total = interest * w.interest + novelty * w.novelty * (ctx.explore ? 1.6 : 1) + utility * w.utility + timing * w.timing + diversity * w.diversity;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { interest: r(interest), novelty: r(novelty), utility: r(utility), timing: r(timing), diversity: r(diversity), total: r(total) };
}

/** 貪欲選択: 1件選ぶたびに多様性を再計算する。 */
export function selectTop(
  cands: Candidate[], count: number, base: Omit<ScoreContext, 'selected' | 'explore'>,
  opts: { exploreLast?: boolean; categoryExplore?: Category } = {},
): { candidate: Candidate; scores: Scores }[] {
  const pool = [...cands];
  const out: { candidate: Candidate; scores: Scores }[] = [];
  while (out.length < count && pool.length) {
    const explore = (opts.exploreLast && out.length === count - 1 && count >= 3) || opts.categoryExplore === 'Unknown';
    let best = -1, bestScores: Scores | null = null;
    pool.forEach((c, idx) => {
      const s = scoreCandidate(c, { ...base, selected: out.map((o) => o.candidate), explore });
      if (!bestScores || s.total > bestScores.total) { best = idx; bestScores = s; }
    });
    const [picked] = pool.splice(best, 1);
    out.push({ candidate: picked, scores: bestScores! });
  }
  return out;
}
