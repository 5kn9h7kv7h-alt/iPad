import { describe, expect, it } from 'vitest';
import { analyzeExperiment, analyzeRemote, computeStats } from '../ai/analysis';
import type { Discovery, Experiment, ExperimentLog, Interaction, Interest, KnowledgeEdge, KnowledgeNode, Note, Question } from '../domain/types';
import { buildGraph, layoutGraph, nodeId, NODE_H, NODE_W, suggestEdges, type GraphInput } from './graph';

const t = '2026-11-01T00:00:00Z';
const interest = (id: string, name: string): Interest => ({ id, name, weight: 3, origin: 'manual', createdAt: t, updatedAt: t });
const disc = (id: string, category: Discovery['category'], tags: string[], title = `発見${id}`): Discovery => ({
  id, sourceKey: id, contentHash: id, title, category, tags, fact: `${title}の事実`, reasoning: '', suggestion: '', provenance: 'bundled',
  scores: { interest: 0, novelty: 0, utility: 0, timing: 0, diversity: 0, total: 0 }, generatedFor: '2026-11-01', createdAt: t,
});
const act = (discoveryId: string, kind: Interaction['kind'], n = 1): Interaction => ({ id: `${discoveryId}-${kind}-${n}`, discoveryId, kind, createdAt: `2026-11-0${n}T00:00:00Z` });
const q = (id: string, text: string): Question => ({ id, text, status: 'open', createdAt: t });
const note = (id: string, kind: Note['kind'], text: string, tags: string[] = []): Note => ({ id, kind, text, tags, createdAt: t });
const edge = (a: string, b: string, status: KnowledgeEdge['status'] = 'active'): KnowledgeEdge => ({ id: `${a}>${b}`, sourceNode: a, targetNode: b, relation: 'r', origin: 'user', status, createdAt: t });
const base = (over: Partial<GraphInput> = {}): GraphInput => ({ interests: [], discoveries: [], questions: [], notes: [], experiments: [], interactions: [], nodes: [], edges: [], ...over });
const exp = (over: Partial<Experiment> = {}): Experiment => ({ id: 'e1', title: '朝の散歩', hypothesis: '朝に歩くと集中できる', plan: '毎朝10分歩く', startsOn: '2026-11-01', endsOn: '2026-11-07', status: 'running', createdAt: t, ...over });
const log = (day: string, did: boolean, rating?: ExperimentLog['rating']): ExperimentLog => ({ id: day, experimentId: 'e1', day, did, rating, text: '', createdAt: `${day}T09:00:00Z` });

describe('buildGraph', () => {
  it('5種類のノードを作る。発見は保存・興味あり・試す予定・明示追加だけが載る', () => {
    const g = buildGraph(base({
      interests: [interest('i1', '睡眠')],
      discoveries: [disc('saved', 'Science', ['睡眠']), disc('liked', 'Ideas', ['記憶']), disc('plain', 'Society', ['x']), disc('pinned', 'Unknown', ['y'])],
      interactions: [act('saved', 'save'), act('liked', 'like')],
      questions: [q('q1', 'なぜ眠くなるのか')],
      notes: [note('n1', 'insight', '早起きは楽だった'), note('n2', 'log', '買い物に行った')],
      experiments: [exp()],
      nodes: [{ id: nodeId('discovery', 'pinned'), type: 'discovery', label: 'x', refId: 'pinned', pinned: true, createdAt: t }],
    }));
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['topic:i1', 'discovery:saved', 'discovery:liked', 'discovery:pinned', 'question:q1', 'insight:n1', 'experiment:e1']));
    expect(ids).not.toContain('discovery:plain');
    expect(ids).not.toContain('insight:n2'); // 日常の記録は自動では載らない
    expect(new Set(g.nodes.map((n) => n.type)).size).toBe(5);
  });
  it('保存を解除した発見は載らなくなる', () => {
    const g = buildGraph(base({ discoveries: [disc('d', 'Science', [])], interactions: [act('d', 'save', 1), act('d', 'unsave', 2)] }));
    expect(g.nodes).toHaveLength(0);
  });
  it('非表示・位置・自由ノードを反映し、端点のないエッジと却下済みは描かない', () => {
    const nodes: KnowledgeNode[] = [
      { id: 'topic:i1', type: 'topic', label: '睡眠', refId: 'i1', x: 10, y: 20, createdAt: t },
      { id: 'topic:i2', type: 'topic', label: '宇宙', refId: 'i2', hidden: true, createdAt: t },
      { id: 'free:1', type: 'insight', label: '自分のメモ', note: '詳しい内容', createdAt: t },
    ];
    const g = buildGraph(base({
      interests: [interest('i1', '睡眠'), interest('i2', '宇宙')], nodes,
      edges: [edge('topic:i1', 'free:1'), edge('free:1', 'topic:i1'), edge('topic:i1', 'topic:i2'), edge('topic:i1', 'gone:1'), edge('free:1', 'topic:i1', 'dismissed')],
    }));
    expect(g.hiddenCount).toBe(1);
    expect(g.nodes.find((n) => n.id === 'topic:i1')).toMatchObject({ x: 10, y: 20 });
    expect(g.nodes.find((n) => n.id === 'free:1')).toMatchObject({ free: true, detail: '詳しい内容' });
    expect(g.edges).toHaveLength(1); // 重複(逆向き)・非表示の端点・存在しない端点は除外
  });
});

describe('suggestEdges', () => {
  const input = base({
    interests: [interest('i1', '睡眠')],
    discoveries: [disc('a', 'Science', ['睡眠', '記憶']), disc('b', 'Daily Life', ['睡眠', '健康']), disc('c', 'Science', ['記憶'])],
    interactions: [act('a', 'save'), act('b', 'save'), act('c', 'save')],
    questions: [q('q1', '睡眠が足りないと記憶は落ちるのか')],
  });
  it('テーマと発見、異分野の発見どうし、疑問とテーマを候補に挙げる', () => {
    const s = suggestEdges(buildGraph(input), input, 20);
    const keys = s.map((x) => x.key);
    expect(keys).toContain('discovery:a|topic:i1');
    expect(keys).toContain('discovery:a|discovery:b'); // 分野が違い「睡眠」を共有
    expect(keys).toContain('question:q1|topic:i1');
    expect(keys).not.toContain('discovery:a|discovery:c'); // 同分野で共通1つだけ → 出さない
    expect(s[0].score).toBeGreaterThanOrEqual(s[s.length - 1].score);
    expect(s.every((x) => x.reason.length > 0)).toBe(true);
  });
  it('すでに結んだ組・却下した組は二度と出さない', () => {
    const withEdges = { ...input, edges: [edge('topic:i1', 'discovery:a'), edge('discovery:b', 'discovery:a', 'dismissed')] };
    const keys = suggestEdges(buildGraph(withEdges), withEdges, 20).map((x) => x.key);
    expect(keys).not.toContain('discovery:a|topic:i1');
    expect(keys).not.toContain('discovery:a|discovery:b');
  });
  it('件数の上限を守る', () => {
    expect(suggestEdges(buildGraph(input), input, 2)).toHaveLength(2);
  });
});

describe('layoutGraph', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, type: (['topic', 'discovery', 'question', 'insight', 'experiment'] as const)[i % 5], x: undefined, y: undefined }));
  const edges = Array.from({ length: 20 }, (_, i) => ({ source: `n${i}`, target: `n${(i * 7 + 3) % 30}` }));
  const overlaps = (pts: { x: number; y: number }[]) => {
    let n = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.abs(pts[i].x - pts[j].x) < NODE_W && Math.abs(pts[i].y - pts[j].y) < NODE_H) n++;
    return n;
  };
  const span = (pts: { x: number; y: number }[]) => ({
    w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
  });
  it('同じ入力なら同じ配置になり、座標は有限で、ノードの矩形が重ならない', () => {
    const a = layoutGraph(nodes, edges), b = layoutGraph(nodes, edges);
    expect([...a]).toEqual([...b]);
    const pts = [...a.values()];
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(overlaps(pts)).toBe(0);
  });
  it('縮小しなくても読める程度に詰まっている（散らばりすぎない）', () => {
    // 8ノードなら、PCのキャンバス(約650x530)にほぼ収まる広がりであること
    const eight = [...layoutGraph(nodes.slice(0, 8), []).values()];
    expect(span(eight).w).toBeLessThan(700);
    expect(span(eight).h).toBeLessThan(500);
    expect(overlaps(eight)).toBe(0);
    // 60ノードでも重ならず、1ノードあたりの面積が広がりすぎない
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, type: nodes[i % 30].type, x: undefined, y: undefined }));
    const pts = [...layoutGraph(many, edges.map((e) => ({ source: e.source.replace('n', 'm0').slice(-3), target: e.target.replace('n', 'm0').slice(-3) }))).values()];
    expect(overlaps(pts)).toBe(0);
    expect((span(pts).w * span(pts).h) / 60).toBeLessThan(NODE_W * NODE_H * 3);
  });
  it('位置が決まっているノードの隣に、重ならないように新しいノードを置く', () => {
    const placed = [...layoutGraph(nodes.slice(0, 6), [])].map(([id, p], i) => ({ id, type: nodes[i].type, x: p.x, y: p.y }));
    const next = layoutGraph([...placed, ...nodes.slice(6, 12)], []);
    for (const n of placed) expect(next.get(n.id)).toEqual({ x: n.x, y: n.y });
    expect(overlaps([...next.values()])).toBe(0);
  });
  it('位置が決まっているノードは動かさない', () => {
    const fixed = [{ id: 'f', type: 'topic' as const, x: 500, y: -300 }, ...nodes];
    expect(layoutGraph(fixed, edges).get('f')).toEqual({ x: 500, y: -300 });
  });
  it('1個だけ・0個でも壊れない', () => {
    expect(layoutGraph([], []).size).toBe(0);
    const one = layoutGraph([{ id: 'a', type: 'topic', x: undefined, y: undefined }], []);
    expect(Number.isFinite(one.get('a')!.x)).toBe(true);
  });
});

describe('experiment analysis', () => {
  it('実施率・連続日数・前後半の平均を数える', () => {
    const logs = [log('2026-11-01', true, 2), log('2026-11-02', true, 3), log('2026-11-03', false), log('2026-11-04', true, 4), log('2026-11-05', true, 5)];
    const s = computeStats(exp(), logs, '2026-11-05');
    expect(s).toMatchObject({ periodDays: 7, elapsedDays: 5, didDays: 4, skippedDays: 1, longestStreak: 2, ratedCount: 4 });
    expect(s.adherence).toBeCloseTo(0.8);
    expect(s.avgRating).toBeCloseTo(3.5);
    expect(s.firstHalfAvg).toBeCloseTo(2.5);
    expect(s.secondHalfAvg).toBeCloseTo(4.5);
  });
  it('同じ日の記録が複数あれば最後の記録を使い、期間後は経過日数を期間で打ち切る', () => {
    const logs = [log('2026-11-01', false), { ...log('2026-11-01', true), id: 'again', createdAt: '2026-11-01T20:00:00Z' }];
    const s = computeStats(exp(), logs, '2026-12-25');
    expect(s.didDays).toBe(1);
    expect(s.elapsedDays).toBe(7);
  });
  it('事実・推測・提案を分けて返し、注意書きが付く', () => {
    const logs = [log('2026-11-01', true, 2), log('2026-11-02', true, 3), log('2026-11-03', true, 4), log('2026-11-04', true, 5)];
    const a = analyzeExperiment(exp({ status: 'done', outcome: 'supported' }), logs, '2026-11-07');
    expect(a.provider).toBe('rule-based');
    expect(a.facts.join()).toContain('実施率');
    expect(a.facts.join()).toContain('仮説は支持された');
    expect(a.inferences.join()).toContain('後半ほど手応えが上がって');
    expect(a.nextSteps.length).toBeGreaterThan(0);
    expect(a.caveat).toContain('因果関係');
  });
  it('手応えの記録が少ないときは「記録と自己評価が一致」と言わない（矛盾した読み取りをしない）', () => {
    const few = analyzeExperiment(exp({ status: 'done', outcome: 'supported' }), [log('2026-11-01', true, 5), log('2026-11-02', true)], '2026-11-02');
    expect(few.inferences.join()).toContain('当てになりません');
    expect(few.inferences.join()).not.toContain('一致');
    const enough = analyzeExperiment(exp({ status: 'done', outcome: 'supported' }), [log('2026-11-01', true, 4), log('2026-11-02', true, 4), log('2026-11-03', true, 5)], '2026-11-03');
    expect(enough.inferences.join()).toContain('一致');
  });
  it('記録がなくても壊れず、記録を促す', () => {
    const a = analyzeExperiment(exp(), [], '2026-11-03');
    expect(a.facts.join()).toContain('まだありません');
    expect(a.nextSteps.join()).toContain('1日1行');
  });
  it('実施率が低いと「続けにくさ」を指摘する', () => {
    const a = analyzeExperiment(exp({ outcome: 'not_supported' }), [log('2026-11-01', true), log('2026-11-02', false)], '2026-11-07');
    expect(a.inferences.join()).toContain('続けにくさ');
  });
  it('外部AIの分析: 事実はローカル集計を使い、応答を検証する。不正な応答は失敗させる', async () => {
    const ok = (async () => new Response(JSON.stringify({ inferences: ['推測A', 42, ''], nextSteps: ['提案B'] }))) as typeof fetch;
    const a = await analyzeRemote('https://x.test/analyze', exp(), [log('2026-11-01', true, 3)], '2026-11-02', ok);
    expect(a.provider).toBe('remote-ai');
    expect(a.inferences).toEqual(['推測A']);
    expect(a.facts.join()).toContain('実施率');
    const bad = (async () => new Response(JSON.stringify({ inferences: [] }))) as typeof fetch;
    await expect(analyzeRemote('https://x.test/analyze', exp(), [], '2026-11-02', bad)).rejects.toThrow();
    const err = (async () => new Response('x', { status: 500 })) as typeof fetch;
    await expect(analyzeRemote('https://x.test/analyze', exp(), [], '2026-11-02', err)).rejects.toThrow('500');
  });
});
