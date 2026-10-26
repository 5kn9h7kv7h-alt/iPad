// ChatGPTに渡すための文脈ファイル notes/chatgpt-context.md を生成する（依存なし）。
// 仕様の要約 + 全ソース（テスト含む、バイナリ除く）を1ファイルにまとめる。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'README.md', 'package.json', 'public/index.html', 'public/styles.css', 'public/sw.js', 'public/manifest.webmanifest',
  'public/js/core/model.js', 'public/js/core/voice.js', 'public/js/core/receipt.js', 'public/js/core/backup.js', 'public/js/core/ocr.js', 'public/js/storage/repository.js', 'public/js/ledger.js', 'public/js/app.js',
  'server.mjs', 'build.mjs', 'tests/unit/model.test.js', 'tests/unit/voice.test.js', 'tests/unit/voice-phrases.test.js', 'tests/unit/repository.test.js', 'tests/unit/receipt.test.js', 'tests/unit/backup.test.js', 'tests/e2e/run.mjs',
];
const lang = { '.js': 'js', '.mjs': 'js', '.html': 'html', '.css': 'css', '.json': 'json', '.webmanifest': 'json', '.md': 'md' };

const header = `# AI コントロールパネル — ChatGPT向け文脈ファイル

## 前提（変更しないこと）
- iPad Safari向けのPWA。依存ライブラリなし・ビルド不要の素のES Modules。費用0円が方針。
- 保存はIndexedDB（保存層 \`storage/repository.js\` はUIから分離済み。クラウド同期はここに別バックエンドを足す）。
- 音声指示はルールベース（\`core/voice.js\`）。認識結果は解析してから実行し、変更系は確認カードを経由する。
- 開発依頼は「記録のみ」。コード実行機能は無い。APIキー・認証情報は保存も表示もしない。
- 家計簿: レシート画像は端末内のTesseract.js（public/vendor/、約14MB）で文字認識し、画像は保存・送信しない。解析は core/receipt.js のルールベース。結果は必ず確認画面で修正してから保存する。
- 既存の4プロジェクト（Study Grove / シミュレーションゲーム / Materials Informatics / 大学の勉強）はmodel.jsに固定。
- テスト: \`npm test\`（単体・Node標準）、\`npm run test:e2e\`（Playwright）。変更後も全て通ること。

## 返答のルール
- 変更したファイルは**ファイル全体**を、パス付きのコードブロックで返す（差分ではなく全文）。
- 新しい依存ライブラリを追加しない。追加する場合は理由と費用を明記する。
- 外部通信・課金が発生する提案は、実装せず「提案」として分けて書く。
- 不明点は推測せず、確認事項として最後にまとめる。

---

`;

let out = header;
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const body = fs.readFileSync(p, 'utf8');
  out += `## FILE: ${rel}\n\n\`\`\`${lang[path.extname(rel)] || ''}\n${body.replace(/\n$/, '')}\n\`\`\`\n\n`;
}
fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
const dest = path.join(root, 'notes', 'chatgpt-context.md');
fs.writeFileSync(dest, out);
console.log(`wrote notes/chatgpt-context.md (${Math.round(out.length / 1024)} KB, ${targets.length} files)`);
