import { describe, expect, it } from 'vitest';
import { createEngine, getPrefs } from '../ai/engine';
import { createMemoryRepository } from '../data/memory';
import { deriveState } from '../domain/state';
import { importFromIntegration, removeImported } from '../integrations/actions';
import { addEdge, addFreeNode, dismissSuggestion, hideNode, pinNode, removeNodeData, resetLayout, restoreHidden, savePositions } from '../knowledge/actions';
import { buildGraph, nodeId, suggestEdges } from '../knowledge/graph';
import { addLog, addResultToNetwork, completeExperiment, createExperiment, removeExperiment, runAnalysis, updateExperiment, validateExperiment } from './actions';

const now = new Date(2026, 10, 10, 12);
const input = { title: '朝の光を浴びる', hypothesis: '朝に光を浴びると夜に眠くなる', plan: '起きて15分以内に外に出る', startsOn: '2026-11-08', endsOn: '2026-11-14' };
const graphOf = async (repo: ReturnType<typeof createMemoryRepository>) => {
  const [interests, discoveries, questions, notes, experiments, interactions, nodes, edges] = await Promise.all([
    repo.interests.list(), repo.discoveries.list(), repo.questions.list(), repo.notes.list(), repo.experiments.list(), repo.interactions.list(), repo.nodes.list(), repo.edges.list(),
  ]);
  const gi = { interests, discoveries, questions, notes, experiments, interactions, nodes, edges };
  return { g: buildGraph(gi), gi };
};

describe('Lab: 実験', () => {
  it('入力を検証する', () => {
    expect(() => validateExperiment({ ...input, title: '  ' })).toThrow('名前');
    expect(() => validateExperiment({ ...input, endsOn: '2026-11-01' })).toThrow('終了日');
    expect(() => validateExperiment({ ...input, startsOn: '2026-02-31' })).toThrow('正しく');
    expect(() => validateExperiment({ ...input, endsOn: '2028-01-01' })).toThrow('1年以内');
  });
  it('開始日が今日以前なら進行中、未来なら予定。記録を付けると進行中になる', async () => {
    const repo = createMemoryRepository();
    expect((await createExperiment(repo, input, now)).status).toBe('running');
    const future = await createExperiment(repo, { ...input, startsOn: '2026-12-01', endsOn: '2026-12-07' }, now);
    expect(future.status).toBe('planned');
    await addLog(repo, future.id, { day: '2026-12-01', did: true, rating: 4, text: 'できた' });
    expect((await repo.experiments.get(future.id))?.status).toBe('running');
    await expect(addLog(repo, future.id, { day: 'x', did: true, text: '' })).rejects.toThrow('日付');
    await expect(addLog(repo, 'none', { day: '2026-12-01', did: true, text: '' })).rejects.toThrow('見つかりません');
  });
  it('発見から作ると、きっかけのエッジができ、「試す予定」が外れ、両方がNetworkに載る', async () => {
    const repo = createMemoryRepository();
    const d = (await createEngine({ repo, now: () => now }).generate({ count: 1 })).created[0];
    await repo.interactions.put({ id: 'p', discoveryId: d.id, kind: 'plan', createdAt: '2026-11-10T00:00:00Z' });
    const exp = await createExperiment(repo, { ...input, discoveryId: d.id }, now);
    expect(deriveState(d.id, await repo.interactions.list()).planned).toBe(false);
    const { g } = await graphOf(repo);
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([nodeId('discovery', d.id), nodeId('experiment', exp.id)]));
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ relation: 'きっかけ', origin: 'system' });
  });
  it('完了→分析→Networkへ追加。何度追加しても気づきは1つで、結果を書き直すと更新される', async () => {
    const repo = createMemoryRepository();
    const exp = await createExperiment(repo, input, now);
    for (const [day, did, rating] of [['2026-11-08', true, 3], ['2026-11-09', true, 4], ['2026-11-10', false, undefined]] as const) {
      await addLog(repo, exp.id, { day, did, rating, text: '' });
    }
    await expect(addResultToNetwork(repo, exp.id)).rejects.toThrow('先に結果');
    await expect(completeExperiment(repo, exp.id, { outcome: 'supported', result: ' ' })).rejects.toThrow('結果');
    await completeExperiment(repo, exp.id, { outcome: 'supported', result: '寝つきが良くなった' });
    const { analysis, notice } = await runAnalysis(repo, exp.id, { today: '2026-11-10' });
    expect(notice).toBeUndefined();
    expect(analysis.facts.join()).toContain('記録は3件');
    expect((await repo.experiments.get(exp.id))?.aiAnalysis?.provider).toBe('rule-based');

    await addResultToNetwork(repo, exp.id);
    await addResultToNetwork(repo, exp.id);
    expect((await repo.notes.list()).filter((n) => n.kind === 'insight')).toHaveLength(1);
    const { g } = await graphOf(repo);
    expect(g.edges.filter((e) => e.relation === '結果')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.type === 'insight')).toHaveLength(1);

    await completeExperiment(repo, exp.id, { outcome: 'unclear', result: 'よく分からなかった' });
    expect((await repo.experiments.get(exp.id))?.aiAnalysis).toBeUndefined(); // 結果が変わったら古い分析は消す
    await addResultToNetwork(repo, exp.id);
    const notes = await repo.notes.list();
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain('よく分からなかった');
  });
  it('外部AIの分析が失敗してもルールベースで結果を返す', async () => {
    const repo = createMemoryRepository();
    const exp = await createExperiment(repo, input, now);
    const r = await runAnalysis(repo, exp.id, { endpoint: 'https://x.test/a', fetchImpl: (async () => new Response('x', { status: 502 })) as typeof fetch, today: '2026-11-10' });
    expect(r.analysis.provider).toBe('rule-based');
    expect(r.notice).toContain('切り替え');
  });
  it('編集・削除。削除すると記録とエッジも消える', async () => {
    const repo = createMemoryRepository();
    const exp = await createExperiment(repo, input, now);
    expect((await updateExperiment(repo, exp.id, { title: '新しい名前' })).title).toBe('新しい名前');
    await expect(updateExperiment(repo, exp.id, { endsOn: '2020-01-01' })).rejects.toThrow();
    await addLog(repo, exp.id, { day: '2026-11-08', did: true, text: '' });
    await completeExperiment(repo, exp.id, { outcome: 'supported', result: 'ok' });
    await addResultToNetwork(repo, exp.id);
    await removeExperiment(repo, exp.id);
    expect(await repo.experiments.list()).toHaveLength(0);
    expect(await repo.experimentLogs.list()).toHaveLength(0);
    expect(await repo.edges.list()).toHaveLength(0);
  });
});

describe('Network: 編集操作', () => {
  it('自由ノードの追加・エッジ・削除', async () => {
    const repo = createMemoryRepository();
    const a = await addFreeNode(repo, { type: 'topic', label: '読書' });
    const b = await addFreeNode(repo, { type: 'insight', label: '朝のほうが集中できる', note: 'メモ' });
    await expect(addFreeNode(repo, { type: 'topic', label: ' ' })).rejects.toThrow('名前');
    await expect(addFreeNode(repo, { type: 'experiment', label: 'x' })).rejects.toThrow();
    await addEdge(repo, { source: a, target: b, relation: '', origin: 'user' });
    await expect(addEdge(repo, { source: b, target: a, relation: 'x', origin: 'user' })).rejects.toThrow('すでに');
    await expect(addEdge(repo, { source: a, target: a, relation: 'x', origin: 'user' })).rejects.toThrow('同じ');
    let { g } = await graphOf(repo);
    expect(g.edges[0].relation).toBe('関連');
    await hideNode(repo, { id: a, type: 'topic', label: '読書' });
    ({ g } = await graphOf(repo));
    expect(g.nodes.map((n) => n.id)).toEqual([b]);
    expect(await repo.edges.list()).toHaveLength(0);
  });
  it('導出ノードは非表示にでき、元のデータは残り、あとで戻せる', async () => {
    const repo = createMemoryRepository();
    await repo.interests.put({ id: 'i', name: '睡眠', weight: 3, origin: 'manual', createdAt: 'x', updatedAt: 'x' });
    await hideNode(repo, { id: 'topic:i', type: 'topic', label: '睡眠', refId: 'i' });
    expect((await graphOf(repo)).g).toMatchObject({ nodes: [], hiddenCount: 1 });
    expect(await repo.interests.list()).toHaveLength(1);
    expect(await restoreHidden(repo)).toBe(1);
    expect((await graphOf(repo)).g.nodes).toHaveLength(1);
  });
  it('位置の保存は非表示・明示追加の値を壊さない。整列し直しで位置だけ消える', async () => {
    const repo = createMemoryRepository();
    const id = await pinNode(repo, 'discovery', 'd1', '発見');
    await savePositions(repo, [{ id, type: 'discovery', label: '発見', refId: 'd1', x: 12.6, y: -3.2 }]);
    expect(await repo.nodes.get(id)).toMatchObject({ pinned: true, x: 13, y: -3 });
    await resetLayout(repo);
    const n = await repo.nodes.get(id);
    expect(n?.x).toBeUndefined();
    expect(n?.pinned).toBe(true);
  });
  it('候補を却下すると再提案されず、承認するとエッジになる', async () => {
    const repo = createMemoryRepository();
    await repo.interests.put({ id: 'i', name: '睡眠', weight: 3, origin: 'manual', createdAt: 'x', updatedAt: 'x' });
    await repo.questions.put({ id: 'q', text: '睡眠はなぜ必要か', status: 'open', createdAt: 'x' });
    let { g, gi } = await graphOf(repo);
    const s = suggestEdges(g, gi);
    expect(s).toHaveLength(1);
    await dismissSuggestion(repo, s[0]);
    ({ g, gi } = await graphOf(repo));
    expect(suggestEdges(g, gi)).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
    // 却下したものを自分で結び直すことはできる
    await addEdge(repo, { source: s[0].sourceNode, target: s[0].targetNode, relation: s[0].relation, origin: 'ai' });
    expect((await graphOf(repo)).g.edges).toHaveLength(1);
    expect(await repo.edges.list()).toHaveLength(1);
    await removeNodeData(repo, 'topic:i');
    expect(await repo.edges.list()).toHaveLength(0);
  });
});

describe('連携の取り込み', () => {
  const csv = '日付,内容,分\n2026-11-01,睡眠の本を読んだ,30\n2026-11-02,宇宙の講義,60\n';
  it('許可していない連携は実行しない', async () => {
    const repo = createMemoryRepository();
    await expect(importFromIntegration(repo, 'study', csv, now)).rejects.toThrow('許可されていません');
    expect(await repo.notes.list()).toHaveLength(0);
  });
  it('許可すれば取り込み、再取り込みで重複せず、出来事の日付で記録され、興味を推定する', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), integrations: { study: true } });
    const r1 = await importFromIntegration(repo, 'study', csv, now);
    expect(r1).toMatchObject({ added: 2, duplicates: 0 });
    expect(r1.inferred).toEqual(expect.arrayContaining(['睡眠', '宇宙']));
    const notes = await repo.notes.list();
    expect(notes.every((n) => n.source === 'study' && n.kind === 'log' && n.importedAt)).toBe(true);
    expect(notes.map((n) => n.createdAt.slice(0, 7))).toEqual(['2026-11', '2026-11']);
    expect(notes.find((n) => n.text.includes('睡眠'))?.tags).toContain('睡眠');
    const r2 = await importFromIntegration(repo, 'study', csv, now);
    expect(r2).toMatchObject({ added: 0, duplicates: 2, inferred: [] });
    expect(await repo.notes.list()).toHaveLength(2);
  });
  it('取り込んだ記録だけをまとめて削除できる（手動の記録は残る）', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), integrations: { study: true } });
    await repo.notes.put({ id: 'manual', kind: 'log', text: '手で書いた', tags: [], createdAt: 'x' });
    await importFromIntegration(repo, 'study', csv, now);
    expect(await removeImported(repo, 'study')).toBe(2);
    expect((await repo.notes.list()).map((n) => n.id)).toEqual(['manual']);
  });
  it('読めないファイルはエラーになり、何も保存しない', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), integrations: { calendar: true } });
    await expect(importFromIntegration(repo, 'calendar', 'これはICSではない', now)).rejects.toThrow('読み込めません');
    expect(await repo.notes.list()).toHaveLength(0);
  });
});
