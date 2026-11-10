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
const idbAll = (page, store) => page.evaluate((store) => new Promise((res, rej) => {
  const r = indexedDB.open('lucida');
  r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => { r.result.close(); res(q.result); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
}), store);
const dayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

try {
  await wait();
  let ctx = await open(); let page = await ctx.newPage(); hook(page);
  await page.goto(URL_);

  // 初回の案内: テーマを選ぶ(または選ばずに始める)まで、発見は生成されない
  await page.waitForSelector('.intro');
  check((await page.locator('.lead-title').count()) === 0 && (await idbAll(page, 'discoveries')).length === 0, '初回: 案内が出て、始めるまで発見は生成されない');
  await shot(page, '00-intro-390');
  await page.getByRole('button', { name: '選ばずに始める' }).click();

  // Home: 始めると発見が生成される
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
  await page.getByText('なぜこの発見が選ばれたか').click();
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

  // ---- Phase 3: Lab（仮説→記録→結果→分析→Networkへ） ----
  await page.goto(URL_ + '#/lab');
  check((await page.locator('.exps li').count()) === 1, 'Lab: 「試してみる」にした提案が「試す予定」に並ぶ');
  await page.getByRole('button', { name: '実験にする' }).click();
  await page.waitForSelector('.exp-form');
  check((await page.locator('#x-title').inputValue()) === leadTitle.slice(0, 80) && (await page.locator('#x-plan').inputValue()).length > 0, 'Lab: 発見から実験を作ると、名前と行動計画が入る');
  await page.locator('#x-to').fill(dayKey(-2));
  await page.getByRole('button', { name: '実験を始める' }).click();
  await page.waitForSelector('.exp-form .banner.error');
  check((await page.locator('.exp-form .banner.error').innerText()).includes('終了日'), 'Lab: 終了日が開始日より前だと保存されず、理由が出る');
  await page.locator('#x-to').fill(dayKey(6));
  await page.locator('#x-hyp').fill('これを1週間続けると、変化に気づけるはず');
  await shot(page, '10-lab-form-390');
  await page.getByRole('button', { name: '実験を始める' }).click();
  await page.waitForSelector('.detail .page-title');
  check((await page.locator('.detail .kicker').first().innerText()).includes('進行中'), 'Lab: 実験が作成され「進行中」になる');
  await page.goto(URL_ + '#/lab');
  await page.waitForSelector('.rows .row');
  check((await page.locator('.exps li').count()) === 0, 'Lab: 実験にした提案は「試す予定」から外れる');
  await page.locator('.rows .row a').first().click();
  await page.waitForSelector('.detail .page-title');

  await page.locator('#l-text').fill('朝に試した');
  await page.locator('#l-rating').selectOption('4');
  await page.getByRole('button', { name: '記録する', exact: true }).click();
  await page.waitForSelector('.exp-logs li');
  await page.locator('#l-day').fill(dayKey(-1));
  await page.getByRole('radio', { name: 'できなかった' }).click();
  await page.getByRole('button', { name: '記録する', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exp-logs li').length === 2);
  check(true, 'Lab: 実施記録を追加できる(できた/できなかった・手応え・メモ)');

  await page.getByRole('radio', { name: '仮説は支持された', exact: true }).click();
  await page.locator('#r-text').fill('思ったより続けやすかった');
  await page.getByRole('button', { name: '結果を保存して完了にする' }).click();
  await page.waitForFunction(() => document.querySelector('.detail .kicker')?.textContent?.includes('完了'));
  check(true, 'Lab: 結果を入力すると「完了」になる');

  await page.getByRole('button', { name: '分析する', exact: true }).click();
  await page.waitForSelector('.analysis');
  const an = await page.locator('.analysis').innerText();
  check(an.includes('集計') && an.includes('提案') && an.includes('因果関係'), 'Lab: 分析が事実(集計)・提案に分かれ、注意書きが付く');
  check(an.includes('記録は2件') && an.includes('仮説は支持された'), 'Lab: 分析の集計が、入力した記録・結果と一致する');
  await page.getByRole('button', { name: '結果をNetworkに追加する' }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('Networkに追加'));
  await shot(page, '11-lab-detail-390');
  check(!(await overflow(page)), 'Lab詳細(390px): 横スクロールなし');
  await page.reload();
  await page.waitForSelector('.analysis');
  check((await page.locator('.exp-logs li').count()) === 2, 'Lab: 再読み込み後も記録・結果・分析が残る');

  // ---- Phase 3: Network ----
  for (const q of ['睡眠はなぜ必要なのか', '宇宙の果てはあるのか']) {
    await page.goto(URL_ + '#/capture');
    await page.locator('#body').fill(q);
    await page.getByRole('button', { name: '保存する' }).click();
    await page.waitForSelector('.banner[role="status"]');
  }
  await page.goto(URL_ + '#/network');
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(700); // 初期配置の保存と fitView を待つ
  const nodeCount = await page.locator('.react-flow__node').count();
  check(nodeCount >= 7, `Network: ノードが表示される(${nodeCount}個)`);
  check(new Set(await page.locator('.kn-type').allInnerTexts()).size === 5, 'Network: 5種類のノード(テーマ・発見・疑問・気づき・実験)が区別される');
  check((await page.locator('.react-flow__edge').count()) >= 2, 'Network: 実験の「きっかけ」「結果」がエッジとして描かれる');
  check(!(await overflow(page)), 'Network(390px): 横スクロールなし');
  // 見た目の検証: 読めないほど縮小されていないこと、画面内にノードが実際に見えていること
  const view = await page.evaluate(() => {
    const scale = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a;
    const box = document.querySelector('.net-canvas').getBoundingClientRect();
    const inView = [...document.querySelectorAll('.react-flow__node')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
    }).length;
    const label = document.querySelector('.kn-label').getBoundingClientRect().height;
    return { scale, inView, label };
  });
  check(view.scale >= 0.79 && view.label >= 13, `Network(390px): 文字が読める大きさで表示される(倍率 ${view.scale.toFixed(2)})`);
  check(view.inView >= 2, `Network(390px): 開いた時点でノードが画面内に見えている(${view.inView}個)`);
  await shot(page, '12-network-390');
  const layout = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map((n) => [n.getAttribute('data-id'), n.style.transform])));
  const before3 = await layout();
  await page.reload();
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(500);
  check(JSON.stringify(await layout()) === JSON.stringify(before3), 'Network: 再読み込みしても配置が変わらない(位置が保存される)');

  const sug0 = await page.locator('.sug').count();
  check(sug0 >= 2, `Network: 関連づけの候補が出る(${sug0}件)`);
  const edges0 = await page.locator('.react-flow__edge').count();
  await page.locator('.sug').first().getByRole('button', { name: 'つなぐ' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.react-flow__edge').length === n + 1, edges0);
  check((await page.locator('.sug').count()) === sug0 - 1, 'Network: 候補を承認するとエッジになり、候補から消える');
  await page.locator('.sug').first().getByRole('button', { name: '違う' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.sug').length === n, sug0 - 2);
  await page.reload();
  await page.waitForSelector('.react-flow__node');
  check((await page.locator('.sug').count()) === sug0 - 2 && (await page.locator('.react-flow__edge').count()) === edges0 + 1, 'Network: 却下した候補は再提案されない');

  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.getByRole('button', { name: '睡眠', exact: true }).click();
  await page.waitForSelector('.node-detail');
  check((await page.locator('.node-title').innerText()) === '睡眠', 'Network: ノードを選ぶと詳細が出る');
  check(((await page.locator('.node-detail').getByRole('link', { name: /から探索する/ }).getAttribute('href')) ?? '').includes('explore?q='), 'Network: ノードから新しい探索を開始できる');
  await shot(page, '13-network-list-390');

  await page.locator('#nn-label').fill('読書メモ');
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.node-title')?.textContent === '読書メモ');
  await page.locator('#lk-t').selectOption({ label: 'テーマ: 睡眠' });
  await page.locator('#lk-r').fill('きっかけ');
  await page.locator('.link-form').getByRole('button', { name: 'つなぐ' }).click();
  await page.waitForSelector('.links li');
  check((await page.locator('.links li').innerText()).includes('睡眠'), 'Network: 自分でノードを追加し、関係をつけて結べる');
  await page.getByRole('button', { name: 'このノードを削除' }).click();
  await page.waitForFunction(() => !document.querySelector('.node-detail'));
  check((await page.getByRole('button', { name: '読書メモ', exact: true }).count()) === 0, 'Network: 自分で追加したノードを削除できる');

  await page.getByRole('button', { name: '睡眠', exact: true }).click();
  await page.getByRole('button', { name: /Networkから外す/ }).click();
  await page.getByRole('button', { name: /非表示の1件を戻す/ }).waitFor();
  const interestsKept = (await idbAll(page, 'interests')).some((i) => i.name === '睡眠');
  check((await page.getByRole('button', { name: '睡眠', exact: true }).count()) === 0 && interestsKept, 'Network: ノードを外しても、元の興味は消えない');
  await page.getByRole('button', { name: /非表示の1件を戻す/ }).click();
  await page.getByRole('button', { name: '睡眠', exact: true }).waitFor();
  check(true, 'Network: 外したノードを戻せる');

  await page.goto(URL_ + '#/archive');
  await page.getByRole('tab', { name: '実験' }).click();
  check((await page.locator('.entries li').count()) === 1 && (await page.locator('.entries li').innerText()).includes('思ったより続けやすかった'), 'Archive: 実験結果が履歴に出る');

  // 5タブ遷移
  for (const n of ['Home', 'Explore', 'Network', 'Lab', 'Archive']) {
    await page.locator('.nav').getByRole('link', { name: new RegExp(n) }).click();
    await page.waitForSelector('.page');
    check(!(await overflow(page)), `${n}(390px): 横スクロールなし`);
  }

  // Phase 2: 出典管理・関連発見・Web検索の既定
  await page.goto(URL_ + '#/profile');
  await page.getByLabel(/1日の生成上限/).selectOption('20');
  await page.goto(URL_);
  await page.waitForSelector('.lead-title');
  await page.locator('.lead-title a').click();
  await page.waitForSelector('.sources li');
  check((await page.locator('.sources li').first().innerText()).includes('未確認'), '出典: 初期状態は「未確認」と表示される');
  await page.getByRole('button', { name: 'リンク先を確認した' }).first().click();
  await page.waitForSelector('.sources li:has-text("確認済み（")');
  check(true, '出典: 「確認した」を記録できる');
  await page.getByText('出典を自分で追加する').click();
  await page.getByLabel('URL').fill('javascript:alert(1)');
  await page.getByRole('button', { name: '追加', exact: true }).click();
  check(await page.locator('.banner.error[role="alert"]').count() === 1, '出典: http(s)以外のURLは拒否される');
  await page.getByLabel('URL').fill('https://example.org/paper');
  await page.getByLabel('タイトル（任意）').fill('自分で見つけた論文');
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await page.waitForSelector('.sources li:has-text("自分で追加")');
  check(true, '出典: 自分で出典を追加できる(自分で追加と表示)');
  const before = await page.evaluate(async () => (await new Promise((res) => { const r = indexedDB.open('lucida'); r.onsuccess = () => { const q = r.result.transaction('discoveries').objectStore('discoveries').count(); q.onsuccess = () => res(q.result); }; })));
  await page.getByRole('button', { name: '関連する発見を新しく探す' }).click();
  await page.waitForSelector('.banner[role="status"]');
  const after = await page.evaluate(async () => (await new Promise((res) => { const r = indexedDB.open('lucida'); r.onsuccess = () => { const q = r.result.transaction('discoveries').objectStore('discoveries').count(); q.onsuccess = () => res(q.result); }; })));
  check(after > before, `関連発見: 新しい発見が追加される(${before}→${after})`);
  await page.goto(URL_ + '#/profile');
  check((await page.getByLabel(/外部情報/).inputValue()) === 'off', 'Web検索: 既定は「許可しない」');
  await page.getByLabel(/外部情報/).selectOption('on');
  await page.reload();
  check((await page.getByLabel(/外部情報/).inputValue()) === 'on', 'Web検索: 許可設定が保持される');
  await page.goto(URL_ + '#/archive');
  await page.getByRole('tab', { name: '出典' }).click();
  check((await page.locator('.entries li:has-text("自分で見つけた論文")').count()) === 1, 'Archive出典タブ: 追加した出典が履歴に出る');
  await page.goto(URL_ + '#/explore');
  await page.waitForSelector('.page');
  check(!(await overflow(page)), 'Explore(390px): 横スクロールなし(Phase 2)');
  await shot(page, '09-explore-phase2');

  // ---- Phase 4: 連携（許可制のファイル取り込み）・提案数・分野バランス ----
  await page.goto(URL_ + '#/profile');
  const study = page.locator('[data-integration="study"]');
  const pickBtn = (scope) => scope.getByRole('button', { name: 'ファイルを選んで取り込む' });
  check(await pickBtn(study).isDisabled(), '連携: 許可するまで取り込みボタンは押せない');
  await page.locator('#int-study').selectOption('on');
  await page.waitForFunction(() => !document.querySelector('[data-integration="study"] .btn').disabled);
  const csv = `日付,内容,分\n${dayKey(-2)},言語学の入門書,40\n${dayKey(-1)},数学の復習,25\n日付ではない,x,1\n`;
  const upload = async (scope, file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), pickBtn(scope).click()]);
    await chooser.setFiles(file);
  };
  await upload(study, { name: 'study.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await study.locator('.banner').waitFor();
  const m1 = await study.locator('.banner').innerText();
  check(m1.includes('2件を取り込みました') && m1.includes('1件'), `連携(学習記録CSV): 取り込める／読めない行を数える`);
  await upload(study, { name: 'study.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForFunction(() => document.querySelector('[data-integration="study"] .banner')?.textContent?.includes('取り込み済み'));
  check((await idbAll(page, 'notes')).filter((n) => n.source === 'study').length === 2, '連携: 同じファイルを取り込み直しても重複しない');

  const cal = page.locator('[data-integration="calendar"]');
  await page.locator('#int-calendar').selectOption('on');
  await page.waitForFunction(() => !document.querySelector('[data-integration="calendar"] .btn').disabled);
  const stamp = (off) => dayKey(off).replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a@e2e', `DTSTART;VALUE=DATE:${stamp(-1)}`, 'SUMMARY:歯医者', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:b@e2e', `DTSTART;VALUE=DATE:${stamp(5)}`, 'SUMMARY:未来の予定', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  await upload(cal, { name: 'cal.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
  await cal.locator('.banner').waitFor();
  check((await cal.locator('.banner').innerText()).includes('1件を取り込みました'), '連携(カレンダー.ics): 過去の予定だけを取り込む');
  await upload(cal, { name: 'bad.ics', mimeType: 'text/calendar', buffer: Buffer.from('これはカレンダーではない') });
  await cal.locator('.banner.error').waitFor();
  check(true, '連携: 読めないファイルはエラー表示になり、アプリは止まらない');
  await shot(page, '14-profile-integrations-390');

  await page.goto(URL_ + '#/archive');
  await page.getByRole('tab', { name: '記録' }).click();
  const noteTexts = await page.locator('.entries').innerText();
  check(noteTexts.includes('学習記録から取り込み') && noteTexts.includes('カレンダーから取り込み') && noteTexts.includes('予定: 歯医者'), 'Archive: 取り込んだ記録が、取り込み元つきで並ぶ');

  await page.goto(URL_ + '#/profile');
  page.once('dialog', (d) => d.accept());
  await study.getByRole('button', { name: /取り込んだ2件を削除/ }).click();
  await page.waitForFunction(() => !document.querySelector('[data-integration="study"] .link.danger'));
  check((await idbAll(page, 'notes')).filter((n) => n.source === 'study').length === 0 && (await idbAll(page, 'notes')).some((n) => !n.source), '連携: 取り込んだ記録だけをまとめて削除できる(手動の記録は残る)');
  check((await page.locator('#freq-now').innerText()).includes('いまの提案数'), 'Profile: いまの提案数と理由が表示される');
  await page.locator('#freq').selectOption('fixed');
  await page.waitForFunction(() => document.querySelector('#freq-now')?.textContent?.includes('固定'));
  check((await page.locator('.shares > div').count()) === 6, 'Profile: 6分野のバランスが表示される');
  check(!(await overflow(page)), 'Profile(390px): 横スクロールなし');

  // 全データ削除→空の状態でもエラーにならない
  await page.goto(URL_ + '#/profile');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '全データを削除' }).click();
  await page.waitForSelector('.empty');
  check(true, 'Profile: 全データ削除が動作する');

  await ctx.close();

  // PC幅 + 初回の案内でテーマを選ぶ
  const pcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucida-pc-'));
  const ctx2 = await chromium.launchPersistentContext(pcDir, { viewport: { width: 1280, height: 860 } });
  const pc = await ctx2.newPage(); hook(pc);
  await pc.goto(URL_);
  await pc.waitForSelector('.intro');
  await pc.getByRole('button', { name: '睡眠', exact: true }).click();
  await pc.getByRole('button', { name: '宇宙', exact: true }).click();
  await pc.getByRole('button', { name: '2個のテーマで始める' }).click();
  await pc.waitForSelector('.lead-title');
  const pcDisc = await idbAll(pc, 'discoveries');
  check((await idbAll(pc, 'interests')).length === 2 && pcDisc.some((d) => d.tags.includes('睡眠') || d.tags.includes('宇宙')), '初回: 選んだテーマが興味に入り、最初の発見に反映される');
  const navBox = await pc.locator('.nav').boundingBox();
  check(navBox.x === 0 && navBox.width > 200 && navBox.height >= 800, 'PC(1280px): サイドナビゲーションになる');
  await shot(pc, '08-home-desktop');
  await pc.locator('.lead').getByRole('button', { name: '保存', exact: true }).click();
  await pc.locator('.lead').getByRole('button', { name: '保存済み' }).waitFor();
  await pc.locator('.nav').getByRole('link', { name: /Network/ }).click();
  await pc.waitForSelector('.react-flow__node');
  await pc.waitForTimeout(700);
  check((await pc.locator('.react-flow__node').count()) === 3, 'PC: Networkに、選んだテーマ2つと保存した発見が載る');
  const pcScale = await pc.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a);
  check(pcScale >= 0.79, `PC: Networkが読める大きさで表示される(倍率 ${pcScale.toFixed(2)})`);
  await shot(pc, '15-network-desktop');
  check(await pc.evaluate(async () => !!(await navigator.serviceWorker.ready).active) && (await pc.locator('link[rel="manifest"]').count()) === 1, 'PWA: Service Worker とマニフェストが有効');
  // キャッシュに載せるため、Service Worker の制御下で一度読み直す
  await pc.reload(); await pc.waitForSelector('.react-flow__node');
  await pc.goto(URL_); await pc.waitForSelector('.lead-title');
  await ctx2.close();

  // オフライン: サーバーを止めても、開いたことのある画面は開ける
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  const ctx3 = await chromium.launchPersistentContext(pcDir, { viewport: { width: 1280, height: 860 } });
  const off = await ctx3.newPage();
  let offlineOk = false;
  try {
    await off.goto(URL_, { timeout: 15000 });
    await off.waitForSelector('.lead-title', { timeout: 15000 });
    await off.locator('.nav').getByRole('link', { name: /Network/ }).click();
    await off.waitForSelector('.react-flow__node', { timeout: 15000 });
    offlineOk = true;
  } catch (e) { console.error(String(e).split('\n')[0]); }
  check(offlineOk, 'PWA: サーバーに繋がらなくても(オフライン)、Homeと Network を開ける');
  await ctx3.close();
  fs.rmSync(pcDir, { recursive: true, force: true });

  check(errors.length === 0, `コンソールエラーなし ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
} catch (e) {
  console.error(e); failures++;
} finally {
  server.kill();
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} 件失敗` : '\nすべて成功');
process.exit(failures ? 1 : 0);
