import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../public/js/core/model.js';
import * as R from '../../public/js/core/receipt.js';
import { buildBackup, parseBackup, encodeImportCode, decodeImportText, IMPORT_PREFIX } from '../../public/js/core/backup.js';

const NOW = new Date('2026-10-24T09:00:00');
const TODAY = '2026-10-24';
const mk = (o = {}) => M.createTask({ projectId: 'study-grove', title: 'タスク', ...o }, NOW, o.id || M.newId()).task;

test('バックアップ: 書き出し→読み込みで同一内容', () => {
  const tasks = [mk({ id: 'a', title: '日本語タイトル', due: TODAY, note: 'メモ' }), M.setDone(mk({ id: 'b', title: 'b' }), true, NOW)];
  const requests = [M.createRequest({ projectId: 'university', body: '依頼' }, NOW, 'req-1').request];
  const receipts = [R.createReceipt({ date: TODAY, store: 'まるい', items: [{ name: '牛乳', amount: 198, category: '食費' }] }, NOW, 'rcp-1').receipt];
  const rules = [R.makeRule('牛乳', '食費', NOW)];
  const text = JSON.stringify(buildBackup({ tasks, requests, receipts, rules }, NOW));
  const r = parseBackup(text, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.tasks, tasks);
  assert.deepEqual(r.requests, requests);
  assert.deepEqual(r.receipts, receipts);
  assert.deepEqual(r.rules, rules);
  assert.deepEqual(r.warnings, []);
});

test('バックアップ: 不正データを拒否・サニタイズ', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('{"app":"other"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'ai-control-panel', version: 99, tasks: [], requests: [] })).ok, false);
  const bad = {
    app: 'ai-control-panel', version: 1, requests: [{ id: 'r', projectId: 'nope', body: 'x' }],
    tasks: [
      { id: '1', projectId: 'study-grove', title: 'ok', priority: 'weird', due: '2026-99-99' },
      { id: '1', projectId: 'study-grove', title: 'dup' },
      { id: '2', projectId: 'ghost', title: 'unknown project' },
      { id: '3', projectId: 'study-grove', title: '' },
      null,
    ],
  };
  const r = parseBackup(JSON.stringify(bad), NOW);
  assert.ok(r.ok);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].priority, 'mid');
  assert.equal(r.tasks[0].due, null);
  assert.equal(r.requests.length, 0);
  assert.ok(r.warnings.length >= 4);
});


test('旧形式（v1・レシートなし）のバックアップも読み込める', () => {
  const v1 = { app: 'ai-control-panel', version: 1, tasks: [{ id: 't', projectId: 'study-grove', title: '旧データ' }], requests: [] };
  const r = parseBackup(JSON.stringify(v1), NOW);
  assert.ok(r.ok);
  assert.equal(r.tasks.length, 1);
  assert.deepEqual(r.receipts, []);
  assert.deepEqual(r.rules, []);
});

test('v2: 不正なレシート・ルールはスキップして警告する', () => {
  const bad = {
    app: 'ai-control-panel', version: 2, tasks: [], requests: [],
    receipts: [
      { id: 'ok', date: TODAY, store: 's', items: [{ name: 'a', amount: 1, category: '食費' }] },
      { id: 'ok', date: TODAY, store: 'dup', items: [{ name: 'a', amount: 1, category: '食費' }] },
      { id: 'bad', date: 'x', items: [] },
      '壊れている',
    ],
    rules: [{ id: 'k', category: '存在しない' }, { id: 'k2', category: '食費', name: 'ok' }],
  };
  const r = parseBackup(JSON.stringify(bad), NOW);
  assert.ok(r.ok);
  assert.equal(r.receipts.length, 1);
  assert.equal(r.rules.length, 1);
  assert.equal(r.warnings.length, 4);
  assert.equal(parseBackup(JSON.stringify({ app: 'ai-control-panel', version: 2, tasks: [], requests: [] })).ok, false, 'v2でreceipts/rulesが無い形式は拒否');
});

test('読み込みコード: 日本語・長い内容でも往復で同一', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ name: `日本語の品名その${i}`, amount: 100 + i, category: i % 2 ? '食費' : '雑費' }));
  const receipt = R.createReceipt({ date: TODAY, store: 'スーパー〇〇', items, source: 'claude' }, NOW, R.contentId({ date: TODAY, store: 'スーパー〇〇', items })).receipt;
  const code = encodeImportCode(buildBackup({ receipts: [receipt] }, NOW));
  assert.ok(code.startsWith(IMPORT_PREFIX));
  assert.ok(!/\s/.test(code), 'コードに空白・改行を含まない');
  const dec = decodeImportText(code);
  assert.ok(dec.ok);
  const back = parseBackup(dec.json, NOW);
  assert.ok(back.ok);
  assert.deepEqual(back.receipts, [receipt]);
  assert.equal(back.receipts[0].source, 'claude');
});

test('読み込みコード: 改行や空白が混ざっても読める／壊れたコードは理由つきで拒否', () => {
  const code = encodeImportCode(buildBackup({}, NOW));
  const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20)}  `;
  assert.ok(decodeImportText(wrapped).ok);
  assert.equal(decodeImportText('').ok, false);
  assert.equal(decodeImportText('こんにちは').ok, false);
  assert.equal(decodeImportText(`${IMPORT_PREFIX}@@@壊れ`).ok, false);
  assert.equal(decodeImportText(`${IMPORT_PREFIX}${btoa('\xff\xfe')}`).ok, false, '不正なUTF-8');
  assert.ok(decodeImportText('{"app":"ai-control-panel"}').ok, 'JSONそのままも可');
});
