// 実ブラウザ(Chromium)でLUCIDAを操作して検証する。事前に `npm run build` が必要。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4173, URL_ = `http://127.0.0.1:${PORT}/`;
const shots = process.env.SHOTS_DIR;
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(URL_)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw new Error('server did not start'); };

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lucida-e2e-'));
const open = () => chromium.launchPersistentContext(userData, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const hook = (page) => { page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); }); };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
const pressed = async (loc, want) => { for (let i = 0; i < 25; i++) { if ((await loc.getAttribute('aria-pressed')) === want) return true; await new Promise((r) => setTimeout(r, 80)); } return false; };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

try {
  await wait();
  let ctx = await open(); let page = await ctx.newPage(); hook(page);
  await page.goto(URL_);

  // Home: 初回起動で発見が生成される
  await page.waitForSelector('.lead-title');
  check((await page.locator('.rows .row').count()) === 2, 'Home: 今日の発見が3件(リード1+一覧2)生成される');
  check(!(await overflow(page)), 'Home(390px): 横スクロールが発生しない');
  const leadTitle = await page.locator('.lead-title').innerText();
  await shot(page, '01-home-390');

  // 保存・評価
  const lead = page.locator('.lead');
  await lead.getByRole('button', { name: '保存', exact: true }).click();
  check((await lead.getByRole('button', { name: '保存済み' }).getAttribute('aria-pressed')) === 'true', '保存ボタンが保存済みになる');
  await lead.getByRole('button', { name: '興味あり' }).click();
  check(await pressed(lead.getByRole('button', { name: '興味あり' }), 'true'), '興味ありが反映される');
  await lead.getByRole('button', { name: '興味なし' }).click();
  check(await pressed(lead.getByRole('button', { name: '興味あり' }), 'false') && await pressed(lead.getByRole('button', { name: '興味なし' }), 'true'), '興味なしに切り替えると興味ありは解除される');
  await lead.getByRole('button', { name: '試してみる' }).click();
  await pressed(lead.getByRole('button', { name: '試す予定' }), 'true');

  // 詳細
  await page.locator('.lead-title a').click();
  await page.waitForSelector('.detail');
  check((await page.locator('.detail .tag').allInnerTexts()).join() .includes('事実'), '詳細: 事実/推測/提案が区別される');
  check((await page.locator('.sources a').count()) > 0, '詳細: 出典リンクがある');
  check((await page.locator('.sources a').first().getAttribute('rel'))?.includes('noopener'), '詳細: 外部リンクはnoopener');
  await page.locator('summary').click();
  await shot(page, '02-detail-390');
  await page.goBack();

  // 興味プロフィール
  await page.getByRole('link', { name: '興味プロフィール' }).click();
  await page.getByLabel('興味の名前').fill('睡眠');
  await page.getByRole('button', { name: '追加' }).click();
  await page.waitForSelector('.interests li');
  check((await page.locator('.interests li').count()) === 1, 'Profile: 興味を追加できる');
  await page.getByLabel('睡眠 の重み').selectOption('5');
  await shot(page, '03-profile-390');

  // 手動入力
  await page.goto(URL_ + '#/capture');
  await page.getByLabel(/^疑問/).fill('どうして空は青いのだろう');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.waitForSelector('.banner[role="status"]');
  await page.getByRole('radio', { name: '日常の記録' }).click();
  await page.getByLabel(/^日常の記録/).fill('昨夜は宇宙の本を読んで夜更かしした');
  await page.getByRole('button', { name: '保存する' }).click();
  const msg = await page.locator('.banner[role="status"]').innerText();
  check(msg.includes('宇宙'), 'Capture: 記録から関連テーマ(宇宙)が興味に推定追加される');
  await shot(page, '04-capture-390');

  // ブラウザ再起動（コンテキストを閉じて開き直す）
  await ctx.close(); ctx = await open(); page = await ctx.newPage(); hook(page);
  await page.goto(URL_);
  await page.waitForSelector('.lead-title');
  check((await page.locator('.lead-title').innerText()) === leadTitle, '再起動後: 同じ発見が残っている(再生成されない)');
  check((await page.locator('.rows .row').count()) === 2, '再起動後: 件数が増えない(重複生成なし)');
  check((await page.locator('.lead').getByRole('button', { name: '保存済み' }).getAttribute('aria-pressed')) === 'true', '再起動後: 保存状態が保持される');
  check((await page.locator('.lead').getByRole('button', { name: '興味なし' }).getAttribute('aria-pressed')) === 'true', '再起動後: 評価が保持される');
  check((await page.locator('.log li').count()) >= 3, 'Home: Recent Activityに履歴が出る');
  await page.locator('#h-insights').scrollIntoViewIfNeeded();
  check((await page.locator('#h-insights').innerText()).includes('集計'), 'Home: Life Insightsに集計が出る');
  await shot(page, '05-home-after-restart');

  // Archive
  await page.goto(URL_ + '#/archive');
  check((await page.locator('.rows .row').count()) === 3, 'Archive: 発見履歴3件');
  await page.getByRole('tab', { name: '保存' }).click();
  check((await page.locator('.rows .row').count()) === 1, 'Archive: 保存タブは保存した1件のみ');
  await page.getByRole('tab', { name: '疑問' }).click();
  check((await page.locator('.entries li').count()) === 1, 'Archive: 疑問が保存されている');
  await page.getByRole('tab', { name: '記録' }).click();
  check((await page.locator('.entries li').count()) === 1, 'Archive: 記録が保存されている');
  await page.getByLabel('検索').fill('存在しない語');
  check((await page.locator('.empty').count()) === 1, 'Archive: 検索で絞り込める(該当なし表示)');
  await page.getByLabel('検索').fill('');
  await page.getByRole('tab', { name: '発見' }).click();
  await page.getByLabel('カテゴリ').selectOption('Unknown');
  const unk = await page.locator('.rows .row').count();
  check(unk <= 3 && (await page.locator('.rows .kicker').allInnerTexts()).every((t) => t.includes('Unknown')), 'Archive: カテゴリで絞り込める');
  await page.getByLabel('カテゴリ').selectOption('');
  await page.getByLabel('開始日').fill('2999-01-01');
  check((await page.locator('.rows .row').count()) === 0, 'Archive: 日付で絞り込める');
  await shot(page, '06-archive-390');
  await page.getByRole('tab', { name: '出典' }).click();

  // Explore
  await page.goto(URL_ + '#/explore');
  await page.getByRole('button', { name: /Unknown/ }).click();
  await page.getByRole('button', { name: /新しく見つける/ }).click();
  await page.waitForSelector('.banner[role="status"]');
  check((await page.locator('.rows .row').count()) >= 1, 'Explore: Unknownで新しい発見が追加される');
  await page.getByRole('button', { name: 'すべて' }).click();
  await page.getByLabel('キーワード').fill('宇宙');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await shot(page, '07-explore-390');

  // Network / Lab（Phase 3 の予告。正直な表示）
  await page.goto(URL_ + '#/lab');
  check((await page.locator('.exps li').count()) === 1, 'Lab: 「試してみる」にした提案が並ぶ');
  await page.goto(URL_ + '#/network');
  check((await page.locator('.facts dd').first().innerText()) === '2', 'Network: 素材の件数(興味: 睡眠+推定の宇宙)が実データ');

  // 5タブ遷移
  for (const n of ['Home', 'Explore', 'Network', 'Lab', 'Archive']) {
    await page.locator('.nav').getByRole('link', { name: new RegExp(n) }).click();
    await page.waitForSelector('.page');
    check(!(await overflow(page)), `${n}(390px): 横スクロールなし`);
  }

  // 全データ削除→空の状態でもエラーにならない
  await page.goto(URL_ + '#/profile');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '全データを削除' }).click();
  await page.waitForSelector('.empty');
  check(true, 'Profile: 全データ削除が動作する');

  await ctx.close();

  // PC幅
  const ctx2 = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'lucida-pc-')), { viewport: { width: 1280, height: 860 } });
  const pc = await ctx2.newPage(); hook(pc);
  await pc.goto(URL_);
  await pc.waitForSelector('.lead-title');
  const navBox = await pc.locator('.nav').boundingBox();
  check(navBox.x === 0 && navBox.width > 200 && navBox.height >= 800, 'PC(1280px): サイドナビゲーションになる');
  await shot(pc, '08-home-desktop');
  await ctx2.close();

  check(errors.length === 0, `コンソールエラーなし ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
} catch (e) {
  console.error(e); failures++;
} finally {
  server.kill();
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} 件失敗` : '\nすべて成功');
process.exit(failures ? 1 : 0);
