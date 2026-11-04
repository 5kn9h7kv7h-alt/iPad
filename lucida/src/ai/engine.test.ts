import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIdbRepository } from '../data/idb';
import { createMemoryRepository } from '../data/memory';
import type { Repository } from '../data/repository';
import { deriveState } from '../domain/state';
import type { Interest } from '../domain/types';
import { dateKey, hashText } from '../domain/util';
import { CATALOG } from './catalog';
import { createEngine, getPrefs } from './engine';
import { buildProfileSummary, extractTags, inferNewInterests } from './profile';
import { createRemoteProvider, validateCandidates } from './remote';
import { adaptWeights, BASE_WEIGHTS, diversityScore, noveltyScore, timingScore } from './scoring';

const interest = (name: string, weight: Interest['weight'] = 5): Interest => ({
  id: name, name, weight, origin: 'manual', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});
const noon = new Date(2026, 10, 4, 12, 0, 0);

describe('catalog', () => {
  it('全項目に出典があり、キーとタイトルが一意', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(25);
    expect(new Set(CATALOG.map((c) => c.sourceKey)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((c) => hashText(c.title))).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });
  it('6カテゴリすべてに項目がある', () => {
    expect(new Set(CATALOG.map((c) => c.category)).size).toBe(6);
  });
});

describe('engine (rule-based)', () => {
  it('興味に合う発見が優先され、保存・出典も記録される', async () => {
    const repo = createMemoryRepository();
    await repo.interests.put(interest('睡眠'));
    const engine = createEngine({ repo, now: () => noon });
    const r = await engine.generate({ count: 3 });
    expect(r.created).toHaveLength(3);
    expect(r.created.some((d) => d.tags.includes('睡眠'))).toBe(true);
    const sleep = r.created.find((d) => d.tags.includes('睡眠'))!;
    expect(sleep.reasoning).toContain('あなたの興味「睡眠」');
    expect((await repo.sources.list()).filter((s) => s.discoveryId === sleep.id).length).toBeGreaterThan(0);
    expect((await repo.usage.get(dateKey(noon)))?.count).toBe(3);
  });

  it('多様性: 3件選ぶと複数カテゴリにまたがる', async () => {
    const repo = createMemoryRepository();
    const r = await createEngine({ repo, now: () => noon }).generate({ count: 4 });
    expect(new Set(r.created.map((d) => d.category)).size).toBeGreaterThanOrEqual(3);
  });

  it('重複防止: 全部出し切った後は新規が生成されない', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), dailyLimit: 1000 });
    const engine = createEngine({ repo, now: () => noon });
    const r1 = await engine.generate({ count: 1000 });
    expect(r1.created).toHaveLength(CATALOG.length);
    const r2 = await engine.generate({ count: 3 });
    expect(r2.created).toHaveLength(0);
    expect(r2.notice).toBeTruthy();
    const all = await repo.discoveries.list();
    expect(new Set(all.map((d) => d.contentHash)).size).toBe(all.length);
  });

  it('1日の生成上限を守る', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), dailyLimit: 4 });
    const engine = createEngine({ repo, now: () => noon });
    expect((await engine.generate({ count: 3 })).created).toHaveLength(3);
    expect((await engine.generate({ count: 3 })).created).toHaveLength(1);
    const r = await engine.generate({ count: 3 });
    expect(r.created).toHaveLength(0);
    expect(r.notice).toContain('上限');
  });

  it('ensureToday: 目標枚数まで補い、再度開いても増えない／同時実行でも二重生成しない', async () => {
    const repo = createMemoryRepository();
    const engine = createEngine({ repo, now: () => noon });
    await Promise.all([engine.ensureToday(), engine.ensureToday()]);
    expect(await repo.discoveries.list()).toHaveLength(3);
    expect(await engine.ensureToday()).toBeNull();
    expect(await repo.discoveries.list()).toHaveLength(3);
  });

  it('カテゴリ・キーワード指定で絞り込める。Unknownは遠いテーマ', async () => {
    const repo = createMemoryRepository();
    const engine = createEngine({ repo, now: () => noon });
    const u = await engine.generate({ count: 2, category: 'Unknown' });
    expect(u.created.every((d) => d.category === 'Unknown')).toBe(true);
    const k = await engine.generate({ count: 3, keyword: '宇宙' });
    expect(k.created.length).toBeGreaterThan(0);
    expect(k.created.every((d) => JSON.stringify(d).includes('宇宙'))).toBe(true);
  });

  it('Unknownでは興味から離れたものが優先される', async () => {
    const repo = createMemoryRepository();
    await repo.interests.put(interest('言語'));
    const u = await createEngine({ repo, now: () => noon }).generate({ count: 1, category: 'Unknown' });
    expect(u.created[0].tags).not.toContain('言語');
  });
});

describe('engine (remote AI)', () => {
  const okResponse = {
    candidates: [{
      sourceKey: 'ai-1', category: 'Science', tags: ['テスト'], title: 'AI生成のテスト発見', fact: '事実です',
      reasoning: '推測です', suggestion: '提案です', sources: [{ title: '論文', url: 'https://example.org/a' }],
    }],
  };
  it('成功時はAI候補を保存し、キャッシュするので2回目は呼ばない', async () => {
    const repo = createMemoryRepository();
    let calls = 0;
    const remote = createRemoteProvider('https://x.test/gen', (async () => { calls++; return new Response(JSON.stringify(okResponse)); }) as typeof fetch);
    const engine = createEngine({ repo, remote, now: () => noon });
    const r = await engine.generate({ count: 1 });
    expect(r.provider).toBe('remote-ai');
    expect(r.created[0].provenance).toBe('ai');
    expect((await repo.cache.list()).length).toBe(1);
    await repo.discoveries.remove(r.created[0].id); // 同じ条件で再実行 → キャッシュ命中
    await repo.usage.put({ id: dateKey(noon), count: 0 });
    await engine.generate({ count: 1 });
    expect(calls).toBe(1);
  });
  it('AIが失敗してもルールベースに切り替わり、アプリは止まらない', async () => {
    const repo = createMemoryRepository();
    const remote = createRemoteProvider('https://x.test/gen', (async () => new Response('boom', { status: 500 })) as typeof fetch);
    const r = await createEngine({ repo, remote, now: () => noon }).generate({ count: 2 });
    expect(r.created).toHaveLength(2);
    expect(r.provider).toBe('rule-based');
    expect(r.notice).toContain('切り替え');
  });
  it('aiMode=rule ならAIを呼ばない', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), aiMode: 'rule' });
    let called = false;
    const remote = createRemoteProvider('https://x.test/gen', (async () => { called = true; return new Response('{}'); }) as typeof fetch);
    await createEngine({ repo, remote, now: () => noon }).generate({ count: 1 });
    expect(called).toBe(false);
  });
  it('出典のない候補は捨てる', () => {
    expect(validateCandidates([{ ...okResponse.candidates[0], sources: [] }])).toHaveLength(0);
    expect(validateCandidates([{ ...okResponse.candidates[0], sources: [{ title: 'x', url: 'javascript:alert(1)' }] }])).toHaveLength(0);
    expect(() => validateCandidates('x')).toThrow();
  });
});

describe('scoring / adaptive', () => {
  it('新規性・多様性・タイミング', () => {
    const c = CATALOG.find((x) => x.sourceKey === 'life-caffeine')!;
    expect(noveltyScore(c, [])).toBe(1);
    expect(diversityScore(c, [c])).toBeLessThan(0.3);
    expect(timingScore(c, new Date(2026, 10, 4, 8))).toBe(1);
    expect(timingScore(c, new Date(2026, 10, 4, 22))).toBeLessThan(1);
  });
  it('興味なしが続くと興味の重みが上がる', () => {
    const mk = (kind: 'like' | 'dislike', n: number) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, discoveryId: 'd', kind, createdAt: `2026-01-0${i + 1}T00:00:00Z` }));
    expect(adaptWeights([])).toEqual(BASE_WEIGHTS);
    expect(adaptWeights(mk('dislike', 5)).interest).toBeGreaterThan(BASE_WEIGHTS.interest);
    expect(adaptWeights(mk('like', 5)).novelty).toBeGreaterThan(BASE_WEIGHTS.novelty);
  });
  it('「興味なし」にしたタグは次回以降に出にくくなる', async () => {
    const repo = createMemoryRepository();
    const engine = createEngine({ repo, now: () => noon });
    const first = (await engine.generate({ count: 1, category: 'Science' })).created[0];
    await repo.interactions.put({ id: 'i1', discoveryId: first.id, kind: 'dislike', createdAt: '2026-11-04T01:00:00Z' });
    const next = (await engine.generate({ count: 3, category: 'Science' })).created;
    const dislikedTags = new Set(first.tags);
    const worst = next[next.length - 1];
    expect(next[0].tags.filter((t) => dislikedTags.has(t)).length).toBeLessThanOrEqual(worst.tags.filter((t) => dislikedTags.has(t)).length);
  });
});

describe('profile / state', () => {
  it('要約プロフィールは興味を含み短い', () => {
    const s = buildProfileSummary([interest('睡眠', 5), interest('宇宙', 3)], [], []);
    expect(s).toContain('睡眠(5)');
    expect(s.length).toBeLessThan(300);
  });
  it('手動入力のテキストから既知のテーマを拾い、既存の興味は除く', () => {
    expect(extractTags('最近、睡眠と宇宙の本を読んだ')).toEqual(expect.arrayContaining(['睡眠', '宇宙']));
    expect(inferNewInterests('睡眠と宇宙', [interest('睡眠')])).toEqual(['宇宙']);
  });
  it('反応の履歴から最終状態を導く', () => {
    const t = (n: number) => `2026-01-0${n}T00:00:00Z`;
    const st = deriveState('d', [
      { id: '1', discoveryId: 'd', kind: 'save', createdAt: t(1) },
      { id: '2', discoveryId: 'd', kind: 'like', createdAt: t(2) },
      { id: '3', discoveryId: 'd', kind: 'dislike', createdAt: t(3) },
      { id: '4', discoveryId: 'd', kind: 'unsave', createdAt: t(4) },
      { id: '5', discoveryId: 'd', kind: 'plan', createdAt: t(5) },
      { id: '6', discoveryId: 'x', kind: 'save', createdAt: t(6) },
    ]);
    expect(st).toEqual({ saved: false, rating: 'dislike', planned: true });
  });
});

describe('IndexedDB repository', () => {
  const run = async (repo: Repository) => {
    await repo.interests.put(interest('A'));
    await repo.interests.put(interest('B'));
    expect((await repo.interests.list()).map((i) => i.name).sort()).toEqual(['A', 'B']);
    await repo.interests.remove('A');
    expect(await repo.interests.get('A')).toBeUndefined();
    const dump = await repo.exportAll();
    await repo.clearAll();
    expect(await repo.interests.list()).toHaveLength(0);
    await repo.importAll(dump);
    expect((await repo.interests.list()).map((i) => i.name)).toEqual(['B']);
  };
  it('保存・取得・削除・書き出し・復元', async () => { await run(await createIdbRepository('t1')); });
  it('接続し直しても(再起動相当)データが残る', async () => {
    const a = await createIdbRepository('persist');
    await a.interests.put(interest('残る'));
    const b = await createIdbRepository('persist');
    expect((await b.interests.list()).map((i) => i.name)).toEqual(['残る']);
    expect(b.kind).toBe('indexeddb');
  });
  it('メモリ実装も同じ契約', async () => { await run(createMemoryRepository()); });
});
