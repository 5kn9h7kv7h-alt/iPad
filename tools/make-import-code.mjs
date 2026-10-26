// Claudeが写真から読み取ったレシート(JSON)を、サイトに貼り付けるだけの「読み込みコード」にする。
//   node tools/make-import-code.mjs receipts.json
// 入力: { "receipts": [ { "date": "2026-10-26", "store": "店名", "items": [ { "name": "牛乳", "amount": 198, "category": "食費" } ] } ] }
import fs from 'node:fs';
import { createReceipt, contentId, CATEGORIES } from '../public/js/core/receipt.js';
import { buildBackup, encodeImportCode, parseBackup, decodeImportText } from '../public/js/core/backup.js';

const file = process.argv[2];
if (!file) { console.error('使い方: node tools/make-import-code.mjs receipts.json'); process.exit(1); }
const input = JSON.parse(fs.readFileSync(file, 'utf8'));
const receipts = [];
const problems = [];
(input.receipts || []).forEach((r, n) => {
  const res = createReceipt({ ...r, source: 'claude' }, new Date(), contentId(r));
  if (res.ok) receipts.push(res.receipt); else problems.push(`#${n + 1} ${r.store || ''}: ${Object.values(res.errors).join(' / ')}`);
});
if (problems.length) { console.error(`作れないレシートがあります:\n${problems.join('\n')}\n分類は次のどれか: ${CATEGORIES.join(', ')}`); process.exit(1); }

const code = encodeImportCode(buildBackup({ receipts }));
// サイトと同じ手順で読み戻して、壊れていないことを確認する
const back = parseBackup(decodeImportText(code).json);
if (!back.ok || back.receipts.length !== receipts.length || back.warnings.length) { console.error('読み戻しに失敗しました'); process.exit(1); }

for (const r of receipts) {
  console.log(`${r.date}  ${r.store || '(店名なし)'}  合計 ¥${r.total.toLocaleString('ja-JP')}`);
  for (const i of r.items) console.log(`   ${i.category.padEnd(8, '　')} ${String(i.amount).padStart(7)}  ${i.name}`);
}
console.log(`\n--- 読み込みコード (${code.length}文字) ---\n${code}`);
