import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../../public/js/core/voice.js';

// [入力, 文脈, 期待する項目]。言い回しを増やすときはここに足す。
const CASES = [
  // 今日
  ['今日のタスクを教えて', {}, {intent:'show_tasks', view:'today'}],
  ['今日のやることは？', {}, {intent:'show_tasks', view:'today'}],
  ['今日やることある？', {}, {intent:'show_tasks', view:'today'}],
  ['今日のタスク', {}, {intent:'show_tasks', view:'today'}],
  ['きょうやるべきこと', {}, {intent:'show_tasks', view:'today'}],
  ['今日の予定を見せて', {}, {intent:'show_tasks', view:'today'}],
  ['Study Groveの今日のタスクを表示', {}, {intent:'show_tasks', view:'today', projectId:'study-grove'}],
  // 期限切れ
  ['期限が過ぎているタスクを教えて', {}, {view:'overdue'}],
  ['遅れているタスクは？', {}, {view:'overdue'}],
  ['締め切りを過ぎたものを表示', {}, {view:'overdue'}],
  ['期限切れ', {}, {view:'overdue'}],
  ['大学の勉強の期限切れを見せて', {}, {view:'overdue', projectId:'university'}],
  // 優先度
  ['重要なタスクを表示', {}, {view:'high'}],
  ['優先度高のタスクを見せて', {}, {view:'high'}],
  ['急ぎのタスクを教えて', {}, {view:'high'}],
  ['大事なタスクは？', {}, {view:'high'}],
  ['ゲーム制作の優先度が高いものを表示', {}, {view:'high', projectId:'sim-game'}],
  // 全体・未完了・完了
  ['全部のタスクを見せて', {}, {intent:'show_tasks', view:'open'}],
  ['すべてのタスクを表示して', {}, {intent:'show_tasks'}],
  ['残っているタスクを教えて', {}, {intent:'show_tasks', view:'open'}],
  ['やり残しを表示', {}, {intent:'show_tasks', view:'open'}],
  ['終わったタスクを見せて', {}, {view:'done'}],
  ['完了済みのタスクを表示', {}, {view:'done'}],
  ['完了したものを見たい', {}, {view:'done'}],
  // プロジェクト表示
  ['Study Groveを開いて', {}, {intent:'show_project', projectId:'study-grove'}],
  ['スタディグローブ', {}, {intent:'show_project', projectId:'study-grove'}],
  ['ゲームのタスクは？', {}, {intent:'show_project', projectId:'sim-game'}],
  ['マテリアルズインフォマティクスに移動', {}, {intent:'show_project', projectId:'materials-informatics'}],
  ['大学の勉強へ行って', {}, {intent:'show_project', projectId:'university'}],
  ['大学の勉強の画面を開く', {}, {intent:'show_project', projectId:'university'}],
  // 状況
  ['今の状況を教えて', {}, {intent:'show_status'}],
  ['進捗はどう？', {}, {intent:'show_status'}],
  ['どこまで進んだ？', {}, {intent:'show_status'}],
  ['開発状況を見せて', {}, {intent:'show_status'}],
  ['Study Groveの進み具合は？', {}, {intent:'show_status', projectId:'study-grove'}],
  ['ホームに戻る', {}, {intent:'show_status'}],
  // 追加
  ['大学の勉強にレポートを書くタスクを追加', {}, {intent:'add_task', projectId:'university', title:'レポートを書く'}],
  ['ゲーム制作にバランス調整を追加して', {}, {intent:'add_task', projectId:'sim-game', title:'バランス調整'}],
  ['タスクを追加 英語の宿題', {currentProjectId:'university'}, {intent:'add_task', title:'英語の宿題'}],
  ['新しいタスク、論文を読む、をMaterials Informaticsに追加', {}, {intent:'add_task', projectId:'materials-informatics', title:'論文を読む'}],
  ['Study Groveに復習機能の設計を入れておいて', {}, {intent:'add_task', projectId:'study-grove', title:'復習機能の設計'}],
  ['大学の勉強に統計学の課題を追加してほしい', {}, {intent:'add_task', title:'統計学の課題'}],
  ['大学の勉強にレポートを書くを追加しておいて', {}, {title:'レポートを書く'}],
  ['メモ：牛乳を買う', {currentProjectId:'university'}, {intent:'add_task', title:'牛乳を買う'}],
  ['大学の勉強のタスクにレポート提出を追加', {}, {intent:'add_task', projectId:'university', title:'レポート提出'}],
  ['大学の勉強に、レポートを書くタスクを作って', {}, {title:'レポートを書く'}],
  ['やることに英単語の暗記を追加 大学の勉強', {}, {intent:'add_task', projectId:'university'}],
  // 完了
  ['これを完了にして', {}, {intent:'complete_task'}],
  ['このタスク終わった', {}, {intent:'complete_task'}],
  ['完了にして', {}, {intent:'complete_task'}],
  ['このタスクを済みにして', {}, {intent:'complete_task'}],
  ['これ終わったよ', {}, {intent:'complete_task'}],
  ['このタスクをチェックして', {}, {intent:'complete_task'}],
  ['このタスクを未完了に', {}, {intent:'uncomplete_task'}],
  ['このタスクをもう一度やる', {}, {intent:'uncomplete_task'}],
  // 削除
  ['このタスクを削除', {}, {intent:'delete_task'}],
  ['これを消して', {}, {intent:'delete_task'}],
  ['このタスクを取り消して', {}, {intent:'delete_task'}],
  // 依頼
  ['ゲーム制作に開発依頼、セーブ機能を作って', {}, {intent:'add_request', projectId:'sim-game', body:'セーブ機能を作って'}],
  ['Study Groveにバグ修正を依頼', {}, {intent:'add_request', projectId:'study-grove'}],
  ['開発依頼を登録：ログイン画面を直す', {currentProjectId:'study-grove'}, {intent:'add_request', body:'ログイン画面を直す'}],
  ['Claudeに依頼 テストを追加して', {currentProjectId:'sim-game'}, {intent:'add_request'}],
  // 誤作動しないこと
  ['タスクを追加した履歴を見せて', {}, {mutating:false}],
  ['完了を表示', {}, {mutating:false}],
  ['今日は天気がいい', {}, {intent:'unknown'}],
  ['', {}, {intent:'empty'}],

  // 追加の反例（タイトルに表示系・確認系の語が入っていても、文末が追加の動詞なら追加として扱う）
  ['大学の勉強にレポートを確認するを追加', {}, {intent:'add_task', projectId:'university', title:'レポートを確認する', mutating:true}],
  ['ゲーム制作にログ表示機能を追加して', {}, {intent:'add_task', projectId:'sim-game', title:'ログ表示機能'}],
  ['Study Groveに進捗レポートの作成を追加', {}, {intent:'add_task', projectId:'study-grove', title:'進捗レポートの作成'}],
  // 変更操作にならないこと
  ['タスクを削除した履歴を見せて', {}, {mutating:false}],
  ['今日の予定は？', {}, {intent:'show_tasks', view:'today', mutating:false}],
  ['Study Groveの状況は？', {}, {intent:'show_status', projectId:'study-grove', mutating:false}],
  ['天気を教えて', {}, {mutating:false}],
];

for (const [text, ctx, expected] of CASES) {
  test(`言い回し: ${text || '(空)'}`, () => {
    const r = parseCommand(text, ctx);
    for (const [k, v] of Object.entries(expected)) assert.equal(r[k], v, `${k}: ${JSON.stringify(r)}`);
  });
}

test('どの言い回しでも、表示・移動の指示は変更操作にならない', () => {
  for (const [text, , exp] of CASES) {
    if (exp.intent && /^(show_|unknown|empty)/.test(exp.intent)) assert.equal(parseCommand(text).mutating, false, text);
  }
});

// ---- 家計簿・レシート ----
const LEDGER_CASES = [
  ['今月の支出を教えて', {}, { intent: 'show_ledger', month: 'this', category: null, mutating: false }],
  ['家計簿を表示', {}, { intent: 'show_ledger', month: 'this' }],
  ['先月の家計簿を見せて', {}, { intent: 'show_ledger', month: 'last' }],
  ['今月の食費はいくら？', {}, { intent: 'show_ledger', category: '食費', month: 'this' }],
  ['食費を教えて', {}, { intent: 'show_ledger', category: '食費' }],
  ['先月の交通費を表示', {}, { intent: 'show_ledger', category: '交通費', month: 'last' }],
  ['いくら使ったか教えて', {}, { intent: 'show_ledger' }],
  ['レシートを読み取る', {}, { intent: 'scan_receipt', mutating: false }],
  ['レシートをスキャンして', {}, { intent: 'scan_receipt' }],
  ['レシートを追加', {}, { intent: 'scan_receipt' }],
  ['レシートを撮りたい', {}, { intent: 'scan_receipt' }],
  // 家計簿という語を含むタスク追加は、タスクとして扱う
  ['大学の勉強に家計簿を見直すを追加', {}, { intent: 'add_task', projectId: 'university', title: '家計簿を見直す' }],
  ['ゲーム制作にレシート機能を作るタスクを追加して', {}, { intent: 'add_task', projectId: 'sim-game' }],
];
for (const [text, ctx, expected] of LEDGER_CASES) {
  test(`家計簿の言い回し: ${text}`, () => {
    const r = parseCommand(text, ctx);
    for (const [k, v] of Object.entries(expected)) assert.equal(r[k], v, `${k}: ${JSON.stringify(r)}`);
  });
}
