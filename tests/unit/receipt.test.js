import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../public/js/core/receipt.js';

const NOW = new Date('2026-10-26T12:00:00');

// 実際にTesseract(jpn)で合成レシート画像(tests/fixtures/receipt-sample.png)を読んだ出力。¥が\、「,」が「.」になるノイズを含む。
const OCR_TEXT = `スーパーまるい 駅前店
TEL 03-1234-5678

2026年10月24日(土) 18:32

牛乳 1L                                   \\198
食パン 6枚切                                \\148
たまご 10個入                               \\268
トマト                                      \\320
ティッシュペーパー                         \\358
洗濯用洗剤                                \\498
小計                                     \\1.790
合計                                     \\1.790
お預り                                   \\2.000
お釣り                                     \\210
`;

test('OCR出力（ノイズ入り）から日付・店名・明細・合計を取り出す', () => {
  const r = R.parseReceiptText(OCR_TEXT, { now: NOW });
  assert.equal(r.date, '2026-10-24');
  assert.equal(r.store, 'スーパーまるい駅前店', '日本語どうしの間のOCR由来の空白は除く');
  assert.equal(r.total, 1790);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount, i.category]), [
    ['牛乳 1L', 198, '食費'], ['食パン 6枚切', 148, '食費'], ['たまご 10個入', 268, '食費'],
    ['トマト', 320, '食費'], ['ティッシュペーパー', 358, '日用品'], ['洗濯用洗剤', 498, '日用品'],
  ]);
  assert.deepEqual(r.warnings, []);
});

test('電話番号・住所・時刻・小計・お預り・お釣りは明細にしない', () => {
  const r = R.parseReceiptText('ABCストア\n東京都千代田区1-2-3\nTEL 03-1234-5678\n2026/10/25 09:05\nりんご ¥150\n小計 ¥150\n消費税 ¥12\n合計 ¥150\nお預り ¥1,000\nお釣り ¥850', { now: NOW });
  assert.deepEqual(r.items.map((i) => i.name), ['りんご']);
  assert.equal(r.total, 150);
  assert.equal(r.date, '2026-10-25');
});

test('値引は負の金額になり、直前の品目の分類を引き継ぐ', () => {
  const r = R.parseReceiptText('マート\n2026/10/25\n牛乳 ¥200\n値引 50\n合計 ¥150', { now: NOW });
  assert.deepEqual(r.items.map((i) => [i.name, i.amount, i.category]), [['牛乳', 200, '食費'], ['値引', -50, '食費']]);
  assert.deepEqual(r.warnings, []);
});

test('明細の合計とレシートの合計が違うと警告する', () => {
  const r = R.parseReceiptText('マート\n2026/10/25\n牛乳 ¥200\n卵 ¥250\n合計 ¥500', { now: NOW });
  assert.equal(r.items.length, 2);
  assert.equal(r.total, 500);
  assert.ok(r.warnings.some((w) => w.includes('一致しません')));
});

test('合計行がなければ明細の合計を使い、警告する', () => {
  const r = R.parseReceiptText('マート\n2026/10/25\n牛乳 ¥200\n卵 ¥250', { now: NOW });
  assert.equal(r.total, 450);
  assert.ok(r.warnings.some((w) => w.includes('合計の行')));
});

test('日付の書き方: 令和・R表記・2桁年・範囲外は無視', () => {
  const d = (t) => R.parseReceiptText(`店\n${t}\n牛乳 100\n合計 100`, { now: NOW });
  assert.equal(d('令和8年10月25日').date, '2026-10-25');
  assert.equal(d('R8.10.25').date, '2026-10-25');
  assert.equal(d('26/10/25').date, '2026-10-25');
  assert.equal(d('2026-10-25').date, '2026-10-25');
  const none = d('2019/01/01');
  assert.equal(none.dateFound, false);
  assert.equal(none.date, '2026-10-26');
  assert.ok(none.warnings.some((w) => w.includes('日付')));
});

test('読めないテキストでは明細なし・警告つきで返す（例外を投げない）', () => {
  for (const t of ['', '   \n\n', '#@!$%', 'あいうえお', null, undefined]) {
    const r = R.parseReceiptText(t, { now: NOW });
    assert.deepEqual(r.items, []);
    assert.ok(r.warnings.length >= 1);
  }
});

test('金額の解釈: ¥ \\ カンマ ピリオド 円', () => {
  assert.equal(R.parseYen('¥1,790'), 1790);
  assert.equal(R.parseYen('\\1.790'), 1790);
  assert.equal(R.parseYen('1790円'), 1790);
  assert.equal(R.parseYen('-50'), -50);
  assert.ok(Number.isNaN(R.parseYen('abc')));
  assert.ok(Number.isNaN(R.parseYen('1.5')));
});

test('分類: 最長一致・店名による補正・学習ルールが優先', () => {
  assert.equal(R.categorize('パンツ'), '衣服・美容');
  assert.equal(R.categorize('食パン'), '食費');
  assert.equal(R.categorize('ﾄﾏﾄ'), '食費'); // 半角カナ
  assert.equal(R.categorize('洗濯用洗剤'), '日用品');
  assert.equal(R.categorize('よくわからない物'), 'その他');
  assert.equal(R.categorize('コーヒー', { store: 'スターバックス 渋谷店' }), '外食');
  assert.equal(R.categorize('ビール 6本', { store: 'スーパーまるい 駅前店' }), '食費', '「駅前店」だけでは交通費にしない');
  assert.equal(R.categorize('なにか', { store: 'さくら薬局' }), '医療・健康');
  const rules = [R.makeRule('よくわからない物', '趣味・娯楽', NOW)];
  assert.equal(R.categorize('よくわからない物', { rules }), '趣味・娯楽');
  assert.equal(R.categorize('コーヒー', { rules: [R.makeRule('コーヒー', '食費')], store: 'カフェ' }), '食費', '学習ルールが店名補正より優先');
});

test('レシート作成・更新・検証', () => {
  const ok = R.createReceipt({ date: '2026-10-24', store: ' まるい ', items: [{ name: '牛乳', amount: 198, category: '食費' }, { name: '洗剤', amount: 498, category: '日用品' }] }, NOW, 'r1');
  assert.ok(ok.ok);
  assert.equal(ok.receipt.total, 696);
  assert.equal(ok.receipt.store, 'まるい');
  const up = R.updateReceipt(ok.receipt, { items: [{ name: '牛乳', amount: 200, category: '食費' }] }, NOW);
  assert.equal(up.receipt.total, 200);
  const bad = (o) => R.createReceipt({ date: '2026-10-24', items: [{ name: 'a', amount: 1, category: '食費' }], ...o }).ok;
  assert.equal(bad({ date: '2026-13-01' }), false);
  assert.equal(bad({ items: [] }), false);
  assert.equal(bad({ items: [{ name: '', amount: 1, category: '食費' }] }), false);
  assert.equal(bad({ items: [{ name: 'a', amount: 1.5, category: '食費' }] }), false);
  assert.equal(bad({ items: [{ name: 'a', amount: 0, category: '食費' }] }), false);
  assert.equal(bad({ items: [{ name: 'a', amount: 1, category: '存在しない' }] }), false);
});

const mkReceipt = (id, date, items) => R.createReceipt({ date, store: 's', items }, NOW, id).receipt;

test('月別集計: 合計・分類別・割合・並び順', () => {
  const rs = [
    mkReceipt('a', '2026-10-24', [{ name: '牛乳', amount: 198, category: '食費' }, { name: '洗剤', amount: 498, category: '日用品' }]),
    mkReceipt('b', '2026-10-25', [{ name: '電車', amount: 300, category: '交通費' }, { name: '値引', amount: -100, category: '交通費' }]),
    mkReceipt('c', '2026-09-30', [{ name: '先月', amount: 999, category: '食費' }]),
  ];
  const s = R.monthSummary(rs, '2026-10');
  assert.equal(s.total, 896);
  assert.equal(s.count, 2);
  assert.deepEqual(s.categories.map((c) => [c.category, c.amount]), [['日用品', 498], ['交通費', 200], ['食費', 198]]);
  assert.equal(R.monthSummary(rs, '2026-11').total, 0);
  assert.deepEqual(R.receiptsInMonth(rs, '2026-10').map((r) => r.id), ['b', 'a'], '新しい日付が先');
  assert.equal(R.amountInCategory(rs[0], '食費'), 198);
  assert.equal(R.amountInCategory(rs[0], null), 696);
});

test('月の移動とラベル', () => {
  assert.equal(R.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(R.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(R.monthLabel('2026-10'), '2026年10月');
  assert.equal(R.isValidMonth('2026-13'), false);
  assert.equal(R.isValidMonth('2026-10'), true);
});

test('CSV: 引用符・改行・式インジェクションを無害化し、負の金額はそのまま', () => {
  const r = mkReceipt('a', '2026-10-24', [{ name: '=HYPERLINK("x")', amount: 100, category: 'その他' }, { name: 'a,b', amount: -50, category: '食費' }]);
  const csv = R.toCsv([r]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '日付,店名,品名,金額,分類');
  assert.equal(lines[1], `2026-10-24,s,"'=HYPERLINK(""x"")",100,その他`);
  assert.equal(lines[2], '2026-10-24,s,"a,b",-50,食費');
});

test('バックアップ用サニタイズ', () => {
  const good = { id: 'x', date: '2026-10-24', store: 's', items: [{ name: 'a', amount: 5, category: '食費' }], createdAt: 'bad' };
  const r = R.sanitizeReceipt(good, NOW.toISOString());
  assert.equal(r.id, 'x');
  assert.equal(r.createdAt, NOW.toISOString());
  assert.equal(R.sanitizeReceipt({ id: 'y', date: 'bad', items: [] }, NOW.toISOString()), null);
  assert.equal(R.sanitizeReceipt(null, NOW.toISOString()), null);
  assert.equal(R.sanitizeRule({ id: 'k', category: '存在しない' }, 'x'), null);
  assert.equal(R.sanitizeRule({ id: 'k', category: '食費' }, 'x').category, '食費');
});

test('contentId: 同じ内容は同じID、違う内容は違うID', () => {
  const a = { date: '2026-10-24', store: ' まるい ', items: [{ name: '牛乳', amount: 198, category: '食費' }] };
  assert.equal(R.contentId(a), R.contentId({ ...a, store: 'まるい' }));
  assert.notEqual(R.contentId(a), R.contentId({ ...a, date: '2026-10-25' }));
  assert.notEqual(R.contentId(a), R.contentId({ ...a, items: [{ name: '牛乳', amount: 199, category: '食費' }] }));
  assert.match(R.contentId(a), /^rcp-[0-9a-f]{8}$/);
});

test('「雑費」分類が使え、source: claude も保存できる', () => {
  assert.ok(R.CATEGORIES.includes('雑費'));
  assert.ok(R.CATEGORY_COLORS['雑費']);
  const r = R.createReceipt({ date: '2026-10-24', items: [{ name: '電池', amount: 300, category: '雑費' }], source: 'claude' }, NOW, 'x');
  assert.ok(r.ok);
  assert.equal(r.receipt.source, 'claude');
  assert.equal(R.createReceipt({ date: '2026-10-24', items: [{ name: 'a', amount: 1, category: '食費' }], source: 'bogus' }, NOW, 'y').receipt.source, 'manual');
});

test('分類の基準: 洗剤=日用品 / 食べられる物=食費 / めったに買い換えない物=雑費', () => {
  for (const n of ['洗濯用洗剤', '食器用洗剤', 'ハンドソープ', 'ティッシュペーパー']) assert.equal(R.categorize(n), '日用品', n);
  for (const n of ['牛乳', 'トマト', 'カップ麺', 'チョコレート', 'ミネラルウォーター', '冷凍餃子']) assert.equal(R.categorize(n), '食費', n);
  for (const n of ['フライパン 26cm', 'ごみ箱 45L', 'ゴミ箱', '片手鍋', '包丁', 'マグカップ', '収納ボックス']) assert.equal(R.categorize(n), '雑費', n);
  // 食べ物と似た語でも、道具は雑費（「フライパン」が「パン」に負けない）
  assert.equal(R.categorize('フライパン'), '雑費');
  assert.equal(R.categorize('食パン'), '食費');
});
