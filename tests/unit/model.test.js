import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../public/js/core/model.js';

const NOW = new Date('2026-10-24T09:00:00');
const TODAY = '2026-10-24';
const mk = (o = {}) => {
  const r = M.createTask({ projectId: 'study-grove', title: 'タスク', ...o }, NOW, o.id || M.newId());
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.task;
};

test('createTask: 正常系と既定値', () => {
  const t = mk({ title: '  レポート  ' });
  assert.equal(t.title, 'レポート');
  assert.equal(t.priority, 'mid');
  assert.equal(t.done, false);
  assert.equal(t.due, null);
});

test('createTask: 不正入力を拒否', () => {
  assert.equal(M.createTask({ projectId: 'study-grove', title: '   ' }).ok, false);
  assert.equal(M.createTask({ projectId: 'unknown', title: 'a' }).ok, false);
  assert.equal(M.createTask({ projectId: 'study-grove', title: 'a', due: '2026-02-30' }).ok, false);
  assert.equal(M.createTask({ projectId: 'study-grove', title: 'a', priority: 'x' }).ok, false);
  assert.equal(M.createTask({ projectId: 'study-grove', title: 'a'.repeat(201) }).ok, false);
});

test('updateTask: 編集でsampleフラグが外れる', () => {
  const t = { ...mk(), sample: true };
  const r = M.updateTask(t, { title: '変更' });
  assert.ok(r.ok);
  assert.equal(r.task.title, '変更');
  assert.equal('sample' in r.task, false);
  assert.equal(M.updateTask(t, { title: '' }).ok, false);
});

test('setDone: 完了と取り消し', () => {
  const t = mk();
  const d = M.setDone(t, true, NOW);
  assert.equal(d.done, true);
  assert.ok(d.doneAt);
  const u = M.setDone(d, false, NOW);
  assert.equal(u.done, false);
  assert.equal(u.doneAt, null);
});

test('日付ユーティリティ', () => {
  assert.equal(M.todayStr(NOW), TODAY);
  assert.equal(M.addDays(TODAY, 1), '2026-10-25');
  assert.equal(M.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(M.isValidDate('2026-02-29'), false);
  assert.equal(M.isValidDate('2028-02-29'), true);
});

test('filterTasks: 各ビューとプロジェクト絞り込み', () => {
  const tasks = [
    mk({ id: 'a', title: 'a', due: '2026-10-23' }), // 期限切れ
    mk({ id: 'b', title: 'b', due: TODAY, priority: 'high' }), // 今日
    mk({ id: 'c', title: 'c', due: '2026-10-30', projectId: 'university' }),
    { ...mk({ id: 'd', title: 'd', due: '2026-10-20' }), done: true }, // 完了済みの過去期限
    mk({ id: 'e', title: 'e', priority: 'high', projectId: 'sim-game' }),
  ];
  const ids = (f) => M.filterTasks(tasks, f, TODAY).map((t) => t.id);
  assert.deepEqual(ids({ view: 'overdue' }), ['a']);
  assert.deepEqual(ids({ view: 'today' }), ['b']);
  assert.deepEqual(ids({ view: 'high' }), ['b', 'e']);
  assert.deepEqual(ids({ view: 'done' }), ['d']);
  assert.deepEqual(ids({ view: 'open' }), ['a', 'b', 'c', 'e']);
  assert.equal(ids({ view: 'all' }).length, 5);
  assert.deepEqual(ids({ view: 'open', projectId: 'university' }), ['c']);
});

test('sortTasks: 完了は後ろ、期限昇順（なしは最後）、優先度順', () => {
  const t = [
    mk({ id: '1', title: '1' }),
    mk({ id: '2', title: '2', due: '2026-10-25', priority: 'low' }),
    mk({ id: '3', title: '3', due: '2026-10-25', priority: 'high' }),
    { ...mk({ id: '4', title: '4', due: '2026-10-01' }), done: true },
  ];
  assert.deepEqual(M.sortTasks(t).map((x) => x.id), ['3', '2', '1', '4']);
});

test('projectStats / overallStats', () => {
  const tasks = [
    mk({ id: 'a', title: 'a', due: '2026-10-23' }),
    { ...mk({ id: 'b', title: 'b' }), done: true },
    mk({ id: 'c', title: 'c', projectId: 'university' }),
  ];
  const s = M.projectStats(tasks, 'study-grove', TODAY);
  assert.deepEqual([s.total, s.open, s.done, s.percent, s.overdue, s.next.id], [2, 1, 1, 50, 1, 'a']);
  assert.equal(M.projectStats(tasks, 'sim-game', TODAY).percent, 0);
  assert.equal(M.projectStats(tasks, 'sim-game', TODAY).next, null);
  const o = M.overallStats(tasks, TODAY);
  assert.deepEqual([o.open, o.overdue], [2, 1]);
});

test('開発依頼: 作成は承認待ち・待機中で、承認しても実行状態にならない', () => {
  const r = M.createRequest({ projectId: 'sim-game', body: 'セーブ機能を作る' }, NOW);
  assert.ok(r.ok);
  assert.equal(r.request.approval, 'pending');
  assert.equal(r.request.status, 'waiting');
  const a = M.setApproval(r.request, 'approved', NOW);
  assert.equal(a.approval, 'approved');
  assert.equal(a.status, 'waiting');
  assert.throws(() => M.setApproval(r.request, 'bogus'));
  assert.equal(M.createRequest({ projectId: 'sim-game', body: ' ' }).ok, false);
});

test('サンプルタスク: 全プロジェクトに存在し、sample印が付く', () => {
  const s = M.sampleTasks(TODAY, NOW);
  assert.equal(s.length, 8);
  assert.ok(s.every((t) => t.sample === true));
  for (const p of M.PROJECTS) assert.ok(s.some((t) => t.projectId === p.id), p.id);
  assert.ok(M.filterTasks(s, { view: 'overdue' }, TODAY).length >= 1);
  assert.ok(M.filterTasks(s, { view: 'today' }, TODAY).length >= 1);
});
