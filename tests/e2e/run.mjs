// Playwright(Chromium)でのE2E。dist/ を配信して、iPad幅とスマホ幅で主要操作を確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server.mjs';
import { buildBackup, encodeImportCode } from '../../public/js/core/backup.js';
import { createReceipt, contentId } from '../../public/js/core/receipt.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', '..', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/ がありません。先に npm run build を実行してください'); process.exit(1); }

const server = await startServer({ root: dist, port: 0 });
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const results = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-e2e-'));

async function scenario(name, fn, { viewport = { width: 820, height: 1180 }, init = null, hasTouch = true, ctxOptions = {}, autoStart = true, expectErrors = [] } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch, acceptDownloads: true, locale: 'ja-JP', ...ctxOptions });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  if (init) await page.addInitScript(init);
  try {
    if (autoStart) { await page.goto(url); await page.waitForSelector('body[data-ready="true"]'); }
    await fn(page, ctx);
    const unexpected = errors.filter((e) => !expectErrors.some((re) => re.test(e)));
    assert.deepEqual(unexpected, [], `console/page errors: ${unexpected.join(' | ')}`);
    results.push([name, true]);
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`);
    await page.screenshot({ path: path.join(tmp, `${name.replace(/\W+/g, '_')}.png`) }).catch(() => {});
  } finally { await ctx.close(); }
}

const addTask = async (page, { title, project, priority, due, note }) => {
  await page.getByRole('button', { name: /タスク追加/ }).first().click();
  const dlg = page.locator('#task-dialog');
  await dlg.locator('#tf-title').fill(title);
  if (project) await dlg.locator('#tf-project').selectOption(project);
  if (priority) await dlg.locator(`input[name=tf-priority][value=${priority}]`).check({ force: true });
  if (due) await dlg.locator('#tf-due').fill(due);
  if (note) await dlg.locator('#tf-note').fill(note);
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
};
const taskTitles = (page) => page.locator('.task .title').allTextContents();
const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

console.log('E2E:', url);

await scenario('ホーム: 4プロジェクトのカードが表示される', async (page) => {
  const cards = page.locator('[data-testid^="card-"]');
  assert.equal(await cards.count(), 4);
  assert.ok(await page.locator('[data-testid=ledger-card]').isVisible(), 'ホームに家計簿カード');
  const text = await page.locator('.cards').innerText();
  for (const n of ['Study Grove', 'シミュレーションゲーム', 'Materials Informatics', '大学の勉強']) assert.ok(text.includes(n), n);
  assert.match(await cards.first().innerText(), /未完了\s*0/);
});

await scenario('タスク: 追加→編集→完了→取り消し→削除→取り消し', async (page) => {
  await page.locator('[data-testid=card-university]').click();
  await page.waitForURL(/#\/project\/university/);
  await addTask(page, { title: 'レポートを書く', priority: 'high', due: iso(0), note: '構成から' });
  assert.deepEqual(await taskTitles(page), ['レポートを書く']);
  assert.match(await page.locator('.task').first().innerText(), /今日まで/);

  await page.locator('.task-main').first().click();
  const dlg = page.locator('#task-dialog');
  await dlg.locator('#tf-title').fill('レポートを仕上げる');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  assert.deepEqual(await taskTitles(page), ['レポートを仕上げる']);

  await page.locator('.check').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 0);
  await page.locator('#toast button', { hasText: '元に戻す' }).click();
  assert.deepEqual(await taskTitles(page), ['レポートを仕上げる'], '完了の取り消し');

  await page.locator('.task-main').first().click();
  await dlg.getByRole('button', { name: '削除' }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: '削除する' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 0);
  await page.locator('#toast button', { hasText: '元に戻す' }).click();
  assert.deepEqual(await taskTitles(page), ['レポートを仕上げる'], '削除の取り消し');
});

await scenario('入力検証: 空タイトルは保存されない', async (page) => {
  await page.getByRole('button', { name: /タスク追加/ }).first().click();
  const dlg = page.locator('#task-dialog');
  await dlg.getByRole('button', { name: '保存' }).click();
  assert.match(await dlg.locator('[data-err=title]').innerText(), /タイトルを入力/);
  assert.ok(await dlg.evaluate((d) => d.open));
});

await scenario('再読み込み後もデータが残る（IndexedDB）', async (page) => {
  await addTask(page, { title: '永続化テスト', project: 'sim-game', priority: 'low' });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await page.goto(url + '#/tasks');
  assert.ok((await taskTitles(page)).includes('永続化テスト'));
  const stored = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ai-control-panel');
    r.onsuccess = () => { const g = r.result.transaction('tasks').objectStore('tasks').getAll(); g.onsuccess = () => res(g.result.length); };
  }));
  assert.equal(stored, 1);
});

await scenario('横断一覧とプロジェクト別一覧・フィルタ', async (page) => {
  await page.goto(url + '#/settings');
  await page.getByRole('button', { name: 'サンプルタスクを追加' }).click();
  await page.goto(url + '#/tasks');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 8);
  await page.locator('#proj-filter').selectOption('university');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 2);
  assert.ok((await page.locator('.task').allInnerTexts()).every((t) => t.includes('大学の勉強')));
  await page.getByRole('link', { name: '期限切れ' }).click();
  await page.waitForFunction(() => location.hash.includes('view=overdue') && document.querySelectorAll('.task').length === 0);
  assert.ok(await page.locator('.empty').isVisible(), '大学の勉強に期限切れサンプルは無い');
  await page.locator('#proj-filter').selectOption('');
  await page.waitForFunction(() => !location.hash.includes('project=') && document.querySelectorAll('.task').length === 1);
  assert.deepEqual(await taskTitles(page), ['セーブデータ形式を決める']);
  await page.getByRole('link', { name: '今日', exact: true }).click();
  await page.waitForFunction(() => location.hash.includes('view=today') && document.querySelectorAll('.task').length === 3);
  await page.goto(url + '#/');
  const first = await page.locator('[data-testid=card-study-grove]').innerText();
  assert.match(first, /未完了\s*2/);
  assert.match(first, /学習ログ画面のレイアウトを確認する/, '次にやること');
});

await scenario('JSON: 書き出し→全消去→読み込みで復元', async (page) => {
  await page.goto(url + '#/settings');
  await page.getByRole('button', { name: 'サンプルタスクを追加' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す' }).click()]);
  const file = path.join(tmp, 'backup.json');
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.app, 'ai-control-panel');
  assert.equal(data.tasks.length, 8);

  await page.getByRole('button', { name: /すべて削除/ }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: 'すべて削除' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('タスク 0件'));

  await page.locator('#import-file').setInputFiles(file);
  await page.locator('#choice-dialog').getByRole('button', { name: /置き換える/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('タスク 8件'));
  await page.reload();
  await page.goto(url + '#/tasks');
  assert.equal((await taskTitles(page)).length, 8);

  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, '{"app":"x"}');
  await page.goto(url + '#/settings');
  await page.locator('#import-file').setInputFiles(bad);
  await page.waitForFunction(() => document.querySelector('#toast')?.innerText.includes('読み込めません'));
});

await scenario('音声非対応でもテキスト指示で操作できる', async (page) => {
  await page.goto(url + '#/settings');
  await page.getByRole('button', { name: 'サンプルタスクを追加' }).click();
  await page.locator('#mic-fab').click();
  assert.ok(await page.locator('#voice-mic').isHidden(), '非対応なら話すボタンを隠す');
  assert.match(await page.locator('#voice-support').innerText(), /対応していません/);
  const say = async (text) => { await page.locator('#voice-input').fill(text); await page.locator('#voice-form button[type=submit]').click(); };

  await say('今日やることを表示');
  await page.waitForFunction(() => location.hash.includes('view=today') && document.querySelectorAll('.task').length === 3);

  await page.locator('#mic-fab').click();
  await say('大学の勉強に、レポートを書くを追加');
  assert.match(await page.locator('#voice-result').innerText(), /大学の勉強にタスクを追加：「レポートを書く」/);
  assert.equal((await page.locator('.task').allTextContents()).some((t) => t.includes('レポートを書く')), false, '確認前は追加されない');
  await page.locator('#voice-result').getByRole('button', { name: '実行する' }).click();
  await page.waitForURL(/#\/project\/university/);
  assert.ok((await taskTitles(page)).includes('レポートを書く'));

  // このタスク: 直前に追加したタスクが選択されている
  await page.locator('#mic-fab').click();
  await say('このタスクを完了にする');
  assert.match(await page.locator('#voice-result').innerText(), /対象：「レポートを書く」/);
  await page.locator('#voice-result').getByRole('button', { name: '実行する' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('.task .title')].some((el) => el.textContent === 'レポートを書く'));
  await page.getByRole('link', { name: '完了', exact: true }).click();
  await page.waitForFunction(() => location.hash.includes('view=done') && document.querySelectorAll('.task.done').length === 1);
  assert.deepEqual(await taskTitles(page), ['レポートを書く']);

  // 削除は確認が必要
  await page.locator('#mic-fab').click();
  await say('このタスクを削除して');
  assert.ok(await page.locator('#voice-result .interp.warn').count(), '削除は警告スタイルの確認カード');
  await page.locator('#voice-result').getByRole('button', { name: '削除する' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 0);

  // 対象未選択の「このタスク」は実行されない
  await page.goto(url + '#/');
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await page.locator('#mic-fab').click();
  await say('このタスクを完了にして');
  assert.match(await page.locator('#voice-result').innerText(), /対象のタスクが選ばれていません/);
  assert.equal(await page.locator('#voice-result').getByRole('button', { name: '実行する' }).count(), 0);

  await say('こんにちは');
  assert.match(await page.locator('#voice-result').innerText(), /解釈できませんでした/);
}, { init: () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); } });

await scenario('音声認識が使える場合は認識結果を解析してから実行', async (page) => {
  await page.goto(url + '#/settings');
  await page.getByRole('button', { name: 'サンプルタスクを追加' }).click();
  await page.locator('#mic-fab').click();
  assert.ok(await page.locator('#voice-mic').isVisible());
  await page.locator('#voice-mic').click();
  await page.waitForURL(/#\/tasks\?view=overdue/);
  assert.deepEqual(await taskTitles(page), ['セーブデータ形式を決める']);
}, {
  init: () => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: '期限切れのタスクを表示' }]] }); this.onend?.(); }, 30); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  },
});

await scenario('音声認識エラー時はテキスト入力を案内する', async (page) => {
  await page.locator('#mic-fab').click();
  await page.locator('#voice-mic').click();
  await page.waitForFunction(() => document.querySelector('#voice-result')?.innerText.includes('マイクの許可がありません'));
  assert.ok(await page.locator('#voice-input').isVisible());
}, {
  init: () => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 20); }
      stop() {} abort() {}
    };
  },
});

await scenario('開発依頼: 記録のみ・承認状態・実行されない', async (page) => {
  await page.locator('[data-testid=card-sim-game]').click();
  await page.getByRole('button', { name: /開発依頼を記録/ }).click();
  const dlg = page.locator('#request-dialog');
  await dlg.getByRole('button', { name: '記録する' }).click();
  assert.match(await dlg.locator('[data-err=body]').innerText(), /依頼内容/);
  await dlg.locator('#rf-body').fill('セーブ機能を作る');
  await dlg.getByRole('button', { name: '記録する' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const req = page.locator('.req').first();
  assert.match(await req.innerText(), /承認待ち[\s\S]*待機中[\s\S]*セーブ機能を作る/);
  await req.getByRole('button', { name: '承認する' }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: '承認する' }).click();
  await page.waitForFunction(() => document.querySelector('.req')?.innerText.includes('承認済み'));
  assert.match(await page.locator('.req').first().innerText(), /待機中/, '承認しても実行中・完了にはならない');
  // 依頼はタスク一覧には混ざらない
  await page.goto(url + '#/tasks?view=all');
  assert.equal((await taskTitles(page)).length, 0);
});

await scenario('スマホ幅(390px): 横スクロールなし・主要ボタンが44px以上', async (page) => {
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(await noOverflow(), 'home');
  await page.goto(url + '#/settings');
  await page.getByRole('button', { name: 'サンプルタスクを追加' }).click();
  for (const hash of ['#/', '#/tasks', '#/project/study-grove', '#/settings']) {
    await page.goto(url + hash);
    assert.ok(await noOverflow(), hash);
  }
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a.chip, .tabbar a, select')]
    .filter((el) => el.offsetParent !== null && !el.closest('dialog'))
    .map((el) => ({ n: (el.innerText || el.ariaLabel || el.tagName).slice(0, 12), h: el.getBoundingClientRect().height }))
    .filter((x) => x.h < 44));
  assert.deepEqual(small, [], `44px未満のタップ領域: ${JSON.stringify(small)}`);
  await page.goto(url + '#/');
  await page.getByRole('button', { name: /タスク追加/ }).first().click();
  const box = await page.locator('#task-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, 'ダイアログが画面内に収まる');
}, { viewport: { width: 390, height: 844 } });

await scenario('iPad縦横: ホームのカードが複数列で並ぶ', async (page) => {
  const xs = await page.locator('[data-testid^="card-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  assert.ok(new Set(xs).size >= 2, `カードが複数列: ${xs}`);
  await page.setViewportSize({ width: 1180, height: 820 });
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(ok);
});

await scenario('オフライン: Service Workerのキャッシュで再表示できる', async (page, ctx) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('[data-testid^="card-"]').count(), 4);
  await ctx.setOffline(false);
});


// ================= 家計簿・レシート =================
const FIXTURE = path.join(here, '..', 'fixtures', 'receipt-sample.png');
const yenText = (n) => `¥${n.toLocaleString('ja-JP')}`;
const openScan = async (page) => { await page.goto(url + '#/ledger'); await page.getByRole('button', { name: /レシートを読み取る/ }).click(); };
const formRows = (page) => page.locator('#receipt-dialog [data-row]').evaluateAll((rows) => rows.map((r) => ({
  name: r.querySelector('.r-name').value, amount: r.querySelector('.r-amount').value, category: r.querySelector('.r-cat').value })));

await scenario('レシート: 画像をOCR→確認→保存→家計簿に反映（端末内・外部通信なし）', async (page) => {
  const external = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
  await openScan(page);
  await page.locator('#scan-file').setInputFiles(FIXTURE);
  await page.locator('#receipt-dialog').waitFor({ state: 'visible', timeout: 120000 });
  const dlg = page.locator('#receipt-dialog');
  assert.match(await dlg.locator('[data-testid=ocr-method]').innerText(), /くっきり|標準|縦一列|従来/);
  assert.equal(await dlg.locator('#rf-date').inputValue(), '2026-10-24');
  assert.match(await dlg.locator('#rf-store').inputValue(), /スーパーまるい/);
  const rows = await formRows(page);
  assert.deepEqual(rows.map((r) => [r.name.replace(/\s+/g, ''), r.amount, r.category]), [
    ['牛乳1L', '198', '食費'], ['食パン6枚切', '148', '食費'], ['たまご10個入', '268', '食費'],
    ['トマト', '320', '食費'], ['ティッシュペーパー', '358', '日用品'], ['洗濯用洗剤', '498', '日用品'],
  ]);
  assert.equal(await dlg.locator('[data-testid=form-total]').innerText(), '¥1,790');
  assert.equal(await dlg.locator('.interp.warn').count(), 0, '合計が一致するので警告なし');
  assert.ok(await dlg.locator('details summary', { hasText: '読み取ったテキスト' }).isVisible());
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => location.hash.startsWith('#/ledger?month=2026-10'));
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥1,790');
  const cats = await page.locator('.catrow').allInnerTexts();
  assert.ok(cats.some((t) => t.includes('食費') && t.includes('¥934')), cats.join('|'));
  assert.ok(cats.some((t) => t.includes('日用品') && t.includes('¥856')), cats.join('|'));
  assert.deepEqual(external, [], `外部への通信: ${external}`);
  // 画像そのものは保存しない（レシートの項目だけ）
  const keys = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ai-control-panel');
    r.onsuccess = () => { const g = r.result.transaction('receipts').objectStore('receipts').getAll(); g.onsuccess = () => res(Object.keys(g.result[0]).sort()); };
  }));
  assert.deepEqual(keys, ['createdAt', 'date', 'id', 'items', 'rawText', 'source', 'store', 'total', 'updatedAt']);
}, { viewport: { width: 820, height: 1180 } });

await scenario('レシート: 直した分類を学習して次回から使う（テキスト貼り付け経由）', async (page) => {
  await openScan(page);
  await page.locator('#scan-dialog summary', { hasText: '貼り付け' }).click();
  await page.locator('#scan-paste').fill('ほげ商店\n2026/10/25\nトマト ¥320\nおやつ ¥100\n合計 ¥420');
  await page.getByRole('button', { name: 'このテキストを解析' }).click();
  const dlg = page.locator('#receipt-dialog');
  await dlg.waitFor({ state: 'visible' });
  let rows = await formRows(page);
  assert.deepEqual(rows.map((r) => r.category), ['食費', 'その他']);
  await dlg.locator('.r-cat').nth(1).selectOption('趣味・娯楽');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });

  await openScan(page);
  await page.locator('#scan-dialog summary', { hasText: '貼り付け' }).click();
  await page.locator('#scan-paste').fill('別の店\n2026/10/25\nおやつ ¥150\n合計 ¥150');
  await page.getByRole('button', { name: 'このテキストを解析' }).click();
  await dlg.waitFor({ state: 'visible' });
  rows = await formRows(page);
  assert.equal(rows[0].category, '趣味・娯楽', '前回直した分類が適用される');
  await dlg.getByRole('button', { name: '閉じる' }).click();
  // 設定でリセットできる
  await page.goto(url + '#/settings');
  assert.match(await page.locator('body').innerText(), /学習済み 1件/);
  await page.getByRole('button', { name: '学習内容をリセット' }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: 'リセット' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('学習済み 0件'));
});

await scenario('レシート: 手入力・検証・編集・削除と取り消し・CSV', async (page) => {
  await page.goto(url + '#/ledger');
  await page.getByRole('button', { name: '＋ 手入力' }).click();
  const dlg = page.locator('#receipt-dialog');
  await dlg.locator('#rf-store').fill('カフェ・テスト');
  await dlg.getByRole('button', { name: '保存' }).click();
  assert.match(await dlg.locator('#rf-errors').innerText(), /品目を1つ以上|品名/);
  assert.ok(await dlg.evaluate((d) => d.open), '不正なら保存されない');
  await dlg.locator('.r-name').first().fill('コーヒー');
  await dlg.locator('.r-amount').first().fill('480円');
  await dlg.locator('[data-add-row]').click();
  await dlg.locator('.r-name').nth(1).fill('=SUM(A1)');
  await dlg.locator('.r-amount').nth(1).fill('1,000');
  await dlg.locator('.r-cat').nth(1).selectOption('その他');
  assert.equal(await dlg.locator('[data-testid=form-total]').innerText(), '¥1,480');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥1,480');
  assert.ok((await page.locator('.rcp').first().innerText()).includes('カフェ・テスト'));
  assert.match(await page.locator('.catrow').first().innerText(), /その他/);

  // CSV（式として解釈される先頭文字は無効化）
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSVで書き出す/ }).click()]);
  const csvPath = path.join(tmp, 'k.csv');
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.ok(csv.startsWith('﻿日付,店名,品名,金額,分類'));
  assert.ok(csv.includes(`'=SUM(A1)`));

  // 編集
  await page.locator('.rcp-main').first().click();
  await dlg.locator('.r-amount').first().fill('500');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥1,500');

  // 月の移動
  await page.getByRole('link', { name: '前の月' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=month-total]')?.innerText === '¥0');
  assert.ok(await page.locator('.empty').isVisible());
  await page.getByRole('link', { name: '次の月' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=month-total]')?.innerText === '¥1,500');

  // 削除→取り消し
  await page.locator('.rcp-main').first().click();
  await dlg.getByRole('button', { name: '削除', exact: true }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: '削除する' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=month-total]')?.innerText === '¥0');
  await page.locator('#toast button', { hasText: '元に戻す' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=month-total]')?.innerText === '¥1,500');
  // 取り消しの保存が終わってから再読み込みする（画面は先に更新されるため）
  await page.waitForFunction(() => new Promise((res) => { const r = indexedDB.open('ai-control-panel'); r.onsuccess = () => { const g = r.result.transaction('receipts').objectStore('receipts').count(); g.onsuccess = () => { r.result.close(); res(g.result === 1); }; }; }), null, { polling: 100 });
  // 再読み込み後も残る
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥1,500');
  // ホームの家計簿カードにも反映
  await page.goto(url + '#/');
  assert.match(await page.locator('[data-testid=ledger-card]').innerText(), /¥1,500/);
});

await scenario('レシート: バックアップに含まれ、全消去→読み込みで復元される', async (page) => {
  await page.goto(url + '#/ledger');
  await page.getByRole('button', { name: '＋ 手入力' }).click();
  const dlg = page.locator('#receipt-dialog');
  await dlg.locator('.r-name').first().fill('牛乳');
  await dlg.locator('.r-amount').first().fill('198');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  await page.goto(url + '#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す' }).click()]);
  const file = path.join(tmp, 'backup2.json');
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.version, 2);
  assert.equal(data.receipts.length, 1);
  await page.getByRole('button', { name: /すべて削除/ }).click();
  await page.locator('#choice-dialog').getByRole('button', { name: 'すべて削除' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('レシート 0件'));
  await page.locator('#import-file').setInputFiles(file);
  await page.locator('#choice-dialog').getByRole('button', { name: /置き換える/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('レシート 1件'));
  await page.goto(url + '#/ledger');
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥198');
});

await scenario('旧版(IndexedDB v1)のデータを残したまま家計簿に移行できる', async (page, ctx) => {
  await page.goto(url + 'icons/icon-192.png'); // 同一オリジンでアプリを起動せずにDBを準備
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('ai-control-panel', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('tasks', { keyPath: 'id' }); r.result.createObjectStore('requests', { keyPath: 'id' }); };
    r.onsuccess = () => {
      const tx = r.result.transaction('tasks', 'readwrite');
      tx.objectStore('tasks').put({ id: 'old-1', projectId: 'university', title: '旧版で作ったタスク', note: '', priority: 'mid', due: null, done: false, doneAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
      tx.oncomplete = () => { r.result.close(); res(); };
    };
    r.onerror = () => rej(r.error);
  }));
  await page.goto(url + '#/tasks');
  await page.waitForSelector('body[data-ready="true"]');
  assert.ok((await taskTitles(page)).includes('旧版で作ったタスク'), '既存タスクが残る');
  await page.goto(url + '#/ledger');
  await page.getByRole('button', { name: '＋ 手入力' }).click();
  const dlg = page.locator('#receipt-dialog');
  await dlg.locator('.r-name').first().fill('卵');
  await dlg.locator('.r-amount').first().fill('250');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥250');
}, { autoStart: false });

await scenario('文字認識の部品を読み込めなくても、貼り付け・手入力で続けられる', async (page) => {
  await page.route('**/vendor/tesseract/**', (route) => route.abort());
  await openScan(page);
  await page.locator('#scan-file').setInputFiles(FIXTURE);
  await page.waitForFunction(() => { const e = document.querySelector('#scan-error'); return e && !e.hidden && e.innerText.includes('読み取れませんでした'); }, null, { timeout: 60000 });
  assert.match(await page.locator('#scan-error').innerText(), /貼り付け|手入力/);
  await page.getByRole('button', { name: '手入力にする' }).click();
  await page.locator('#receipt-dialog').waitFor({ state: 'visible' });
}, { ctxOptions: { serviceWorkers: 'block' }, expectErrors: [/文字認識の部品を読み込めませんでした/] });

await scenario('音声・テキスト指示で家計簿を開く／読み取りを始める', async (page) => {
  await page.locator('#mic-fab').click();
  const say = async (text) => { await page.locator('#voice-input').fill(text); await page.locator('#voice-form button[type=submit]').click(); };
  await say('今月の支出を教えて');
  await page.waitForFunction(() => location.hash.startsWith('#/ledger?month='));
  assert.match(await page.locator('#toast').innerText(), /の支出は ¥0/);
  await page.locator('#mic-fab').click();
  await say('レシートを読み取る');
  await page.locator('#scan-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#scan-dialog').innerText(), /この端末の中だけ/);
});

await scenario('スマホ幅(390px): 家計簿とフォームが収まり、タップ領域が44px以上', async (page) => {
  await page.goto(url + '#/ledger');
  await page.getByRole('button', { name: '＋ 手入力' }).click();
  const dlg = page.locator('#receipt-dialog');
  await dlg.locator('.r-name').first().fill('牛乳');
  await dlg.locator('.r-amount').first().fill('198');
  await dlg.getByRole('button', { name: '保存' }).click();
  await dlg.waitFor({ state: 'hidden' });
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(await noOverflow(), 'ledger');
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a.btn, a.catrow, .tabbar a, select')]
    .filter((el) => el.offsetParent !== null && !el.closest('dialog'))
    .map((el) => ({ n: (el.innerText || el.ariaLabel || el.tagName).slice(0, 12), h: el.getBoundingClientRect().height })).filter((x) => x.h < 44));
  assert.deepEqual(small, [], `44px未満: ${JSON.stringify(small)}`);
  await page.locator('.rcp-main').first().click();
  const box = await dlg.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, 'フォームが画面内');
  const inner = await dlg.evaluate((d) => d.scrollWidth <= d.clientWidth + 1);
  assert.ok(inner, 'フォーム内で横にはみ出さない');
  const smallIn = await dlg.evaluate((d) => [...d.querySelectorAll('button, select, input')].filter((e) => e.offsetParent && !e.classList.contains('sr-only')).map((e) => ({ n: e.className, h: e.getBoundingClientRect().height })).filter((x) => x.h < 44));
  assert.deepEqual(smallIn, [], `フォーム内44px未満: ${JSON.stringify(smallIn)}`);
}, { viewport: { width: 390, height: 844 } });


await scenario('コードで読み込む: Claudeが作ったレシートを貼り付けて追加（重複しない・不正なコードは拒否）', async (page) => {
  const input = { date: '2026-10-24', store: 'コンビニ', items: [{ name: 'おにぎり', amount: 160, category: '食費' }, { name: '電池', amount: 440, category: '雑費' }] };
  const receipt = createReceipt({ ...input, source: 'claude' }, new Date(), contentId(input)).receipt;
  const code = encodeImportCode(buildBackup({ receipts: [receipt] }));
  const importCode = async (text) => {
    await page.goto(url + '#/settings');
    await page.getByRole('button', { name: 'コードで読み込む…' }).click();
    await page.locator('#import-text').fill(text);
    await page.getByRole('button', { name: '内容を確認' }).click();
  };
  await importCode('これはコードではありません');
  assert.match(await page.locator('#import-err').innerText(), /読み込みコード/);
  await page.locator('#import-dialog [data-close]').click();

  await importCode(code.slice(0, 40) + '\n' + code.slice(40)); // 途中で改行が入っても読める
  await page.locator('#choice-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#choice-dialog').innerText(), /レシート1件[\s\S]*コンビニ[\s\S]*¥600/);
  await page.locator('#choice-dialog').getByRole('button', { name: '追加する' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/ledger?month=2026-10'));
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥600');
  const cats = await page.locator('.catrow').allInnerTexts();
  assert.ok(cats.some((t) => t.includes('雑費') && t.includes('¥440')), cats.join('|'));
  assert.ok(cats.some((t) => t.includes('食費') && t.includes('¥160')), cats.join('|'));

  // 同じコードをもう一度読み込んでも重複しない
  await importCode(code);
  await page.locator('#choice-dialog').getByRole('button', { name: '追加する' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/ledger?month=2026-10'));
  assert.equal(await page.locator('[data-testid=month-total]').innerText(), '¥600');
  assert.equal(await page.locator('.rcp').count(), 1);
});


await scenario('読み取り設定: モードを選ぶと保存され、再読み込み後も残る。標準モードでも読み取れる', async (page) => {
  await page.goto(url + '#/settings');
  const panel = page.locator('[data-testid=ocr-settings]');
  assert.ok(await panel.locator('input[name=ocr-mode][value=auto]').isChecked(), '既定は自動');
  assert.ok(await panel.locator('#ocr-crop').isChecked(), '紙の切り出しは既定でオン');
  await panel.locator('label.opt', { hasText: '標準' }).click();
  await panel.locator('label.opt', { hasText: '紙の部分を自動で切り出す' }).click();
  await page.waitForFunction(() => document.querySelector('#toast')?.innerText.includes('読み取り設定を保存しました（標準）'));
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.ok(await panel.locator('input[name=ocr-mode][value=plain]').isChecked());
  assert.equal(await panel.locator('#ocr-crop').isChecked(), false);
  // 読み取りシートに現在のモードが出る
  await page.goto(url + '#/ledger');
  await page.getByRole('button', { name: /レシートを読み取る/ }).click();
  assert.match(await page.locator('[data-testid=scan-mode]').innerText(), /標準/);
  // 標準・切り出しなしでも、きれいな画像は読める
  await page.locator('#scan-file').setInputFiles(FIXTURE);
  await page.locator('#receipt-dialog').waitFor({ state: 'visible', timeout: 120000 });
  assert.match(await page.locator('[data-testid=ocr-method]').innerText(), /従来|標準/);
  assert.equal(await page.locator('#receipt-dialog [data-testid=form-total]').innerText(), '¥1,790');
});

await browser.close();
server.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\nE2E: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — 失敗時のスクリーンショット: ${tmp}` : ''}`);
if (!failed.length) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
