import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, normalize } from '../../public/js/core/voice.js';

const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));

test('今日やることを表示', () => {
  assert.deepEqual(pick(parseCommand('今日やることを表示'), ['intent', 'view', 'projectId']), { intent: 'show_tasks', view: 'today', projectId: null });
  assert.equal(parseCommand('今日やるべきことを表示して').view, 'today');
});

test('Study Groveのタスクを表示（音声認識の表記ゆれ）', () => {
  for (const s of ['Study Groveのタスクを表示', 'study grove のタスクを表示して', 'スタディグローブのタスクを見せて', 'ＳｔｕｄｙＧｒｏｖｅのタスクを表示']) {
    const r = parseCommand(s);
    assert.equal(r.intent, 'show_project', s);
    assert.equal(r.projectId, 'study-grove', s);
  }
});

test('プロジェクトの別名解決（長い別名を優先）', () => {
  assert.equal(parseCommand('大学の勉強のタスクを表示').projectId, 'university');
  assert.equal(parseCommand('大学のタスクを表示').projectId, 'university');
  assert.equal(parseCommand('ゲーム制作のタスクを表示').projectId, 'sim-game');
  assert.equal(parseCommand('シミュレーションゲームを表示').projectId, 'sim-game');
  assert.equal(parseCommand('マテリアルズインフォマティクスのタスク').projectId, 'materials-informatics');
  assert.equal(parseCommand('Materials Informaticsのタスクを表示').projectId, 'materials-informatics');
});

test('大学の勉強に、レポートを書くを追加', () => {
  const r = parseCommand('大学の勉強に、レポートを書くを追加');
  assert.deepEqual(pick(r, ['intent', 'projectId', 'title', 'mutating']), { intent: 'add_task', projectId: 'university', title: 'レポートを書く', mutating: true });
});

test('追加の言い回しバリエーション', () => {
  assert.equal(parseCommand('大学の勉強にレポートを書くを追加して').title, 'レポートを書く');
  assert.equal(parseCommand('Study Groveに「画面を直す」を追加してください').title, '画面を直す');
  assert.equal(parseCommand('ゲーム制作にタスクを追加：バランス調整').title, 'バランス調整');
  assert.equal(parseCommand('大学の勉強に英語の課題を登録').title, '英語の課題');
});

test('タイトルなしの追加は空タイトルで返す（UIが入力を促す）', () => {
  const r = parseCommand('ゲーム制作に新しいタスクを追加して');
  assert.equal(r.intent, 'add_task');
  assert.equal(r.projectId, 'sim-game');
  assert.equal(r.title, '');
});

test('プロジェクト指定なしの追加は、表示中のプロジェクトを使う／なければnull', () => {
  assert.equal(parseCommand('レポートを書くを追加', { currentProjectId: 'university' }).projectId, 'university');
  assert.equal(parseCommand('レポートを書くを追加').projectId, null);
});

test('このタスクを完了／未完了／削除（危険操作はdanger）', () => {
  assert.equal(parseCommand('このタスクを完了にする').intent, 'complete_task');
  assert.equal(parseCommand('このタスクを完了にして').mutating, true);
  assert.equal(parseCommand('このタスクを未完了に戻して').intent, 'uncomplete_task');
  assert.equal(parseCommand('完了を取り消して').intent, 'uncomplete_task');
  const d = parseCommand('このタスクを削除して');
  assert.equal(d.intent, 'delete_task');
  assert.equal(d.danger, true);
});

test('「完了」を含む表示指示は誤って完了操作にしない', () => {
  const r = parseCommand('完了したタスクを表示');
  assert.deepEqual(pick(r, ['intent', 'view', 'mutating']), { intent: 'show_tasks', view: 'done', mutating: false });
  assert.equal(parseCommand('未完了のタスクを表示').intent, 'show_tasks');
  assert.equal(parseCommand('未完了のタスクを表示').view, 'open');
  assert.equal(parseCommand('未完了のタスクを表示').mutating, false);
});

test('期限切れ・優先度高', () => {
  assert.equal(parseCommand('期限切れのタスクを表示').view, 'overdue');
  assert.equal(parseCommand('優先度の高いタスクを表示').view, 'high');
  assert.equal(parseCommand('優先度が高いタスクを見せて').view, 'high');
  const r = parseCommand('Study Groveの期限切れを表示');
  assert.deepEqual(pick(r, ['view', 'projectId']), { view: 'overdue', projectId: 'study-grove' });
});

test('現在の開発状況を教えて', () => {
  const r = parseCommand('現在の開発状況を教えて');
  assert.deepEqual(pick(r, ['intent', 'projectId', 'mutating']), { intent: 'show_status', projectId: null, mutating: false });
  assert.equal(parseCommand('ゲーム制作の進捗を教えて').projectId, 'sim-game');
});

test('開発依頼の登録（タスク追加とは別intent）', () => {
  const a = parseCommand('ゲーム制作に開発依頼を登録 セーブ機能を作る');
  assert.deepEqual(pick(a, ['intent', 'projectId', 'body']), { intent: 'add_request', projectId: 'sim-game', body: 'セーブ機能を作る' });
  const b = parseCommand('Study Groveにログイン画面を直すという開発依頼を登録');
  assert.deepEqual(pick(b, ['intent', 'projectId', 'body']), { intent: 'add_request', projectId: 'study-grove', body: 'ログイン画面を直す' });
  assert.equal(parseCommand('開発依頼を追加', { currentProjectId: 'university' }).body, '');
});

test('空・解釈不能な指示では何も実行しない', () => {
  assert.equal(parseCommand('').intent, 'empty');
  assert.equal(parseCommand('   ').intent, 'empty');
  for (const s of ['こんにちは', '天気は？', 'あああ']) {
    const r = parseCommand(s);
    assert.equal(r.intent, 'unknown', s);
    assert.equal(r.mutating, false, s);
  }
});

test('表示系の指示は変更操作にならない', () => {
  for (const s of ['今日やることを表示', 'Study Groveのタスクを表示', '期限切れのタスクを表示', '優先度の高いタスクを表示', '現在の開発状況を教えて', 'すべてのタスクを見せて']) {
    assert.equal(parseCommand(s).mutating, false, s);
  }
});

test('normalize', () => {
  assert.equal(normalize(' Ｓｔｕｄｙ　Ｇｒｏｖｅ。'), 'studygrove');
  assert.equal(normalize(null), '');
});
