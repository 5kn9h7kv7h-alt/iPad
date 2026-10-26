# AI コントロールパネル — ChatGPT向け文脈ファイル

## 前提（変更しないこと）
- iPad Safari向けのPWA。依存ライブラリなし・ビルド不要の素のES Modules。費用0円が方針。
- 保存はIndexedDB（保存層 `storage/repository.js` はUIから分離済み。クラウド同期はここに別バックエンドを足す）。
- 音声指示はルールベース（`core/voice.js`）。認識結果は解析してから実行し、変更系は確認カードを経由する。
- 開発依頼は「記録のみ」。コード実行機能は無い。APIキー・認証情報は保存も表示もしない。
- 家計簿: レシート画像は端末内のTesseract.js（public/vendor/、約14MB）で文字認識し、画像は保存・送信しない。解析は core/receipt.js のルールベース。結果は必ず確認画面で修正してから保存する。
- 既存の4プロジェクト（Study Grove / シミュレーションゲーム / Materials Informatics / 大学の勉強）はmodel.jsに固定。
- テスト: `npm test`（単体・Node標準）、`npm run test:e2e`（Playwright）。変更後も全て通ること。

## 返答のルール
- 変更したファイルは**ファイル全体**を、パス付きのコードブロックで返す（差分ではなく全文）。
- 新しい依存ライブラリを追加しない。追加する場合は理由と費用を明記する。
- 外部通信・課金が発生する提案は、実装せず「提案」として分けて書く。
- 不明点は推測せず、確認事項として最後にまとめる。

---

## FILE: README.md

```md
# AI コントロールパネル

iPad（Safari）で使う、プロジェクトとタスクの一元管理PWA。依存ライブラリなし・ビルド不要・費用0円で動きます。

## 起動

```bash
npm start                 # http://127.0.0.1:8080/  (public/ を配信)
npm run build             # 検証して dist/ を生成
npm run test:all          # build + 単体テスト + E2E(Playwright)
HOST=0.0.0.0 npm start    # 同じWi-Fi内の端末から見る場合のみ（信頼できるネットワークで）
```

## 構成

| パス | 役割 |
|---|---|
| `public/js/core/model.js` | タスク・開発依頼・バックアップの純粋ロジック |
| `public/js/core/voice.js` | ルールベースの日本語指示の解析（実行はしない） |
| `public/js/core/receipt.js` | レシートの解析・分類・月別集計・CSV（純粋ロジック） |
| `public/js/core/ocr.js` | 端末内OCR（Tesseract.js）の読み込みと画像の前処理 |
| `public/js/core/backup.js` | JSONバックアップ（v2。v1も読める） |
| `public/js/ledger.js` | 家計簿の画面・レシート確認フォーム |
| `public/vendor/tesseract/` | 同梱したOCR部品と日本語データ（約14MB、Apache-2.0。`THIRD_PARTY.md` 参照） |
| `public/js/storage/repository.js` | 保存層（IndexedDB / メモリ）。クラウド同期はここに別バックエンドを足す |
| `public/js/app.js` | UI・画面遷移・音声入力 |
| `server.mjs` / `build.mjs` | 静的サーバー（既定は127.0.0.1のみ）/ 検証つきビルド |

## 制約

- 音声認識はブラウザ機能（Safariでは `webkitSpeechRecognition`）。HTTPS か localhost が必要。非対応・失敗時はテキスト入力で同じ操作ができる。
- データは端末のブラウザ内にのみ保存される。Safariは長期間開かないサイトのデータを消すことがあるため、ホーム画面に追加して使い、定期的にJSONを書き出すこと。
- 開発依頼は記録のみ。コードは実行しない。
- レシートの文字認識は端末内で行い、画像は保存・送信しない。初回のみ約7MB（認識エンジンと日本語データ）を読み込む。実際のレシート写真での精度は未検証で、保存前に必ず確認・修正する前提。
- 4プロジェクトは固定（PCの実パスは持たない）。
```

## FILE: package.json

```json
{
  "name": "ai-control-panel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "iPad向けAIコントロールパネル（依存ライブラリなしのPWA）",
  "scripts": {
    "start": "node server.mjs",
    "build": "node build.mjs",
    "test": "node --test \"tests/unit/*.test.js\"",
    "test:e2e": "node tests/e2e/run.mjs",
    "build:pages": "node build.mjs --out docs",
    "bundle": "node tools/bundle.mjs",
    "test:all": "npm run build && npm test && npm run test:e2e"
  },
  "engines": { "node": ">=20" }
}
```

## FILE: public/index.html

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#4f7a64">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="コントロール">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>AI コントロールパネル</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main id="app" class="app" aria-live="polite"></main>

<nav class="tabbar" aria-label="メインメニュー">
  <a href="#/" data-nav="home"><span aria-hidden="true">🏠</span>ホーム</a>
  <a href="#/tasks" data-nav="tasks"><span aria-hidden="true">✅</span>タスク</a>
  <a href="#/ledger" data-nav="ledger"><span aria-hidden="true">🧾</span>家計簿</a>
  <a href="#/settings" data-nav="settings"><span aria-hidden="true">⚙️</span>設定</a>
</nav>
<button id="mic-fab" class="fab" type="button" aria-label="音声・テキスト指示を開く">🎤</button>

<div id="toast" class="toast" role="status" hidden></div>

<dialog id="task-dialog" class="sheet" aria-labelledby="task-dialog-title"></dialog>
<dialog id="request-dialog" class="sheet" aria-labelledby="request-dialog-title"></dialog>
<dialog id="scan-dialog" class="sheet" aria-labelledby="scan-title"></dialog>
<dialog id="receipt-dialog" class="sheet" aria-labelledby="receipt-title"></dialog>
<dialog id="choice-dialog" class="sheet small" aria-labelledby="choice-title"></dialog>
<dialog id="voice-dialog" class="sheet" aria-labelledby="voice-title">
  <div class="sheet-head">
    <h2 id="voice-title">音声・テキスト指示</h2>
    <button type="button" class="btn ghost" data-close>閉じる</button>
  </div>
  <p id="voice-support" class="muted"></p>
  <div class="voice-row">
    <button id="voice-mic" type="button" class="btn primary big">🎤 話す</button>
    <form id="voice-form" class="voice-form">
      <input id="voice-input" type="text" inputmode="text" autocomplete="off" enterkeyhint="send"
             placeholder="例：今日やることを表示" aria-label="指示を入力">
      <button type="submit" class="btn">解釈</button>
    </form>
  </div>
  <div id="voice-result" class="voice-result"></div>
  <details class="examples">
    <summary>指示の例</summary>
    <ul>
      <li>今日やることを表示</li>
      <li>Study Groveのタスクを表示</li>
      <li>大学の勉強に、レポートを書くを追加</li>
      <li>このタスクを完了にする</li>
      <li>期限切れのタスクを表示 / 優先度の高いタスクを表示</li>
      <li>ゲーム制作に開発依頼を登録 セーブ機能を作る</li>
      <li>今月の支出を教えて / 今月の食費はいくら / レシートを読み取る</li>
    </ul>
    <p class="muted">「このタスク」は、直前にタップしたタスク（枠が付いています）を指します。</p>
  </details>
</dialog>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

## FILE: public/styles.css

```css
:root {
  --bg: #f4f1ea;
  --surface: #fffdf8;
  --surface-2: #efeadf;
  --ink: #26302b;
  --muted: #66716a;
  --line: #e0d9ca;
  --accent: #4f7a64;
  --accent-ink: #ffffff;
  --danger: #b4533f;
  --warn: #a9741f;
  --ok: #3f7a56;
  --shadow: 0 1px 2px rgba(40, 48, 43, .08), 0 4px 14px rgba(40, 48, 43, .06);
  --radius: 18px;
  --tap: 52px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a201d; --surface: #232b27; --surface-2: #2c3631; --ink: #e8eee9; --muted: #9aa8a0;
    --line: #36423c; --accent: #6fa488; --accent-ink: #10201a; --danger: #e38b78; --warn: #d9a352; --ok: #7cc79a;
    --shadow: none;
  }
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
  padding-top: env(safe-area-inset-top);
}
.app { max-width: 1040px; margin: 0 auto; padding: 20px 20px calc(170px + env(safe-area-inset-bottom)); }
h1 { font-size: 1.7rem; margin: .2em 0 .1em; letter-spacing: .01em; }
h2 { font-size: 1.2rem; margin: 1.4em 0 .5em; }
h3 { font-size: 1.05rem; margin: 0; }
a { color: inherit; }
.muted { color: var(--muted); font-size: .92rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* ボタン */
.btn {
  min-height: var(--tap); padding: 0 20px; border-radius: 14px; border: 1px solid var(--line);
  background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none;
}
.btn:active { transform: scale(.98); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.big { min-height: 60px; font-size: 1.1rem; }
.btn.small { min-height: 44px; padding: 0 14px; font-size: .95rem; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

/* ヘッダー・要約 */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.back { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); text-decoration: none; font-weight: 600; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 6px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; text-decoration: none; text-align: center; box-shadow: var(--shadow); min-height: 76px; }
.stat b { display: block; font-size: 1.6rem; line-height: 1.2; }
.stat span { font-size: .85rem; color: var(--muted); }
.stat.alert b { color: var(--danger); }

/* カード */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 12px; }
.card {
  display: block; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 18px; text-decoration: none; box-shadow: var(--shadow); border-top: 6px solid var(--pc, var(--accent)); min-height: 44px;
}
.card:active { transform: scale(.99); }
.card-head { display: flex; align-items: center; gap: 12px; }
.card-icon { font-size: 1.8rem; width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, var(--pc) 16%, transparent); }
.progress { height: 10px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin: 14px 0 8px; }
.progress > i { display: block; height: 100%; background: var(--pc, var(--accent)); border-radius: 99px; }
.card-meta { display: flex; justify-content: space-between; font-size: .92rem; color: var(--muted); }
.card-next { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); font-size: .95rem; }
.card-next small { color: var(--muted); display: block; }

/* チップ */
.chips { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 8px; margin: 8px -4px 4px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: none; min-height: 44px; padding: 0 16px; display: inline-flex; align-items: center; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); text-decoration: none; font-weight: 600; }
.chip[aria-current="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
select, input[type=text], input[type=date], textarea {
  width: 100%; min-height: var(--tap); padding: 10px 14px; font: inherit; color: var(--ink); background: var(--surface);
  border: 1px solid var(--line); border-radius: 12px;
}
textarea { min-height: 110px; resize: vertical; }
.filter-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filter-row select { width: auto; min-width: 200px; }

/* タスク */
.tasks { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 10px; }
.task { display: flex; align-items: stretch; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); }
.task.selected { outline: 3px solid var(--accent); outline-offset: -1px; }
.check { flex: none; width: 64px; border: 0; border-right: 1px solid var(--line); background: transparent; font-size: 1.5rem; color: transparent; cursor: pointer; }
.check::before { content: ""; display: block; width: 30px; height: 30px; margin: auto; border-radius: 50%; border: 2.5px solid var(--muted); }
.task.done .check::before { content: "✓"; color: var(--accent-ink); background: var(--accent); border-color: var(--accent); font-size: 1.1rem; line-height: 25px; font-weight: 700; }
.task-main { flex: 1; text-align: left; border: 0; background: transparent; font: inherit; color: inherit; padding: 12px 16px; min-height: 68px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.task.done .title { text-decoration: line-through; color: var(--muted); }
.title { font-weight: 600; word-break: break-word; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 99px; font-size: .8rem; background: var(--surface-2); color: var(--muted); font-weight: 600; }
.badge.proj { background: color-mix(in srgb, var(--pc) 16%, transparent); color: var(--ink); }
.badge.over { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.badge.today { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.badge.high { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.badge.ok { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
.empty { text-align: center; color: var(--muted); padding: 28px 12px; background: var(--surface); border: 1px dashed var(--line); border-radius: 16px; }

/* 開発依頼 */
.notice { background: var(--surface-2); border-radius: 12px; padding: 10px 14px; font-size: .92rem; color: var(--muted); }
.req { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: grid; gap: 8px; }
.req p { margin: 0; white-space: pre-wrap; word-break: break-word; }
.req-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* 設定 */
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; margin: 12px 0; display: grid; gap: 10px; }
.panel h3 { margin-bottom: 2px; }
.btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
.status-line { display: flex; align-items: center; gap: 8px; }

/* ナビ・FAB・トースト */
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 4px;
  background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--line); padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); z-index: 20;
}
.tabbar a { flex: 1; max-width: 220px; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-decoration: none; font-size: .78rem; font-weight: 600; color: var(--muted); border-radius: 14px; }
.tabbar a[aria-current="page"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.tabbar a span { font-size: 1.3rem; line-height: 1.2; }
.fab {
  position: fixed; right: max(18px, env(safe-area-inset-right)); bottom: calc(86px + env(safe-area-inset-bottom)); z-index: 30;
  width: 68px; height: 68px; border-radius: 50%; border: 0; background: var(--accent); color: var(--accent-ink); font-size: 1.8rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .25); cursor: pointer;
}
.toast {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(168px + env(safe-area-inset-bottom)); z-index: 60;
  background: #26302b; color: #fff; padding: 10px 14px 10px 18px; border-radius: 14px; display: flex; gap: 12px; align-items: center;
  max-width: min(92vw, 560px); box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
}
.toast[hidden] { display: none; }
.toast button { white-space: nowrap; flex: none; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.4); background: transparent; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }

/* シート（ダイアログ） */
dialog.sheet { width: min(640px, 100vw - 24px); max-height: calc(100dvh - 24px); border: 0; border-radius: 22px; padding: 18px 20px 22px; background: var(--bg); color: var(--ink); box-shadow: 0 20px 60px rgba(0,0,0,.35); overflow: auto; }
dialog.sheet.small { width: min(460px, 100vw - 24px); }
dialog::backdrop { background: rgba(20, 28, 24, .5); }
.sheet-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.sheet-head h2 { margin: 0; }
.form { display: grid; gap: 14px; margin-top: 10px; }
.field { display: grid; gap: 6px; }
.field > label, .field > span.label { font-weight: 700; font-size: .95rem; }
.err { color: var(--danger); font-size: .9rem; min-height: 1em; }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.seg label { position: relative; }
.seg input { position: absolute; opacity: 0; inset: 0; }
.seg span { display: flex; align-items: center; justify-content: center; min-height: var(--tap); border-radius: 12px; border: 1px solid var(--line); background: var(--surface); font-weight: 600; }
.seg input:checked + span { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.seg input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
.quick { display: flex; gap: 8px; flex-wrap: wrap; }
.form-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; margin-top: 4px; }
.voice-row { display: grid; gap: 12px; margin-top: 8px; }
.voice-form { display: flex; gap: 8px; }
.voice-form input { flex: 1; min-width: 0; }
.voice-form .btn { flex: none; white-space: nowrap; }
.voice-result { margin-top: 14px; display: grid; gap: 10px; }
.interp { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; }
.interp.warn { border-color: var(--danger); }
.examples { margin-top: 14px; color: var(--muted); }
.examples summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 600; }

/* 家計簿 */
.month-nav { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 12px 0 4px; }
.month-nav b { font-size: 1.25rem; min-width: 9em; text-align: center; }
.month-nav .btn { min-width: 56px; }
.spend { display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; margin: 10px 0; box-shadow: var(--shadow); }
.spend b { font-size: 2.2rem; line-height: 1.2; }
.cats { display: grid; gap: 8px; }
.catrow { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; text-decoration: none; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; min-height: 56px; }
.catrow[aria-current="true"] { outline: 3px solid var(--cc, var(--accent)); outline-offset: -1px; }
.cat-name { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.cat-amt { font-variant-numeric: tabular-nums; font-weight: 600; }
.cat-amt small { color: var(--muted); font-weight: 500; }
.cat-bar { grid-column: 1 / -1; height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.cat-bar i { display: block; height: 100%; background: var(--cc); border-radius: 99px; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 4px; background: var(--cc, var(--muted)); flex: none; }
.badge .swatch { width: 9px; height: 9px; }
.rcp { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); list-style: none; }
.rcp-main { width: 100%; display: grid; grid-template-columns: 76px 1fr auto; gap: 12px; align-items: center; text-align: left; border: 0; background: transparent; font: inherit; color: inherit; padding: 12px 16px; min-height: 68px; cursor: pointer; }
.rcp-date { color: var(--muted); font-size: .92rem; }
.rcp-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rcp-amt { font-weight: 700; font-variant-numeric: tabular-nums; }
.spend-line { display: flex; flex-direction: column; margin-top: 12px; }
.spend-line b { font-size: 1.8rem; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rrows { display: grid; gap: 10px; }
.rrow { display: grid; grid-template-columns: 1fr 120px 150px 48px; gap: 8px; align-items: center; }
.rrow.bad input, .rrow.bad select { border-color: var(--danger); }
.rrow .r-amount { text-align: right; font-variant-numeric: tabular-nums; }
.rtotal { display: flex; align-items: baseline; gap: 12px; justify-content: flex-end; }
.rtotal b { font-size: 1.6rem; }
.raw { white-space: pre-wrap; word-break: break-all; background: var(--surface-2); border-radius: 12px; padding: 12px; font-size: .85rem; max-height: 240px; overflow: auto; }
.tabbar a { font-size: .74rem; }
label.btn[aria-disabled="true"] { opacity: .6; pointer-events: none; }
.sr-only:focus-visible + * { outline: 3px solid var(--accent); }

@media (max-width: 700px) {
  .rrow { grid-template-columns: 1fr 1fr 44px; }
  .rrow .r-name { grid-column: 1 / -1; }
  .rrow .r-amount { grid-column: 1; }
  .rrow .r-cat { grid-column: 2; }
  .rrow [data-rm] { grid-column: 3; }
  .two { grid-template-columns: 1fr; }
  .rcp-main { grid-template-columns: 1fr auto; }
  .rcp-date { grid-column: 1 / -1; }
  body { font-size: 16px; }
  .app { padding: 14px 14px calc(170px + env(safe-area-inset-bottom)); }
  .summary { grid-template-columns: repeat(2, 1fr); }
  .cards { grid-template-columns: 1fr; }
  .voice-form { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

## FILE: public/sw.js

```js
// オフライン対応用Service Worker。ビルド時に VERSION と ASSETS が埋め込まれる。
const VERSION = 'dev';
const ASSETS = [/*ASSETS*/];
const CACHE = `acp-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('acp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ネットワーク優先、失敗時にキャッシュ（更新が反映されやすく、オフラインでも開ける）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
```

## FILE: public/manifest.webmanifest

```json
{
  "name": "AI コントロールパネル",
  "short_name": "コントロール",
  "description": "プロジェクトと学習タスクを一元管理するiPad向けパネル",
  "lang": "ja",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#f4f1ea",
  "theme_color": "#4f7a64",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

## FILE: public/js/core/model.js

```js
// 純粋なデータ処理（DOM・保存に依存しない）。単体テスト対象。

export const PRIORITIES = ['high', 'mid', 'low'];
export const PRIORITY_LABEL = { high: '高', mid: '中', low: '低' };
const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };

export const TASK_VIEWS = [
  ['open', '未完了'],
  ['today', '今日'],
  ['overdue', '期限切れ'],
  ['high', '優先度高'],
  ['done', '完了'],
  ['all', 'すべて'],
];

// 将来 Claude Code 連携で使う状態。初期版では 'waiting' のまま。
export const REQUEST_STATUS_LABEL = { waiting: '待機中', running: '実行中', done: '完了', failed: '失敗' };
export const APPROVAL_LABEL = { pending: '承認待ち', approved: '承認済み', rejected: '却下' };

export const PROJECTS = [
  { id: 'study-grove', name: 'Study Grove', icon: '🌿', color: '#5b8a72',
    aliases: ['Study Grove', 'スタディグローブ', 'スタディーグローブ', 'スタディグルーブ', 'スタディーグルーブ'] },
  { id: 'sim-game', name: 'シミュレーションゲーム', icon: '🎮', color: '#b88a4a',
    aliases: ['シミュレーションゲーム', 'ゲーム制作', 'ゲーム開発', 'ゲーム'] },
  { id: 'materials-informatics', name: 'Materials Informatics', icon: '🔬', color: '#5a7fa6',
    aliases: ['Materials Informatics', 'マテリアルズインフォマティクス', 'マテリアルインフォマティクス'] },
  { id: 'university', name: '大学の勉強', icon: '📚', color: '#8a6fa0',
    aliases: ['大学の勉強', '大学勉強', '大学'] },
];

export function getProject(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}

// ---- 日付 ----
const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

export function newId(prefix = '') {
  const rnd = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + rnd;
}

// ---- タスク ----
export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;

function validateTaskFields(f) {
  const errors = {};
  const title = typeof f.title === 'string' ? f.title.trim() : '';
  if (!title) errors.title = 'タイトルを入力してください';
  else if (title.length > TITLE_MAX) errors.title = `タイトルは${TITLE_MAX}文字以内にしてください`;
  if (!getProject(f.projectId)) errors.projectId = 'プロジェクトを選んでください';
  if (!PRIORITIES.includes(f.priority)) errors.priority = '優先度が正しくありません';
  const due = f.due ? f.due : null;
  if (due !== null && !isValidDate(due)) errors.due = '期限の日付が正しくありません';
  const note = typeof f.note === 'string' ? f.note.trim() : '';
  if (note.length > NOTE_MAX) errors.note = `メモは${NOTE_MAX}文字以内にしてください`;
  return { errors, value: { title, projectId: f.projectId, priority: f.priority, due, note } };
}

export function createTask(input, now = new Date(), id = newId()) {
  const { errors, value } = validateTaskFields({ priority: 'mid', ...input });
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return { ok: true, task: { id, ...value, done: false, doneAt: null, createdAt: iso, updatedAt: iso } };
}

export function updateTask(task, patch, now = new Date()) {
  const { errors, value } = validateTaskFields({ ...task, ...patch });
  if (Object.keys(errors).length) return { ok: false, errors };
  const next = { ...task, ...value, updatedAt: now.toISOString() };
  delete next.sample; // 編集したらサンプル扱いを外す（一括削除の対象外にする）
  return { ok: true, task: next };
}

export function setDone(task, done, now = new Date()) {
  const iso = now.toISOString();
  return { ...task, done: !!done, doneAt: done ? iso : null, updatedAt: iso };
}

export const isOverdue = (t, today) => !t.done && !!t.due && t.due < today;
export const isDueToday = (t, today) => !t.done && t.due === today;

export function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  const pa = PRIORITY_RANK[a.priority], pb = PRIORITY_RANK[b.priority];
  if (pa !== pb) return pa - pb;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export const sortTasks = (tasks) => [...tasks].sort(compareTasks);

export function filterTasks(tasks, { projectId = null, view = 'open' } = {}, today = todayStr()) {
  const out = tasks.filter((t) => {
    if (projectId && t.projectId !== projectId) return false;
    switch (view) {
      case 'open': return !t.done;
      case 'done': return t.done;
      case 'today': return isDueToday(t, today);
      case 'overdue': return isOverdue(t, today);
      case 'high': return !t.done && t.priority === 'high';
      case 'all': return true;
      default: return false;
    }
  });
  return sortTasks(out);
}

export function projectStats(tasks, projectId, today = todayStr()) {
  const mine = tasks.filter((t) => t.projectId === projectId);
  const done = mine.filter((t) => t.done).length;
  const open = mine.length - done;
  return {
    total: mine.length, open, done,
    percent: mine.length ? Math.round((done / mine.length) * 100) : 0,
    overdue: mine.filter((t) => isOverdue(t, today)).length,
    next: sortTasks(mine.filter((t) => !t.done))[0] || null,
  };
}

export function overallStats(tasks, today = todayStr()) {
  return {
    open: tasks.filter((t) => !t.done).length,
    today: tasks.filter((t) => isDueToday(t, today)).length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    high: tasks.filter((t) => !t.done && t.priority === 'high').length,
  };
}

// ---- 開発依頼（タスクとは別管理。初期版は記録のみで、コードは実行しない）----
export const REQUEST_MAX = 2000;

export function createRequest(input, now = new Date(), id = newId('req-')) {
  const errors = {};
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) errors.body = '依頼内容を入力してください';
  else if (body.length > REQUEST_MAX) errors.body = `依頼内容は${REQUEST_MAX}文字以内にしてください`;
  if (!getProject(input.projectId)) errors.projectId = 'プロジェクトを選んでください';
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return {
    ok: true,
    request: { id, projectId: input.projectId, body, createdAt: iso, updatedAt: iso, approval: 'pending', status: 'waiting' },
  };
}

export function setApproval(req, approval, now = new Date()) {
  if (!Object.keys(APPROVAL_LABEL).includes(approval)) throw new Error(`invalid approval: ${approval}`);
  return { ...req, approval, updatedAt: now.toISOString() };
}

// ---- サンプル ----
export function sampleTasks(today = todayStr(), now = new Date()) {
  const rows = [
    ['study-grove', '学習ログ画面のレイアウトを確認する', 'high', 0],
    ['study-grove', '復習リマインド機能のアイデアを書き出す', 'low', 5],
    ['sim-game', '資源バランスの数値を見直す', 'mid', 1],
    ['sim-game', 'セーブデータ形式を決める', 'high', -1],
    ['materials-informatics', '論文を1本読んで要点をまとめる', 'mid', 2],
    ['materials-informatics', 'データセットの欠損値を確認する', 'high', 0],
    ['university', 'レポートの構成を考える', 'high', 3],
    ['university', '小テストの範囲を復習する', 'mid', 0],
  ];
  return rows.map(([projectId, title, priority, offset], i) => {
    const r = createTask({ projectId, title, priority, due: addDays(today, offset), note: 'サンプルタスクです' },
      new Date(now.getTime() + i), `sample-${i + 1}`);
    return { ...r.task, sample: true };
  });
}
```

## FILE: public/js/core/voice.js

```js
// ルールベースの日本語コマンド解析。認識結果を直接実行せず、意図と対象を取り出して返す。
import { PROJECTS, getProject } from './model.js';
import { CATEGORIES } from './receipt.js';

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･]/g, '')
    .replace(/[。．.!！?？]+$/, '');
}

const ALIASES = PROJECTS.flatMap((p) => p.aliases.map((a) => ({ id: p.id, alias: normalize(a) })));

// 最も長く一致したエイリアスを採用（「大学の勉強」が「大学」より優先される）
function findProject(t) {
  let best = null;
  for (const { id, alias } of ALIASES) {
    const index = t.indexOf(alias);
    if (index < 0) continue;
    if (!best || alias.length > best.alias.length) best = { id, alias, index };
  }
  return best;
}

const removeFound = (t, f) => (f ? t.slice(0, f.index) + t.slice(f.index + f.alias.length) : t);
const unquote = (s) => s.replace(/^[「『"'“]+|[」』"'”]+$/g, '');

// 追加を表す動詞（「〜を追加」「〜を入れておいて」「メモ：〜」など）
const ADD_VERB = '(?:追加|登録|作成|作って|つくって|入れ(?:て)?|いれ(?:て)?|足し(?:て)?|加え(?:て)?|記録|メモ(?:して)?|控え(?:て)?)';
// 語尾（「して」「しておいて」「してほしい」「しといて」「お願いします」…）
const POLITE = '(?:て|して|する|します|ください|ておいて|おいて|とい(?:て)?|おねがい(?:します)?|お願い(?:します)?|ほしい|欲しい|ほしいです|もらえる(?:かな)?|くれる?|いただけますか)*';
// 文全体の検出に使う「強い」動詞（「作る」など、タイトルに入りやすい語は含めない）
const ADD_RE = /(追加|登録|作成|作って|つくって|入れて|いれて|入れとい|足して|加えて|記録|^メモ)/;
const SUFFIX_RE = new RegExp(`(?:を|も)?${ADD_VERB}${POLITE}$`);
const PREFIX_RE = new RegExp(`${ADD_VERB}${POLITE}[:：、,]?(.+)$`);
const GENERIC_TITLE = /^(新しい|あたらしい)?(タスク|やること|予定|todo|依頼|開発依頼)$/;
const TRAIL_PARTICLES = /(?:[、,]|を|に|へ)+$/;

function extractAddText(t, found) {
  // プロジェクト名と、その直後の「の/に/へ」「のタスクに」などを取り除く
  let s = removeFound(t, found).replace(/^(?:の?(?:タスク|やること|予定|todo)(?:リスト)?)?[にへで、,:：]*/, '');
  let out = s.replace(SUFFIX_RE, '');
  if (out === s) {
    const m = s.match(PREFIX_RE); // 「追加：レポートを書く」「メモ：牛乳を買う」形式
    out = m ? m[1] : s;
  }
  out = unquote(out)
    .replace(/^(新しい|あたらしい)?(タスク|やること)[:：を、,]*/, '')
    .replace(TRAIL_PARTICLES, '');
  if (out) out = out.replace(/(?:という|との|の)?(?:タスク|やること|todo)$/, '');
  out = unquote(out.replace(TRAIL_PARTICLES, ''));
  return GENERIC_TITLE.test(out) ? '' : out;
}

function extractRequestBody(t, found) {
  const s = removeFound(t, found);
  const i = s.search(/依頼/);
  const after = s.slice(i + 2).replace(new RegExp(`^(?:を|として)?${ADD_VERB}${POLITE}[:：、,]?`), '').replace(/^[をはで、,:：]+/, '');
  if (after && !/^(?:お願い|ください|して|する)/.test(after)) return unquote(after);
  // 「〇〇という開発依頼を登録」「〇〇を依頼」形式
  const before = s.slice(0, i).replace(/開発$/, '').replace(/^[にへで、,:：]+/, '').replace(/(という|との|の|を)$/, '');
  return unquote(before);
}

// 家計簿の分類名の言い方（音声認識では「・」が落ちる／言い換えられる）
const CATEGORY_ALIASES = [
  ['食費', ['食費', '食べ物', '食料品']], ['外食', ['外食']], ['日用品', ['日用品']], ['交通費', ['交通費', '交通']],
  ['医療・健康', ['医療', '健康', '医療費']], ['衣服・美容', ['衣服', '美容', '服']], ['趣味・娯楽', ['趣味', '娯楽']],
  ['教育・書籍', ['教育', '書籍', '本代']], ['水道光熱・通信', ['光熱', '水道', '通信', '電気代']],
].filter(([c]) => CATEGORIES.includes(c));
const LEDGER_RE = /(家計簿|支出|出費|レシート|いくら使|使ったお金)/;
// 「レシートを追加」は読み取り。「レシート機能を作るタスクを追加」のように間に別の語があればタスク追加。
const SCAN_DIRECT = /レシート(?:を|の|から)?(?:読み取|読みとり|スキャン|撮|取り込|追加|登録|入力)/;
const SCAN_VERB = /(読み取|読みとり|スキャン|撮|取り込)/;

const SHOW_WORD = /(表示|見せ|一覧|教えて|確認|見たい|見て|開いて|知りたい|[?？]$|は$|ある$)/;
const NAV_WORD = /(移動|行って|行く|開く|開いて|画面|ページ|見に)/;
const TASKISH = /(タスク|やる|やら|やるべき|すること|やること|予定|課題|宿題|こと)/;

/**
 * @param {string} raw 認識結果または手入力
 * @param {{currentProjectId?: string|null, selectedTaskId?: string|null}} ctx
 * @returns {{intent: string, projectId?: string|null, view?: string, title?: string, body?: string, mutating: boolean, summary: string}}
 */
export function parseCommand(raw, ctx = {}) {
  const t = normalize(raw);
  const found = findProject(t);
  const projectId = found?.id ?? null;
  const pName = projectId ? getProject(projectId).name : null;
  const scope = pName ? `${pName}の` : '';
  const res = (intent, extra = {}) => ({ intent, mutating: false, projectId, summary: '', ...extra });

  if (!t) return res('empty', { summary: '指示が空です' });

  if (/(未完了に|未完了へ|完了を取り消|完了を解除|完了をキャンセル|やり直|元に戻|もう一度|もう1度|もういちど|再開|終わってない|終わっていない)/.test(t)) {
    return res('uncomplete_task', { mutating: true, summary: '選択中のタスクを未完了に戻す' });
  }

  const endsWithAdd = SUFFIX_RE.test(t);

  // 家計簿・レシート。「家計簿をつけるを追加」のようなタスク追加は、下のタスク追加に任せる。
  const catEntry = CATEGORY_ALIASES.find(([, names]) => names.some((n) => t.includes(n)));
  const spendQuery = /(食費|外食|日用品|交通費|医療費|光熱費|電気代|通信費)(?:は|を)?(?:いくら|どれくらい|教えて|表示|見せて)/.test(t);
  if (LEDGER_RE.test(t) || spendQuery) {
    if (SCAN_DIRECT.test(t) || (/レシート/.test(t) && SCAN_VERB.test(t))) return res('scan_receipt', { summary: 'レシートを読み取る' });
    if (!endsWithAdd) {
      const month = /(先月|前月)/.test(t) ? 'last' : 'this';
      const category = catEntry ? catEntry[0] : null;
      return res('show_ledger', { month, category, summary: `${month === 'last' ? '先月' : '今月'}の${category ? `${category}の` : ''}家計簿を表示` });
    }
  }
  const isRequest = /(開発依頼|依頼(?:を|として)?(?:追加|登録|作成|記録)|依頼(?:して|する|します|ください|お願い(?:します)?)?$|(?:claude|クロード|ai)(?:に|へ)依頼)/.test(t);
  if (isRequest && (endsWithAdd || !SHOW_WORD.test(t))) {
    const body = extractRequestBody(t, found);
    const target = projectId ?? ctx.currentProjectId ?? null;
    return res('add_request', {
      projectId: target, body, mutating: true,
      summary: `${target ? getProject(target).name : '（プロジェクト未指定）'}に開発依頼を記録${body ? `：「${body}」` : ''}`,
    });
  }

  // 「レポートを確認するを追加」のように文末が追加の動詞なら、途中の「確認」等の語で表示指示と誤判定しない
  if (ADD_RE.test(t) && (endsWithAdd || !SHOW_WORD.test(t))) {
    const title = extractAddText(t, found);
    const target = projectId ?? ctx.currentProjectId ?? null;
    return res('add_task', {
      projectId: target, title, mutating: true,
      summary: `${target ? getProject(target).name : '（プロジェクト未指定）'}にタスクを追加${title ? `：「${title}」` : ''}`,
    });
  }

  if (/(削除|消して|消す|消去)/.test(t) && !SHOW_WORD.test(t)) {
    return res('delete_task', { mutating: true, danger: true, summary: '選択中のタスクを削除する' });
  }

  if (SHOW_WORD.test(t) && /(完了|終わった|済み)/.test(t) && !/未完了/.test(t)) {
    return res('show_tasks', { view: 'done', summary: `${scope}完了したタスクを表示` });
  }

  if (/(完了|終わった|終わり|終了|済みに|できた|チェック|やった|やり終え)/.test(t) && !SHOW_WORD.test(t) && !/未完了/.test(t)) {
    return res('complete_task', { mutating: true, summary: '選択中のタスクを完了にする' });
  }

  if (/(期限切れ|期限がきれ|遅れ|過ぎ)/.test(t)) {
    return res('show_tasks', { view: 'overdue', summary: `${scope}期限切れのタスクを表示` });
  }
  if (/(優先度.{0,2}高|高優先|重要|大事|大切|急ぎ|至急|緊急|優先)/.test(t)) {
    return res('show_tasks', { view: 'high', summary: `${scope}優先度の高いタスクを表示` });
  }
  if (/(今日|きょう|本日)/.test(t) && TASKISH.test(t)) {
    return res('show_tasks', { view: 'today', summary: `${scope}今日やるタスクを表示` });
  }
  if (/(開発状況|状況|進捗|進み具合|どこまで|状態|ホーム|トップ)/.test(t)) {
    return res('show_status', { summary: pName ? `${pName}の状況を表示` : '全プロジェクトの状況を表示' });
  }
  if (projectId && (SHOW_WORD.test(t) || NAV_WORD.test(t) || /タスク/.test(t) || t === found.alias)) {
    return res('show_project', { summary: `${pName}のタスクを表示` });
  }
  if (/(すべて|全て|全部|全体|横断|未完了|やり残し|残って|残り|未着手|やること|やるべき)/.test(t) || (SHOW_WORD.test(t) && /タスク/.test(t))) {
    return res('show_tasks', { view: 'open', summary: '全プロジェクトの未完了タスクを表示' });
  }
  return res('unknown', { summary: '指示を解釈できませんでした' });
}
```

## FILE: public/js/core/receipt.js

```js
// レシート解析・分類・家計簿の集計（純粋ロジック。DOM・保存に依存しない）。単体テスト対象。
import { addDays, isValidDate, newId, todayStr } from './model.js';

export const CATEGORIES = ['食費', '外食', '日用品', '交通費', '医療・健康', '衣服・美容', '趣味・娯楽', '教育・書籍', '水道光熱・通信', 'その他'];
export const CATEGORY_COLORS = {
  '食費': '#5b8a72', '外食': '#c0804a', '日用品': '#5a7fa6', '交通費': '#7a8aa0', '医療・健康': '#b5675a',
  '衣服・美容': '#a77fa0', '趣味・娯楽': '#c2a04a', '教育・書籍': '#6f9a9a', '水道光熱・通信': '#8a8f6a', 'その他': '#8d958f',
};

// ---- 正規化 ----
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function foldKana(s) { return kataToHira(String(s ?? '').normalize('NFKC').toLowerCase()); }
export function normalizeName(s) {
  return foldKana(s).replace(/[\s　・･*※★\-_/()（）[\]【】「」"'.,、。:：;]/g, '');
}

// ---- 分類 ----
// 品名に含まれる語から分類する。複数ヒットしたら最も長い語を優先（「パンツ」が「パン」に負けない）。
const KEYWORDS = {
  '食費': ['牛乳', '豆乳', '卵', 'たまご', '玉子', 'パン', '食パン', '米', 'お米', 'ご飯', 'ごはん', 'おにぎり', '弁当', '惣菜', 'サラダ', '野菜', 'トマト', 'きゅうり', 'にんじん', '人参', '玉ねぎ', 'たまねぎ',
    'じゃがいも', 'キャベツ', 'レタス', 'ほうれん草', 'ねぎ', '大根', '白菜', 'ピーマン', 'なす', 'もやし', 'きのこ', 'しいたけ', '果物', 'りんご', 'バナナ', 'みかん', 'いちご', 'ぶどう', 'レモン', 'おくら',
    '肉', '豚', '牛肉', '鶏', 'ひき肉', 'ハム', 'ソーセージ', 'ベーコン', '魚', '鮭', 'さば', '刺身', 'えび', 'いか', 'あじ', '豆腐', '納豆', '味噌', 'みそ', '醤油', 'しょうゆ', '砂糖', '塩', '油', 'マヨネーズ',
    'ケチャップ', 'ソース', 'カレー', 'パスタ', 'そば', 'うどん', '麺', 'ヨーグルト', 'チーズ', 'バター', 'ジュース', 'お茶', '茶', 'コーヒー', '珈琲', '紅茶', 'ビール', '酒', 'ワイン', 'チューハイ',
    'ミネラルウォーター', '天然水', '炭酸', '菓子', 'チョコ', 'スナック', 'アイス', 'ケーキ', 'ガム', 'ポテト', '冷凍', 'ふりかけ', 'のり', '海苔', 'ツナ', '缶詰', 'ヨーグルト', 'プリン', 'ゼリー'],
  '外食': ['ランチ', 'ディナー', '定食', 'ドリンク', 'ハンバーガー', 'バーガー', 'ピザ', '寿司', '丼', 'ラテ', 'モーニング', 'お通し', '飲み放題', 'コース', 'フライドポテト', 'ラーメン店'],
  '日用品': ['ティッシュ', 'トイレット', 'ペーパー', '洗剤', '洗濯', '柔軟剤', 'シャンプー', 'リンス', 'コンディショナー', 'ボディソープ', '石鹸', 'せっけん', '歯ブラシ', '歯磨き', '歯みがき', '食器', 'スポンジ',
    'ラップ', 'アルミホイル', 'ごみ袋', 'ゴミ袋', 'ポリ袋', 'レジ袋', '袋', '電池', '電球', 'マスク', 'ハンドソープ', '除菌', '消臭', '芳香', 'ハンガー', 'タオル', '掃除', 'キッチン', '綿棒', 'ナプキン', 'おむつ',
    'ベビー', 'ペットフード', 'ペット', '油性', 'ライター', 'ゴム手袋', '洗い'],
  '衣服・美容': ['シャツ', 'パンツ', 'ズボン', 'スカート', '靴下', '下着', 'コート', 'ジャケット', '靴', 'シューズ', 'バッグ', '帽子', '手袋', 'マフラー', '化粧', 'ファンデ', '口紅', 'リップ', '乳液', '化粧水', '美容',
    'ヘア', 'カット', 'パーマ', '香水', 'パンスト', 'ストッキング'],
  '医療・健康': ['薬', '錠', 'ビタミン', 'サプリ', '絆創膏', 'ばんそうこう', '包帯', '湿布', '目薬', '体温計', '風邪', '病院', '診察', '診療', '処方', '歯科', '消毒', '頭痛', '胃腸'],
  '交通費': ['電車', 'jr', '地下鉄', 'バス', 'タクシー', '切符', '乗車', '運賃', '交通', 'suica', 'icoca', 'pasmo', 'チャージ', 'ガソリン', '高速', '駐車', 'パーキング'],
  '趣味・娯楽': ['映画', 'チケット', 'ゲーム', '漫画', 'まんが', '雑誌', 'カラオケ', 'ライブ', '入場', 'おもちゃ', '玩具', 'cd', 'dvd', 'ブルーレイ', 'ガチャ', '釣り', 'ゴルフ', 'カードゲーム'],
  '教育・書籍': ['書籍', '単行本', '文庫', '新書', '参考書', '問題集', '教科書', 'ノート', '辞書', '受講', '授業料', '学費', 'コピー', '印刷', 'ペン', '鉛筆', 'シャーペン', '消しゴム', 'ファイル', 'レポート用紙'],
  '水道光熱・通信': ['電気', 'ガス代', '水道', '通信', '携帯', 'スマホ', 'インターネット', 'wi-fi', 'wifi', '料金', '電話代', 'nhk', '受信料'],
};
const KEYWORD_LIST = Object.entries(KEYWORDS).flatMap(([category, kws]) => kws.map((kw) => ({ kw: normalizeName(kw), category })));

// 店名から分類を補正する。override は店の種類が決まる業態（外食・交通）、fallback は品名で分からない時のみ。
const STORE_OVERRIDE = [
  [/(カフェ|珈琲|コーヒー店|喫茶|ラーメン|食堂|レストラン|居酒屋|マクドナルド|モスバーガー|吉野家|すき家|松屋|スターバックス|スタバ|ドトール|サイゼリヤ|ガスト|焼肉|寿司|すし|バーガー|ファミレス|うどん店|そば店)/i, '外食'],
  [/(JR|電鉄|鉄道|タクシー|ガソリンスタンド|ENEOS|エネオス|出光)/i, '交通費'],
];
const STORE_FALLBACK = [
  [/(薬局|ドラッグ|クリニック|病院|歯科|医院)/, '医療・健康'],
  [/(書店|ブックス|文具)/, '教育・書籍'],
  [/(ホームセンター|100円|ダイソー|セリア|ドラッグ|ニトリ)/, '日用品'],
  [/(スーパー|マート|ストア|市場|青果|精肉|鮮魚|パン屋|ベーカリー|コンビニ|ファミリーマート|ローソン|セブン)/, '食費'],
];

export function categorize(name, { rules = [], store = '' } = {}) {
  const key = normalizeName(name);
  const learned = rules.find((r) => r.id === key);
  if (learned && CATEGORIES.includes(learned.category)) return learned.category;
  for (const [re, cat] of STORE_OVERRIDE) if (re.test(store)) return cat;
  let best = null;
  for (const { kw, category } of KEYWORD_LIST) {
    if (kw && key.includes(kw) && (!best || kw.length > best.kw.length)) best = { kw, category };
  }
  if (best) return best.category;
  for (const [re, cat] of STORE_FALLBACK) if (re.test(store)) return cat;
  return 'その他';
}

export function makeRule(name, category, now = new Date()) {
  return { id: normalizeName(name), name: String(name).trim().slice(0, 100), category, updatedAt: now.toISOString() };
}

// ---- 金額 ----
export function parseYen(raw) {
  const s = String(raw ?? '').normalize('NFKC').replace(/[¥\\\s円]/g, '');
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, '')); // OCRは「,」を「.」と読むことがある
  if (/^-?\d+$/.test(s)) return Number(s);
  return NaN;
}

// ---- テキスト解析 ----
const ITEM_LINE = /^(.*?)(\s*(?:[¥\\Y]\s*)?)(-?\d{1,3}(?:[.,]\d{3})+|-?\d+)\s*円?\s*[※*★軽]?\s*$/;
const SKIP_LINE = /(小計|合計|総合計|お買上|お買い上|税込|税抜|消費税|内税|外税|対象|お預|お釣|おつり|釣銭|釣り|現金|クレジット|カード|ポイント|点数|電話|tel|レジ|担当|no\.|領収|お支払|支払|割引券|会員|残高|ご利用|様|\d{1,2}:\d{2}|\d{4}[/\-.年]\d{1,2}|〒|http)/i;
const DISCOUNT = /(値引|割引|ディスカウント|クーポン)/;
const TOTAL_LINE = /(合計|総合計|お買上|お買い上げ|請求|total)/i;
const TOTAL_EXCLUDE = /(小計|点数|税|内|預|釣)/;
const MAX_YEN = 10_000_000;

const joinCjkSpaces = (s) => s.replace(/(?<=[぀-ヿ一-鿿])[ 　]+(?=[぀-ヿ一-鿿])/g, '');

function parseDate(text, now) {
  const today = todayStr(now);
  const earliest = addDays(today, -366);
  const latest = addDays(today, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const ok = (y, m, d) => { const s = `${y}-${pad(m)}-${pad(d)}`; return isValidDate(s) && s >= earliest && s <= latest ? s : null; };
  let m;
  if ((m = text.match(/(20\d{2})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/))) { const r = ok(m[1], +m[2], +m[3]); if (r) return r; }
  if ((m = text.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)) || (m = text.match(/\bR\s*(\d{1,2})[./年](\d{1,2})[./月](\d{1,2})/))) { const r = ok(2018 + +m[1], +m[2], +m[3]); if (r) return r; }
  if ((m = text.match(/(?<![\d-])(\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})(?![\d-])/))) { const r = ok(2000 + +m[1], +m[2], +m[3]); if (r) return r; }
  return null;
}

function parseStore(lines) {
  for (const line of lines.slice(0, 8)) {
    const l = line.trim();
    if (l.length < 2 || /(tel|電話|〒|http|領収|レシート|\d{4}\s*年|\d+[:：]\d+|^[\d\s\-－ー=*＊]+$)/i.test(l)) continue;
    if (!/[぀-ヿ一-鿿A-Za-z]/.test(l)) continue;
    const m = l.match(ITEM_LINE);
    if (m && m[3] && !SKIP_LINE.test(l) && Number.isFinite(parseYen(m[3])) && /[\s¥\\]/.test(m[2])) continue; // 金額つきの行は店名ではない
    return joinCjkSpaces(l).slice(0, 40);
  }
  return '';
}

/**
 * OCR結果などのテキストから、日付・店名・明細・合計を取り出す。
 * 完全には読めない前提で、warnings に注意点を入れて返す（UIで必ず確認・修正する）。
 */
export function parseReceiptText(rawText, { now = new Date(), rules = [] } = {}) {
  const text = String(rawText ?? '').normalize('NFKC');
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, '')).filter((l) => l.trim());
  const warnings = [];

  const date = parseDate(text, now);
  if (!date) warnings.push('日付を読み取れませんでした。今日の日付を入れています。確認してください。');
  const store = parseStore(lines);

  const items = [];
  let total = null;
  const totals = [];
  for (const line of lines) {
    const l = line.trim();
    if (TOTAL_LINE.test(l) && !TOTAL_EXCLUDE.test(l)) {
      const m = l.match(ITEM_LINE);
      const v = m ? parseYen(m[3]) : NaN;
      if (Number.isFinite(v) && v > 0 && v <= MAX_YEN) totals.push(v);
      continue;
    }
    if (!DISCOUNT.test(l) && SKIP_LINE.test(l)) continue;
    const m = l.match(ITEM_LINE);
    if (!m) continue;
    let name = joinCjkSpaces(m[1].trim()).replace(/^\d{6,}\s*/, '').replace(/^[・*※★]+|[・*※★\s]+$/g, '');
    const sepHasGap = /[\s¥\\Y]/.test(m[2]);
    if (!sepHasGap && /[\d\-/:.,]$/.test(name)) continue; // 住所・電話番号・日付の端数を明細にしない
    if (!name || !/[぀-ヿ一-鿿A-Za-z]/.test(name) || name.length > 100) continue;
    let amount = parseYen(m[3]);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_YEN) continue;
    const isDiscount = DISCOUNT.test(name);
    if (isDiscount) amount = -Math.abs(amount); // OCRがマイナスを落としても割引は負にする
    items.push({ name, amount, category: 'その他', _discount: isDiscount });
  }
  if (totals.length) total = Math.max(...totals);

  let prev = null;
  for (const it of items) {
    it.category = it._discount && prev ? prev : categorize(it.name, { rules, store });
    if (!it._discount) prev = it.category;
    delete it._discount;
  }

  const sum = items.reduce((a, i) => a + i.amount, 0);
  if (!items.length) warnings.push('明細を読み取れませんでした。手入力で追加してください。');
  if (total !== null && items.length && sum !== total) warnings.push(`明細の合計（¥${sum.toLocaleString('ja-JP')}）がレシートの合計（¥${total.toLocaleString('ja-JP')}）と一致しません。読み間違いや抜けがないか確認してください。`);
  if (total === null && items.length) warnings.push('合計の行を読み取れませんでした。明細の合計を使います。');

  return { date: date || todayStr(now), dateFound: !!date, store, items, total: total ?? sum, warnings };
}

// ---- レシート（家計簿の1件）----
const STORE_MAX = 60;
const RAW_MAX = 5000;

function validateReceiptFields(f) {
  const errors = {};
  if (!isValidDate(f.date)) errors.date = '日付が正しくありません';
  const store = typeof f.store === 'string' ? f.store.trim() : '';
  if (store.length > STORE_MAX) errors.store = `店名は${STORE_MAX}文字以内にしてください`;
  const items = [];
  if (!Array.isArray(f.items) || !f.items.length) errors.items = '品目を1つ以上入力してください';
  else {
    f.items.forEach((it, i) => {
      const name = typeof it?.name === 'string' ? it.name.trim() : '';
      const amount = Number(it?.amount);
      if (!name || name.length > 100) errors[`item-${i}-name`] = '品名を入力してください（100文字以内）';
      else if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_YEN) errors[`item-${i}-amount`] = '金額は0以外の整数で入力してください';
      else if (!CATEGORIES.includes(it.category)) errors[`item-${i}-category`] = '分類が正しくありません';
      else items.push({ name, amount, category: it.category });
    });
    if (f.items.length > 200) errors.items = '品目が多すぎます（200件まで）';
  }
  const rawText = typeof f.rawText === 'string' ? f.rawText.slice(0, RAW_MAX) : '';
  return { errors, value: { date: f.date, store, items, total: items.reduce((a, i) => a + i.amount, 0), rawText, source: f.source === 'ocr' ? 'ocr' : 'manual' } };
}

export function createReceipt(input, now = new Date(), id = newId('rcp-')) {
  const { errors, value } = validateReceiptFields(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return { ok: true, receipt: { id, ...value, createdAt: iso, updatedAt: iso } };
}

export function updateReceipt(receipt, patch, now = new Date()) {
  const { errors, value } = validateReceiptFields({ ...receipt, ...patch });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, receipt: { ...receipt, ...value, updatedAt: now.toISOString() } };
}

/** バックアップ読み込み用：不正なら null（例外を投げない） */
export function sanitizeReceipt(raw, nowIso) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const r = createReceipt(raw, new Date(nowIso), raw.id);
  if (!r.ok) return null;
  const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : nowIso);
  return { ...r.receipt, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
}

export function sanitizeRule(raw, nowIso) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || !CATEGORIES.includes(raw.category)) return null;
  return { id: raw.id, name: String(raw.name ?? raw.id).slice(0, 100), category: raw.category, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso };
}

// ---- 集計 ----
export const monthOf = (dateStr) => dateStr.slice(0, 7);
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const isValidMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const monthLabel = (month) => `${month.slice(0, 4)}年${Number(month.slice(5))}月`;

export function receiptsInMonth(receipts, month) {
  return receipts.filter((r) => monthOf(r.date) === month).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export function monthSummary(receipts, month) {
  const list = receiptsInMonth(receipts, month);
  const byCat = new Map();
  let total = 0;
  for (const r of list) for (const it of r.items) { byCat.set(it.category, (byCat.get(it.category) || 0) + it.amount); total += it.amount; }
  const categories = [...byCat.entries()].map(([category, amount]) => ({ category, amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  return { month, total, count: list.length, categories };
}

/** カテゴリで絞った時の、そのレシート内の該当金額 */
export const amountInCategory = (receipt, category) => receipt.items.filter((i) => !category || i.category === category).reduce((a, i) => a + i.amount, 0);

// ---- CSV（Excel互換。式として解釈される先頭文字は無効化）----
const csvCell = (v) => {
  let s = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(receipts) {
  const rows = [['日付', '店名', '品名', '金額', '分類']];
  for (const r of [...receipts].sort((a, b) => (a.date < b.date ? -1 : 1))) for (const it of r.items) rows.push([r.date, r.store, it.name, it.amount, it.category]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
```

## FILE: public/js/core/backup.js

```js
// バックアップ（JSON）の書き出しと検証つき読み込み。v1（タスク・依頼のみ）も読める。
import { APPROVAL_LABEL, NOTE_MAX, PRIORITIES, REQUEST_MAX, REQUEST_STATUS_LABEL, TITLE_MAX, getProject, isValidDate } from './model.js';
import { sanitizeReceipt, sanitizeRule } from './receipt.js';

export const BACKUP_APP = 'ai-control-panel';
export const BACKUP_VERSION = 2;
const SUPPORTED_VERSIONS = [1, 2];
const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

export function buildBackup({ tasks = [], requests = [], receipts = [], rules = [] }, now = new Date()) {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), tasks, requests, receipts, rules };
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const isoOr = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

export function parseBackup(text, now = new Date()) {
  if (typeof text !== 'string' || text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'ファイルが大きすぎます' };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'JSONとして読み込めません' }; }
  if (!data || data.app !== BACKUP_APP) return { ok: false, error: 'このアプリのバックアップではありません' };
  if (!SUPPORTED_VERSIONS.includes(data.version)) return { ok: false, error: `未対応のバージョンです（${data.version}）` };
  if (!Array.isArray(data.tasks) || !Array.isArray(data.requests)) return { ok: false, error: 'データの形式が正しくありません' };
  if (data.version >= 2 && (!Array.isArray(data.receipts) || !Array.isArray(data.rules))) return { ok: false, error: 'データの形式が正しくありません' };

  const nowIso = now.toISOString();
  const warnings = [];
  const seen = new Set();
  const tasks = [];
  for (const raw of data.tasks) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const id = str(t.id);
    const title = str(t.title).trim().slice(0, TITLE_MAX);
    if (!id || !title || seen.has(id)) { warnings.push('不正または重複したタスクを1件スキップしました'); continue; }
    if (!getProject(t.projectId)) { warnings.push(`未知のプロジェクトのタスクをスキップ: ${title}`); continue; }
    seen.add(id);
    const done = t.done === true;
    const task = {
      id, projectId: t.projectId, title,
      note: str(t.note).slice(0, NOTE_MAX),
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'mid',
      due: isValidDate(t.due) ? t.due : null,
      done, doneAt: done ? isoOr(t.doneAt, nowIso) : null,
      createdAt: isoOr(t.createdAt, nowIso), updatedAt: isoOr(t.updatedAt, nowIso),
    };
    if (t.sample === true) task.sample = true;
    tasks.push(task);
  }
  const seenReq = new Set();
  const requests = [];
  for (const raw of data.requests) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const id = str(r.id);
    const body = str(r.body).trim().slice(0, REQUEST_MAX);
    if (!id || !body || seenReq.has(id) || !getProject(r.projectId)) { warnings.push('不正な開発依頼を1件スキップしました'); continue; }
    seenReq.add(id);
    requests.push({
      id, projectId: r.projectId, body,
      createdAt: isoOr(r.createdAt, nowIso), updatedAt: isoOr(r.updatedAt, nowIso),
      approval: Object.keys(APPROVAL_LABEL).includes(r.approval) ? r.approval : 'pending',
      status: Object.keys(REQUEST_STATUS_LABEL).includes(r.status) ? r.status : 'waiting',
    });
  }
  const seenRcp = new Set();
  const receipts = [];
  for (const raw of Array.isArray(data.receipts) ? data.receipts : []) {
    const r = sanitizeReceipt(raw, nowIso);
    if (!r || seenRcp.has(r.id)) { warnings.push('不正または重複したレシートを1件スキップしました'); continue; }
    seenRcp.add(r.id);
    receipts.push(r);
  }
  const rules = [];
  for (const raw of Array.isArray(data.rules) ? data.rules : []) {
    const r = sanitizeRule(raw, nowIso);
    if (r) rules.push(r); else warnings.push('不正な分類ルールを1件スキップしました');
  }
  return { ok: true, tasks, requests, receipts, rules, warnings };
}
```

## FILE: public/js/core/ocr.js

```js
// 端末内OCR（Tesseract.js を public/vendor に同梱。画像は外部へ送信しない）。ブラウザ専用。
const VENDOR = () => new URL('vendor/tesseract/', document.baseURI).href;

let scriptPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = `${VENDOR()}tesseract.min.js`;
      el.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract が見つかりません')));
      el.onerror = () => { scriptPromise = null; reject(new Error('文字認識の部品を読み込めませんでした（オフライン、または初回の読み込みに失敗）')); };
      document.head.append(el);
    });
  }
  return scriptPromise;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 下のImage経由にフォールバック */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

/** 大きすぎる写真は縮小し、小さい画像は拡大して、グレースケール化＋コントラスト補正する */
export async function prepareImage(file) {
  const src = await decode(file);
  const w0 = src.width, h0 = src.height;
  const long = Math.max(w0, h0);
  const scale = long > 2200 ? 2200 / long : Math.min(w0, h0) < 700 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale); canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = canvas.width * canvas.height;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo > 20) {
    const k = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = g; }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const STATUS_JA = {
  'loading tesseract core': '文字認識エンジンを読み込み中…',
  'initializing tesseract': '準備中…',
  'loading language traineddata': '日本語データを読み込み中（初回のみ時間がかかります）…',
  'initializing api': '準備中…',
  'recognizing text': '文字を読み取り中…',
};

/** 画像ファイルから文字列を読み取る。onProgress(メッセージ, 0〜1) */
export async function recognizeImage(file, onProgress = () => {}) {
  onProgress('画像を準備中…', 0);
  const canvas = await prepareImage(file);
  onProgress('文字認識エンジンを読み込み中…', 0);
  const T = await loadTesseract();
  const base = VENDOR();
  const worker = await T.createWorker('jpn', 1, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`, gzip: false,
    logger: (m) => onProgress(STATUS_JA[m.status] || '処理中…', m.progress || 0),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { text: data.text || '', confidence: data.confidence ?? null };
  } finally {
    await worker.terminate().catch(() => {}); // iPadのメモリを空ける
  }
}
```

## FILE: public/js/storage/repository.js

```js
// 保存層。UIはこのリポジトリのメソッドだけを使う。
// 将来クラウド同期を足す場合は、同じメソッドを持つ別バックエンドを渡す。

const STORES = ['tasks', 'requests', 'receipts', 'rules'];
const DB_VERSION = 2; // v2: receipts, rules を追加（既存のtasks/requestsはそのまま残る）

export function createMemoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    persistent: false,
    async getAll(store) { return [...data[store].values()].map((v) => structuredClone(v)); },
    async putMany(store, values) { for (const v of values) data[store].set(v.id, structuredClone(v)); },
    async remove(store, id) { data[store].delete(id); },
    async replaceAll(next) {
      for (const s of STORES) {
        data[s].clear();
        for (const v of next[s] || []) data[s].set(v.id, structuredClone(v));
      }
    },
  };
}

const idbRequest = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
});

export async function createIdbBackend(dbName = 'ai-control-panel') {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, DB_VERSION);
    open.onupgradeneeded = () => {
      for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return {
    kind: 'indexeddb',
    persistent: true,
    async getAll(store) { return idbRequest(db.transaction(store).objectStore(store).getAll()); },
    async putMany(store, values) {
      const tx = db.transaction(store, 'readwrite');
      for (const v of values) tx.objectStore(store).put(v);
      await idbDone(tx);
    },
    async remove(store, id) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      await idbDone(tx);
    },
    async replaceAll(next) {
      const tx = db.transaction(STORES, 'readwrite');
      for (const s of STORES) {
        tx.objectStore(s).clear();
        for (const v of next[s] || []) tx.objectStore(s).put(v);
      }
      await idbDone(tx);
    },
  };
}

// IndexedDB が使えない環境（一部のプライベートモードなど）ではメモリ保存に切り替える。
export async function openBackend(dbName) {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    return await createIdbBackend(dbName);
  } catch {
    return createMemoryBackend();
  }
}

export function createRepository(backend) {
  return {
    kind: backend.kind,
    persistent: backend.persistent,
    async loadAll() {
      const [tasks, requests, receipts, rules] = await Promise.all(STORES.map((s) => backend.getAll(s)));
      return { tasks, requests, receipts, rules };
    },
    putTask: (t) => backend.putMany('tasks', [t]),
    putTasks: (ts) => backend.putMany('tasks', ts),
    deleteTask: (id) => backend.remove('tasks', id),
    putRequest: (r) => backend.putMany('requests', [r]),
    deleteRequest: (id) => backend.remove('requests', id),
    putReceipt: (r) => backend.putMany('receipts', [r]),
    deleteReceipt: (id) => backend.remove('receipts', id),
    putRules: (rs) => backend.putMany('rules', rs),
    clearRules: async () => { const all = await backend.getAll('rules'); for (const r of all) await backend.remove('rules', r.id); },
    putMany: (data) => Promise.all(STORES.map((s) => backend.putMany(s, data[s] || []))),
    replaceAll: (data) => backend.replaceAll(data),
    clearAll: () => backend.replaceAll(Object.fromEntries(STORES.map((s) => [s, []]))),
  };
}

export async function openRepository(dbName) {
  return createRepository(await openBackend(dbName));
}
```

## FILE: public/js/ledger.js

```js
// 家計簿の画面（レシート読み取り・確認フォーム・月別集計）。app.js から createLedger(env) で組み込む。
import * as R from './core/receipt.js';
import { addDays, todayStr } from './core/model.js';
import { recognizeImage } from './core/ocr.js';

const yen = (n) => `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const dateLabel = (d) => { const [y, m, day] = d.split('-').map(Number); return `${m}/${day}(${WEEK[new Date(y, m - 1, day).getDay()]})`; };

export function createLedger(env) {
  const { state, $, esc, toast, guard, choose, confirmDialog, render, go } = env;
  const thisMonth = () => R.monthOf(todayStr());

  function ledgerQuery(q) {
    const month = R.isValidMonth(q.get('month')) ? q.get('month') : thisMonth();
    const cat = R.CATEGORIES.includes(q.get('cat')) ? q.get('cat') : null;
    return { month, cat };
  }
  const href = (month, cat) => `#/ledger?${new URLSearchParams({ month, ...(cat ? { cat } : {}) })}`;

  // ---------- 画面 ----------
  function view(q) {
    const { month, cat } = ledgerQuery(q);
    const sum = R.monthSummary(state.receipts, month);
    const list = R.receiptsInMonth(state.receipts, month).filter((r) => !cat || r.items.some((i) => i.category === cat));
    const cats = sum.categories.map((c) => `
      <a class="catrow" href="${href(month, cat === c.category ? null : c.category)}" ${cat === c.category ? 'aria-current="true"' : ''} style="--cc:${R.CATEGORY_COLORS[c.category]}">
        <span class="cat-name"><i class="swatch" aria-hidden="true"></i>${esc(c.category)}</span>
        <span class="cat-amt">${yen(c.amount)} <small>${c.percent}%</small></span>
        <span class="cat-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.percent))}%"></i></span>
      </a>`).join('');
    const rows = list.map((r) => {
      const badges = [...new Set(r.items.map((i) => i.category))].slice(0, 3).map((c) => `<span class="badge" style="--cc:${R.CATEGORY_COLORS[c]}"><i class="swatch" aria-hidden="true"></i>${esc(c)}</span>`).join('');
      return `<li class="rcp"><button type="button" class="rcp-main" data-action="ledger-open" data-id="${esc(r.id)}">
        <span class="rcp-date">${esc(dateLabel(r.date))}</span>
        <span class="rcp-body"><span class="title">${esc(r.store || '（店名なし）')}</span><span class="meta">${badges}<span class="muted">${r.items.length}品目</span></span></span>
        <span class="rcp-amt">${yen(R.amountInCategory(r, cat))}</span></button></li>`;
    }).join('');
    const isThis = month === thisMonth();
    return `<div class="page-head"><h1>家計簿</h1>
        <div class="btn-row"><button class="btn primary" type="button" data-action="ledger-scan">📷 レシートを読み取る</button>
          <button class="btn" type="button" data-action="ledger-new">＋ 手入力</button></div></div>
      <nav class="month-nav" aria-label="月の切り替え">
        <a class="btn" href="${href(R.shiftMonth(month, -1))}" aria-label="前の月">◀</a>
        <b>${esc(R.monthLabel(month))}</b>
        <a class="btn" href="${href(R.shiftMonth(month, 1))}" aria-label="次の月">▶</a>
        ${isThis ? '' : `<a class="btn small ghost" href="${href(thisMonth())}">今月へ</a>`}</nav>
      <section class="spend" aria-label="支出の合計"><span class="muted">${isThis ? '今月' : esc(R.monthLabel(month))}の支出</span>
        <b data-testid="month-total">${yen(sum.total)}</b><span class="muted">レシート${sum.count}件</span></section>
      ${sum.categories.length ? `<h2>分類別</h2><div class="cats">${cats}</div>` : ''}
      <h2>${cat ? `${esc(cat)}のレシート` : 'レシート'}${cat ? ` <a class="btn small ghost" href="${href(month)}">絞り込みを解除</a>` : ''}</h2>
      ${list.length ? `<ul class="tasks">${rows}</ul>` : `<div class="empty">${sum.count ? 'この分類のレシートはありません' : 'この月のレシートはまだありません。「レシートを読み取る」か「手入力」で追加できます。'}</div>`}
      ${sum.count ? `<div class="btn-row" style="margin-top:14px"><button class="btn" type="button" data-action="ledger-csv" data-month="${month}">${esc(R.monthLabel(month))}をCSVで書き出す</button></div>` : ''}`;
  }

  // ---------- 読み取りシート ----------
  function openScan() {
    const dlg = $('#scan-dialog');
    dlg.innerHTML = `<div class="sheet-head"><h2 id="scan-title">レシートを読み取る</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
      <p class="notice">写真の文字認識は<b>この端末の中だけ</b>で行います。画像は保存も送信もしません。読み取った内容は、保存前に必ず確認・修正できます。</p>
      <div class="form">
        <label class="btn primary big" for="scan-file" id="scan-file-label">📷 写真を撮る／選ぶ</label>
        <input id="scan-file" class="sr-only" type="file" accept="image/*">
        <div id="scan-progress" class="interp" hidden><span id="scan-msg">準備中…</span><div class="progress"><i id="scan-bar" style="width:0%"></i></div></div>
        <div id="scan-error" class="interp warn" hidden></div>
        <details class="examples"><summary>撮影のコツ</summary><ul>
          <li>レシートを平らに置き、真上から、文字が横向きになるように撮ります。</li>
          <li>明るい場所で、影や折れ目が文字にかからないようにします。</li>
          <li>長いレシートは、全体が入るよう縦長に撮ります。</li></ul></details>
        <details class="examples"><summary>写真から文字をコピーして貼り付ける（精度が高いことがあります）</summary>
          <p class="muted">iPadの写真アプリでレシートを開き、文字を長押ししてコピー（テキスト認識）→ ここに貼り付けます。</p>
          <textarea id="scan-paste" placeholder="ここにレシートの文字を貼り付け" aria-label="レシートのテキスト"></textarea>
          <div class="form-actions"><button type="button" class="btn" data-act="parse-text">このテキストを解析</button></div></details>
        <div class="form-actions"><button type="button" class="btn ghost" data-act="manual">手入力にする</button></div>
      </div>`;
    const setErr = (msg) => { const el = $('#scan-error', dlg); el.hidden = !msg; el.textContent = msg || ''; };
    const finish = (text, source) => {
      const parsed = R.parseReceiptText(text, { rules: state.rules });
      dlg.close();
      openForm({ parsed: { ...parsed, rawText: text, source } });
    };
    $('#scan-file', dlg).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setErr('');
      const prog = $('#scan-progress', dlg);
      prog.hidden = false;
      $('#scan-file-label', dlg).setAttribute('aria-disabled', 'true');
      try {
        const { text } = await recognizeImage(file, (msg, p) => { $('#scan-msg', dlg).textContent = msg; $('#scan-bar', dlg).style.width = `${Math.round(p * 100)}%`; });
        if (!dlg.open) return; // 途中で閉じられた
        finish(text, 'ocr');
      } catch (err) {
        console.error(err);
        prog.hidden = true;
        setErr(`読み取れませんでした：${err.message || err}。写真を撮り直すか、下の「テキストを貼り付け」「手入力」をお使いください。`);
      } finally { e.target.value = ''; $('#scan-file-label', dlg).removeAttribute('aria-disabled'); }
    };
    dlg.onclick = (e) => {
      if (e.target.closest('[data-close]')) return dlg.close();
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'parse-text') {
        const text = $('#scan-paste', dlg).value;
        if (!text.trim()) return setErr('テキストを貼り付けてください');
        finish(text, 'manual');
      } else if (act === 'manual') { dlg.close(); openForm({}); }
    };
    dlg.showModal();
  }

  // ---------- レシート確認・編集フォーム ----------
  const catOptions = (sel) => R.CATEGORIES.map((c) => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const rowHtml = (it = { name: '', amount: '', category: 'その他' }) => `<div class="rrow" data-row>
      <input class="r-name" type="text" autocomplete="off" aria-label="品名" placeholder="品名" value="${esc(it.name)}">
      <input class="r-amount" type="text" inputmode="numeric" autocomplete="off" aria-label="金額（円）" placeholder="金額" value="${esc(it.amount)}">
      <select class="r-cat" aria-label="分類">${catOptions(it.category)}</select>
      <button type="button" class="btn small ghost" data-rm aria-label="この行を削除">✕</button></div>`;

  function openForm({ receipt = null, parsed = null } = {}) {
    const dlg = $('#receipt-dialog');
    const base = receipt || parsed || { date: todayStr(), store: '', items: [], rawText: '', source: 'manual', warnings: [] };
    const items = base.items.length ? base.items : [{ name: '', amount: '', category: 'その他' }];
    const warnings = parsed?.warnings || [];
    dlg.innerHTML = `<div class="sheet-head"><h2 id="receipt-title">${receipt ? 'レシートを編集' : parsed ? '読み取り結果を確認' : 'レシートを手入力'}</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
      ${parsed ? '<p class="notice">文字認識は間違えることがあります。<b>日付・店名・品名・金額・分類</b>を確認し、直してから保存してください。</p>' : ''}
      ${warnings.map((w) => `<div class="interp warn">⚠️ ${esc(w)}</div>`).join('')}
      <form class="form" id="receipt-form" novalidate>
        <div class="two"><div class="field"><label for="rf-date">日付</label><input id="rf-date" type="date" value="${esc(base.date)}"></div>
          <div class="field"><label for="rf-store">店名</label><input id="rf-store" type="text" maxlength="60" autocomplete="off" value="${esc(base.store || '')}"></div></div>
        <div class="field"><span class="label">品目</span><div id="rf-rows" class="rrows">${items.map(rowHtml).join('')}</div>
          <button type="button" class="btn small" data-add-row>＋ 品目を追加</button></div>
        <div class="rtotal"><span>合計</span><b id="rf-total" data-testid="form-total">¥0</b>${parsed?.total != null && parsed.items.length ? `<span class="muted">レシート記載: ${yen(parsed.total)}</span>` : ''}</div>
        <div id="rf-errors" class="err" role="alert"></div>
        ${base.rawText ? `<details class="examples"><summary>読み取ったテキストを見る</summary><pre class="raw">${esc(base.rawText)}</pre></details>` : ''}
        <div class="form-actions">${receipt ? '<button type="button" class="btn danger" data-act="delete">削除</button>' : ''}<button type="submit" class="btn primary">保存</button></div>
      </form>`;
    const form = $('#receipt-form', dlg);
    const rowsEl = $('#rf-rows', dlg);
    const readRows = () => [...rowsEl.querySelectorAll('[data-row]')].map((row) => {
      const raw = row.querySelector('.r-amount').value.trim();
      const n = R.parseYen(raw === '' ? 'x' : raw);
      return { name: row.querySelector('.r-name').value, amount: Number.isNaN(n) ? raw : n, category: row.querySelector('.r-cat').value };
    });
    const updateTotal = () => {
      const t = readRows().reduce((a, i) => a + (typeof i.amount === 'number' ? i.amount : 0), 0);
      $('#rf-total', dlg).textContent = yen(t);
    };
    updateTotal();
    form.addEventListener('input', updateTotal);
    // 品名を直したら、まだ分類を手で変えていない行は分類も推測し直す
    rowsEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('r-cat')) e.target.dataset.manual = '1';
      if (e.target.classList.contains('r-name')) {
        const sel = e.target.closest('[data-row]').querySelector('.r-cat');
        if (!sel.dataset.manual) sel.value = R.categorize(e.target.value, { rules: state.rules, store: $('#rf-store', dlg).value });
      }
    });
    dlg.onclick = async (e) => {
      if (e.target.closest('[data-close]')) return dlg.close();
      if (e.target.closest('[data-add-row]')) { rowsEl.insertAdjacentHTML('beforeend', rowHtml()); rowsEl.lastElementChild.querySelector('.r-name').focus(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { if (rowsEl.children.length > 1) rm.closest('[data-row]').remove(); else rm.closest('[data-row]').querySelectorAll('input').forEach((i) => { i.value = ''; }); updateTotal(); return; }
      if (e.target.closest('[data-act="delete"]')) {
        if (await confirmDialog('このレシートを削除しますか？', `${receipt.store || '（店名なし）'}　${yen(receipt.total)}`, '削除する')) { dlg.close(); await removeReceipt(receipt); }
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = { date: $('#rf-date', dlg).value, store: $('#rf-store', dlg).value, items: readRows().filter((i) => i.name.trim() || String(i.amount).trim()), rawText: base.rawText || '', source: base.source || 'manual' };
      const res = receipt ? R.updateReceipt(receipt, input) : R.createReceipt(input);
      rowsEl.querySelectorAll('[data-row]').forEach((r) => r.classList.remove('bad'));
      if (!res.ok) {
        const msgs = Object.values(res.errors);
        $('#rf-errors', dlg).textContent = [...new Set(msgs)].join(' / ');
        const rowEls = [...rowsEl.querySelectorAll('[data-row]')];
        const filtered = readRows();
        // フィルタ後の行番号 → 画面上の行に対応づけ
        let k = 0;
        rowEls.forEach((el, i) => { const it = filtered[i]; if (it.name.trim() || String(it.amount).trim()) { if (Object.keys(res.errors).some((key) => key.startsWith(`item-${k}-`))) el.classList.add('bad'); k++; } });
        return;
      }
      await guard(async () => {
        await saveReceipt(res.receipt);
        await learnRules(res.receipt);
        dlg.close();
        const month = R.monthOf(res.receipt.date);
        go(href(month));
        toast(`${receipt ? '保存しました' : 'レシートを追加しました'}（${yen(res.receipt.total)}）`, receipt ? null : () => guard(() => removeReceipt(res.receipt, true)));
      });
    };
    dlg.showModal();
    if (!parsed && !receipt) $('.r-name', dlg).focus();
  }

  // ---------- 保存・学習 ----------
  async function saveReceipt(r) {
    const i = state.receipts.findIndex((x) => x.id === r.id);
    if (i >= 0) state.receipts[i] = r; else state.receipts.push(r);
    render();
    await state.repo.putReceipt(r);
  }
  async function removeReceipt(r, silent = false) {
    state.receipts = state.receipts.filter((x) => x.id !== r.id);
    render();
    await state.repo.deleteReceipt(r.id);
    if (!silent) toast('レシートを削除しました', () => guard(() => saveReceipt(r)));
  }
  /** ユーザーが直した分類を覚える（次回から同じ品名に使う） */
  async function learnRules(receipt) {
    const changed = [];
    for (const it of receipt.items) {
      if (R.categorize(it.name, { rules: state.rules, store: receipt.store }) !== it.category) changed.push(R.makeRule(it.name, it.category));
    }
    if (!changed.length) return;
    for (const r of changed) { const i = state.rules.findIndex((x) => x.id === r.id); if (i >= 0) state.rules[i] = r; else state.rules.push(r); }
    await state.repo.putRules(changed);
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onAction(el) {
    const { action, id } = el.dataset;
    switch (action) {
      case 'ledger-scan': openScan(); break;
      case 'ledger-new': openForm({}); break;
      case 'ledger-open': { const r = state.receipts.find((x) => x.id === id); if (r) openForm({ receipt: r }); break; }
      case 'ledger-csv': {
        const month = el.dataset.month;
        download(`kakeibo-${month}.csv`, R.toCsv(R.receiptsInMonth(state.receipts, month)), 'text/csv;charset=utf-8');
        toast('CSVを書き出しました'); break;
      }
      case 'ledger-reset-rules':
        if (await confirmDialog('学習した分類ルールをリセットしますか？', `${state.rules.length}件のルールを削除します。レシートの内容は変わりません。`, 'リセット')) {
          await guard(async () => { await state.repo.clearRules(); state.rules = []; render(); toast('分類ルールをリセットしました'); });
        }
        break;
      default: break;
    }
  }

  const homeCard = () => {
    const month = thisMonth();
    const s = R.monthSummary(state.receipts, month);
    const top = s.categories[0];
    return `<a class="card ledger-card" href="#/ledger" style="--pc:#c2a04a" data-testid="ledger-card">
      <div class="card-head"><div class="card-icon" aria-hidden="true">🧾</div><div><h3>家計簿</h3><span class="muted">${esc(R.monthLabel(month))}の支出</span></div></div>
      <div class="spend-line"><b>${yen(s.total)}</b><span class="muted">レシート${s.count}件${top ? `・最多は${esc(top.category)}` : ''}</span></div></a>`;
  };

  return { view, onAction, openScan, homeCard, ledgerQuery, href, thisMonth, addDays };
}
```

## FILE: public/js/app.js

```js
import * as M from './core/model.js';
import { parseCommand } from './core/voice.js';
import { openRepository } from './storage/repository.js';
import { buildBackup, parseBackup } from './core/backup.js';
import * as R from './core/receipt.js';
import { createLedger } from './ledger.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { repo: null, tasks: [], requests: [], receipts: [], rules: [], selectedTaskId: null, undo: null, toastTimer: null, voice: { parsed: null } };
let ledger; // init() で生成（保存層の準備後）
const SpeechRecognitionImpl = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

// ---------- 小物 ----------
const today = () => M.todayStr();
const byId = (id) => state.tasks.find((t) => t.id === id) || null;

function dueInfo(t) {
  if (!t.due) return null;
  const td = today();
  const [, m, d] = t.due.split('-').map(Number);
  if (t.done) return { text: `${m}/${d}`, cls: '' };
  if (t.due < td) return { text: `期限切れ ${m}/${d}`, cls: 'over' };
  if (t.due === td) return { text: '今日まで', cls: 'today' };
  if (t.due === M.addDays(td, 1)) return { text: '明日まで', cls: '' };
  return { text: `${m}/${d}まで`, cls: '' };
}

function toast(message, undo = null) {
  const el = $('#toast');
  state.undo = undo;
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-action="undo">元に戻す</button>' : ''}`;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.hidden = true; state.undo = null; }, undo ? 7000 : 3500);
}

async function guard(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast('保存に失敗しました。もう一度お試しください'); return null; }
}

function choose({ title, message = '', buttons }) {
  return new Promise((resolve) => {
    const dlg = $('#choice-dialog');
    dlg.innerHTML = `<h2 id="choice-title">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="form-actions" style="flex-direction:column;align-items:stretch">
        ${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        <button type="button" class="btn ghost" data-i="-1">キャンセル</button></div>`;
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (b) { const i = Number(b.dataset.i); done(i < 0 ? null : buttons[i].value); } };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
  });
}
const confirmDialog = async (title, message, okLabel, danger = true) =>
  (await choose({ title, message, buttons: [{ value: true, label: okLabel, kind: danger ? 'danger' : 'primary' }] })) === true;

// ---------- 永続化つき操作 ----------
// 画面を先に更新し（即時反映）、その後で永続化する。保存に失敗した場合は guard が通知する。
async function saveTask(task) {
  const i = state.tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) state.tasks[i] = task; else state.tasks.push(task);
  render();
  await state.repo.putTask(task);
}
async function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.selectedTaskId === id) state.selectedTaskId = null;
  render();
  await state.repo.deleteTask(id);
}
async function saveRequest(req) {
  const i = state.requests.findIndex((r) => r.id === req.id);
  if (i >= 0) state.requests[i] = req; else state.requests.push(req);
  render();
  await state.repo.putRequest(req);
}
async function removeRequest(id) {
  state.requests = state.requests.filter((r) => r.id !== id);
  render();
  await state.repo.deleteRequest(id);
}

async function setTaskDone(id, done) {
  const t = byId(id);
  if (!t || t.done === done) return;
  state.selectedTaskId = id;
  await guard(() => saveTask(M.setDone(t, done)));
  toast(done ? `「${t.title}」を完了にしました` : `「${t.title}」を未完了に戻しました`,
    () => guard(() => saveTask(t)));
}

async function deleteTaskWithUndo(id) {
  const t = byId(id);
  if (!t) return;
  await guard(() => removeTask(id));
  toast(`「${t.title}」を削除しました`, () => guard(() => saveTask(t)));
}

// ---------- ルーティング ----------
function currentRoute() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  return { name: name || 'home', id: id ? decodeURIComponent(id) : null, q: new URLSearchParams(qs) };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const viewHref = (base, view, extra = {}) => {
  const q = new URLSearchParams({ view, ...extra });
  return `${base}?${q}`;
};

// ---------- 描画 ----------
function projectStyle(id) { return `--pc:${M.getProject(id)?.color || 'var(--accent)'}`; }

function taskRow(t, showProject) {
  const p = M.getProject(t.projectId);
  const due = dueInfo(t);
  return `<li class="task ${t.done ? 'done' : ''} ${state.selectedTaskId === t.id ? 'selected' : ''}" style="${projectStyle(t.projectId)}" data-task="${esc(t.id)}">
    <button class="check" type="button" data-action="toggle" data-id="${esc(t.id)}" aria-pressed="${t.done}"
      aria-label="${t.done ? '未完了に戻す' : '完了にする'}：${esc(t.title)}">✓</button>
    <button class="task-main" type="button" data-action="open-task" data-id="${esc(t.id)}">
      <span class="title">${esc(t.title)}</span>
      <span class="meta">
        ${showProject && p ? `<span class="badge proj">${p.icon} ${esc(p.name)}</span>` : ''}
        ${due ? `<span class="badge ${due.cls}">📅 ${esc(due.text)}</span>` : ''}
        ${t.priority === 'high' ? '<span class="badge high">優先度 高</span>' : t.priority === 'low' ? '<span class="badge">優先度 低</span>' : ''}
        ${t.note ? '<span class="badge">📝 メモ</span>' : ''}
      </span>
    </button></li>`;
}

function taskList(tasks, showProject, emptyMsg) {
  if (!tasks.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
  return `<ul class="tasks">${tasks.map((t) => taskRow(t, showProject)).join('')}</ul>`;
}

function chips(base, current, extra = {}) {
  return `<nav class="chips" aria-label="表示の切り替え">${M.TASK_VIEWS.map(([v, label]) =>
    `<a class="chip" href="#${viewHref(base, v, extra)}" ${v === current ? 'aria-current="true"' : ''}>${label}</a>`).join('')}</nav>`;
}

function homeView() {
  const td = today();
  const o = M.overallStats(state.tasks, td);
  const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' });
  const cards = M.PROJECTS.map((p) => {
    const s = M.projectStats(state.tasks, p.id, td);
    const nd = s.next ? dueInfo(s.next) : null;
    return `<a class="card" style="${projectStyle(p.id)}" href="#/project/${p.id}" data-testid="card-${p.id}">
      <div class="card-head"><div class="card-icon" aria-hidden="true">${p.icon}</div><div><h3>${esc(p.name)}</h3>
        <span class="muted">${s.total ? `進捗 ${s.percent}%` : 'タスクなし'}</span></div></div>
      <div class="progress" role="progressbar" aria-valuenow="${s.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)}の進捗"><i style="width:${s.percent}%"></i></div>
      <div class="card-meta"><span>未完了 <b>${s.open}</b></span><span>完了 <b>${s.done}</b></span>${s.overdue ? `<span style="color:var(--danger)">期限切れ <b>${s.overdue}</b></span>` : ''}</div>
      <div class="card-next"><small>次にやること</small>${s.next ? `${esc(s.next.title)}${nd ? ` <span class="badge ${nd.cls}">${esc(nd.text)}</span>` : ''}` : '<span class="muted">未完了のタスクはありません</span>'}</div>
    </a>`;
  }).join('');
  return `<div class="page-head"><div><h1>AI コントロールパネル</h1><span class="muted">${esc(dateLabel)}</span></div>
      <button class="btn primary" type="button" data-action="new-task">＋ タスク追加</button></div>
    <div class="summary">
      <a class="stat" href="#${viewHref('/tasks', 'today')}"><b>${o.today}</b><span>今日</span></a>
      <a class="stat ${o.overdue ? 'alert' : ''}" href="#${viewHref('/tasks', 'overdue')}"><b>${o.overdue}</b><span>期限切れ</span></a>
      <a class="stat" href="#${viewHref('/tasks', 'high')}"><b>${o.high}</b><span>優先度高</span></a>
      <a class="stat" href="#${viewHref('/tasks', 'open')}"><b>${o.open}</b><span>未完了</span></a>
    </div>
    <div class="cards">${cards}${ledger.homeCard()}</div>
    ${state.tasks.length ? '' : '<p class="empty" style="margin-top:16px">まだタスクがありません。「＋ タスク追加」か、設定でサンプルを追加できます。</p>'}`;
}

function projectView(id, q) {
  const p = M.getProject(id);
  if (!p) return `<a class="back" href="#/">← ホーム</a><div class="empty">プロジェクトが見つかりません</div>`;
  const view = q.get('view') || 'open';
  const s = M.projectStats(state.tasks, id, today());
  const tasks = M.filterTasks(state.tasks, { projectId: id, view }, today());
  const reqs = state.requests.filter((r) => r.projectId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const reqHtml = reqs.length ? reqs.map(requestCard).join('') : '<div class="empty">開発依頼はまだありません</div>';
  return `<a class="back" href="#/">← ホーム</a>
    <div class="page-head" style="${projectStyle(id)}"><div class="card-head"><div class="card-icon" aria-hidden="true">${p.icon}</div><div><h1 style="margin:0">${esc(p.name)}</h1>
      <span class="muted">未完了 ${s.open} ・ 完了 ${s.done} ・ 進捗 ${s.percent}%</span></div></div>
      <button class="btn primary" type="button" data-action="new-task" data-project="${id}">＋ タスク追加</button></div>
    <div class="progress" style="${projectStyle(id)}"><i style="width:${s.percent}%"></i></div>
    <div class="card-next" style="border:0"><small class="muted">次にやること</small> ${s.next ? `<b>${esc(s.next.title)}</b>` : '<span class="muted">なし</span>'}</div>
    ${chips(`/project/${id}`, view)}
    ${taskList(tasks, false, 'この条件のタスクはありません')}
    <h2>開発依頼</h2>
    <p class="notice">開発依頼は<b>記録のみ</b>です。コードの実行は行いません（将来のClaude Code連携用に、承認状態と一緒に保存します）。</p>
    <div class="btn-row" style="margin:10px 0"><button class="btn" type="button" data-action="new-request" data-project="${id}">＋ 開発依頼を記録</button></div>
    <div class="tasks">${reqHtml}</div>`;
}

function requestCard(r) {
  const created = new Date(r.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cls = r.approval === 'approved' ? 'ok' : r.approval === 'rejected' ? 'over' : 'today';
  return `<div class="req" data-req="${esc(r.id)}">
    <div class="meta"><span class="badge ${cls}">${M.APPROVAL_LABEL[r.approval]}</span><span class="badge">${M.REQUEST_STATUS_LABEL[r.status]}</span><span class="muted">${esc(created)}</span></div>
    <p>${esc(r.body)}</p>
    <div class="req-actions">
      ${r.approval !== 'approved' ? `<button class="btn small" type="button" data-action="req-approve" data-id="${esc(r.id)}">承認する</button>` : ''}
      ${r.approval !== 'rejected' ? `<button class="btn small" type="button" data-action="req-reject" data-id="${esc(r.id)}">却下</button>` : ''}
      <button class="btn small ghost" type="button" data-action="req-delete" data-id="${esc(r.id)}">削除</button>
    </div></div>`;
}

function tasksView(q) {
  const view = q.get('view') || 'open';
  const pid = M.getProject(q.get('project')) ? q.get('project') : '';
  const tasks = M.filterTasks(state.tasks, { projectId: pid || null, view }, today());
  const options = [`<option value="">すべてのプロジェクト</option>`, ...M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`)].join('');
  return `<div class="page-head"><h1>すべてのタスク</h1><button class="btn primary" type="button" data-action="new-task" data-project="${pid}">＋ タスク追加</button></div>
    <div class="filter-row"><label class="sr-only" for="proj-filter">プロジェクトで絞り込み</label>
      <select id="proj-filter" data-action="filter-project" data-view="${esc(view)}">${options}</select>
      <span class="muted">${tasks.length}件</span></div>
    ${chips('/tasks', view, pid ? { project: pid } : {})}
    ${taskList(tasks, true, 'この条件のタスクはありません')}`;
}

function settingsView() {
  const SR = SpeechRecognitionImpl();
  const secure = window.isSecureContext;
  const sampleCount = state.tasks.filter((t) => t.sample).length;
  const voiceMsg = !SR ? '❌ このブラウザは音声認識に対応していません。テキスト入力で同じ指示を実行できます。'
    : !secure ? '⚠️ 音声認識APIはありますが、HTTPS（または localhost）でないため使えない可能性があります。'
    : '✅ 音声認識を利用できます（初回はマイクの許可が必要です）。';
  return `<h1>設定</h1>
    <section class="panel"><h3>音声認識</h3><p class="status-line">${esc(voiceMsg)}</p>
      <p class="muted">音声認識はブラウザ／OSの機能です。Safariでは音声がApple側のサービスで処理される場合があります。このアプリは音声を保存せず、認識結果の文字だけを使います。</p></section>
    <section class="panel"><h3>データの保存</h3>
      <p>${state.repo.persistent ? '✅ このブラウザ内（IndexedDB）に保存しています。' : '⚠️ この環境ではブラウザ内保存が使えず、再読み込みでデータが消えます。バックアップを書き出してください。'}</p>
      <p class="muted">Safariは、長期間開かないサイトのデータを自動削除することがあります。「ホーム画面に追加」して使い、定期的にJSONを書き出してください。タスク ${state.tasks.length}件・開発依頼 ${state.requests.length}件・レシート ${state.receipts.length}件。</p></section>
    <section class="panel"><h3>バックアップ（JSON）</h3>
      <div class="btn-row"><button class="btn" type="button" data-action="export">書き出す</button>
        <button class="btn" type="button" data-action="copy-json">JSONをコピー</button>
        <button class="btn" type="button" data-action="import">読み込む…</button></div>
      <input id="import-file" type="file" accept="application/json,.json" hidden></section>
    <section class="panel"><h3>家計簿の分類ルール</h3>
      <p class="muted">レシートで分類を直すと、同じ品名は次回から自動でその分類になります（学習済み ${state.rules.length}件）。レシート画像は保存しません。</p>
      <div class="btn-row"><button class="btn" type="button" data-action="ledger-reset-rules" ${state.rules.length ? '' : 'disabled'}>学習内容をリセット</button></div></section>
    <section class="panel"><h3>サンプルデータ</h3>
      <div class="btn-row"><button class="btn" type="button" data-action="add-samples">サンプルタスクを追加</button>
        <button class="btn" type="button" data-action="remove-samples" ${sampleCount ? '' : 'disabled'}>サンプルを削除（${sampleCount}件）</button></div></section>
    <section class="panel"><h3>データの全消去</h3><p class="muted">タスクと開発依頼をすべて削除します。元に戻せません。先にバックアップを書き出してください。</p>
      <div class="btn-row"><button class="btn danger" type="button" data-action="clear-all">すべて削除…</button></div></section>
    <section class="panel"><h3>このアプリについて</h3>
      <p class="muted">APIキーや認証情報は保存・表示しません。外部サービスへの通信は行いません。コード実行機能はありません（開発依頼は記録のみ）。</p></section>`;
}

function render() {
  const r = currentRoute();
  const app = $('#app');
  let html;
  if (r.name === 'project') html = projectView(r.id, r.q);
  else if (r.name === 'tasks') html = tasksView(r.q);
  else if (r.name === 'ledger') html = ledger.view(r.q);
  else if (r.name === 'settings') html = settingsView();
  else html = homeView();
  app.innerHTML = html;
  const nav = r.name === 'project' ? 'home' : r.name;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ---------- タスク／依頼フォーム ----------
function fieldErr(errors, k) { return `<div class="err" data-err="${k}">${errors?.[k] ? esc(errors[k]) : ''}</div>`; }

function openTaskForm({ task = null, projectId = null, title = '' } = {}) {
  const dlg = $('#task-dialog');
  const v = task || { title, projectId: projectId || currentRoute().id || M.PROJECTS[0].id, priority: 'mid', due: '', note: '' };
  if (!M.getProject(v.projectId)) v.projectId = M.PROJECTS[0].id;
  if (task) state.selectedTaskId = task.id;
  dlg.innerHTML = `<div class="sheet-head"><h2 id="task-dialog-title">${task ? 'タスクを編集' : 'タスクを追加'}</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
    <form class="form" id="task-form" novalidate>
      <div class="field"><label for="tf-title">タイトル</label><input id="tf-title" type="text" maxlength="200" autocomplete="off" value="${esc(v.title)}">${fieldErr({}, 'title')}</div>
      <div class="field"><label for="tf-project">プロジェクト</label><select id="tf-project">${M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === v.projectId ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><span class="label">優先度</span><div class="seg" role="radiogroup" aria-label="優先度">
        ${['high', 'mid', 'low'].map((p) => `<label><input type="radio" name="tf-priority" value="${p}" ${v.priority === p ? 'checked' : ''}><span>${M.PRIORITY_LABEL[p]}</span></label>`).join('')}</div></div>
      <div class="field"><label for="tf-due">期限</label><input id="tf-due" type="date" value="${esc(v.due || '')}">
        <div class="quick"><button type="button" class="btn small" data-due="0">今日</button><button type="button" class="btn small" data-due="1">明日</button><button type="button" class="btn small" data-due="7">1週間後</button><button type="button" class="btn small ghost" data-due="">なし</button></div>${fieldErr({}, 'due')}</div>
      <div class="field"><label for="tf-note">メモ</label><textarea id="tf-note" maxlength="2000">${esc(v.note || '')}</textarea></div>
      <div class="form-actions">
        ${task ? `<button type="button" class="btn danger" data-act="delete">削除</button><button type="button" class="btn" data-act="toggle">${task.done ? '未完了に戻す' : '完了にする'}</button>` : ''}
        <button type="submit" class="btn primary">保存</button></div>
    </form>`;
  const form = $('#task-form', dlg);
  dlg.onclick = async (e) => {
    if (e.target.closest('[data-close]')) return dlg.close();
    const due = e.target.closest('[data-due]');
    if (due) { const n = due.dataset.due; $('#tf-due', dlg).value = n === '' ? '' : M.addDays(today(), Number(n)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'delete') {
      if (await confirmDialog('タスクを削除しますか？', `「${task.title}」を削除します。`, '削除する')) { dlg.close(); await deleteTaskWithUndo(task.id); }
    } else if (act === 'toggle') { dlg.close(); await setTaskDone(task.id, !task.done); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = {
      title: $('#tf-title', dlg).value, projectId: $('#tf-project', dlg).value,
      priority: form.querySelector('input[name=tf-priority]:checked')?.value, due: $('#tf-due', dlg).value || null, note: $('#tf-note', dlg).value,
    };
    const res = task ? M.updateTask(task, input) : M.createTask(input);
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = res.errors?.[el.dataset.err] || ''; });
    if (!res.ok) { const first = Object.keys(res.errors)[0]; $(`[data-err="${first}"]`, dlg)?.scrollIntoView({ block: 'nearest' }); return; }
    await guard(async () => {
      await saveTask(res.task);
      state.selectedTaskId = res.task.id;
      dlg.close();
      toast(task ? '保存しました' : `「${res.task.title}」を追加しました`);
      render();
    });
  };
  dlg.oncancel = () => {};
  dlg.showModal();
  if (!task) $('#tf-title', dlg).focus();
}

function openRequestForm({ projectId = null, body = '' } = {}) {
  const dlg = $('#request-dialog');
  const pid = M.getProject(projectId) ? projectId : (currentRoute().id || M.PROJECTS[0].id);
  dlg.innerHTML = `<div class="sheet-head"><h2 id="request-dialog-title">開発依頼を記録</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
    <p class="notice">記録のみで、コードは実行されません。承認状態は「承認待ち」で保存されます。</p>
    <form class="form" id="request-form" novalidate>
      <div class="field"><label for="rf-project">プロジェクト</label><select id="rf-project">${M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="rf-body">依頼内容</label><textarea id="rf-body" maxlength="2000">${esc(body)}</textarea>${fieldErr({}, 'body')}</div>
      <div class="form-actions"><button type="submit" class="btn primary">記録する</button></div></form>`;
  dlg.onclick = (e) => { if (e.target.closest('[data-close]')) dlg.close(); };
  $('#request-form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const res = M.createRequest({ projectId: $('#rf-project', dlg).value, body: $('#rf-body', dlg).value });
    $('[data-err="body"]', dlg).textContent = res.errors?.body || '';
    if (!res.ok) return;
    await guard(async () => { await saveRequest(res.request); dlg.close(); toast('開発依頼を記録しました（承認待ち）'); });
  };
  dlg.showModal();
}

// ---------- 音声・テキスト指示 ----------
function ctxNow() {
  const r = currentRoute();
  return { currentProjectId: r.name === 'project' ? r.id : null, selectedTaskId: byId(state.selectedTaskId) ? state.selectedTaskId : null };
}

function setVoiceResult(html) { $('#voice-result').innerHTML = html; }

function openVoice() {
  const dlg = $('#voice-dialog');
  const SR = SpeechRecognitionImpl();
  $('#voice-support').textContent = SR
    ? (window.isSecureContext ? '「話す」を押して指示するか、下の欄に入力してください。' : 'HTTPSでないため音声認識が使えない場合があります。その場合は下の欄に入力してください。')
    : 'このブラウザは音声認識に対応していません。下の欄に入力して同じ操作ができます。';
  $('#voice-mic').hidden = !SR;
  $('#voice-input').value = '';
  setVoiceResult('');
  state.voice.parsed = null;
  dlg.showModal();
  if (!SR) $('#voice-input').focus();
}

function interpret(text) {
  const parsed = parseCommand(text, ctxNow());
  state.voice.parsed = parsed;
  if (parsed.intent === 'empty') return setVoiceResult('<div class="interp">指示を入力してください。</div>');
  if (parsed.intent === 'unknown') {
    return setVoiceResult(`<div class="interp warn"><b>解釈できませんでした</b><span class="muted">「${esc(text)}」</span>
      <span class="muted">例：「今日やることを表示」「大学の勉強に、レポートを書くを追加」</span></div>`);
  }
  if (!parsed.mutating) { runCommand(parsed); return; }
  const sel = byId(ctxNow().selectedTaskId);
  const needsTarget = ['complete_task', 'uncomplete_task', 'delete_task'].includes(parsed.intent);
  if (needsTarget && !sel) {
    return setVoiceResult(`<div class="interp warn"><b>${esc(parsed.summary)}</b><span>対象のタスクが選ばれていません。先にタスクをタップしてから、もう一度指示してください。</span></div>`);
  }
  const label = parsed.intent === 'delete_task' ? '削除する' : '実行する';
  setVoiceResult(`<div class="interp ${parsed.danger ? 'warn' : ''}">
    <span class="muted">認識：「${esc(text)}」</span><b>${esc(parsed.summary)}</b>
    ${needsTarget ? `<span>対象：「${esc(sel.title)}」</span>` : ''}
    ${parsed.intent === 'add_task' && (!parsed.title || !parsed.projectId) ? '<span class="muted">足りない項目は、次の画面で入力します。</span>' : ''}
    <div class="form-actions"><button class="btn ghost" type="button" data-vact="cancel">やめる</button>
      <button class="btn ${parsed.danger ? 'danger' : 'primary'}" type="button" data-vact="run">${label}</button></div></div>`);
}

async function runCommand(p) {
  const dlg = $('#voice-dialog');
  const td = today();
  const close = () => { if (dlg.open) dlg.close(); };
  const sel = byId(ctxNow().selectedTaskId);
  switch (p.intent) {
    case 'show_tasks': {
      const n = M.filterTasks(state.tasks, { projectId: p.projectId, view: p.view }, td).length;
      close(); go(viewHref('#/tasks', p.view, p.projectId ? { project: p.projectId } : {}));
      toast(`${p.summary}（${n}件）`); break;
    }
    case 'show_project': close(); go(`#/project/${p.projectId}`); toast(p.summary); break;
    case 'show_status': {
      const o = M.overallStats(state.tasks, td);
      close(); go(p.projectId ? `#/project/${p.projectId}` : '#/');
      toast(p.projectId ? p.summary : `未完了${o.open}件 / 今日${o.today}件 / 期限切れ${o.overdue}件`); break;
    }
    case 'add_task': {
      if (!p.title || !p.projectId) { close(); openTaskForm({ projectId: p.projectId, title: p.title || '' }); break; }
      const res = M.createTask({ projectId: p.projectId, title: p.title });
      if (!res.ok) { close(); openTaskForm({ projectId: p.projectId, title: p.title }); break; }
      await guard(() => saveTask(res.task));
      state.selectedTaskId = res.task.id;
      close(); go(`#/project/${p.projectId}`); toast(`「${res.task.title}」を追加しました`, () => guard(() => removeTask(res.task.id)));
      break;
    }
    case 'add_request': {
      if (!p.body || !p.projectId) { close(); openRequestForm({ projectId: p.projectId, body: p.body || '' }); break; }
      const res = M.createRequest({ projectId: p.projectId, body: p.body });
      if (!res.ok) { close(); openRequestForm({ projectId: p.projectId, body: p.body }); break; }
      await guard(() => saveRequest(res.request));
      close(); go(`#/project/${p.projectId}`); toast('開発依頼を記録しました（承認待ち・実行はされません）'); break;
    }
    case 'complete_task': close(); if (sel) await setTaskDone(sel.id, true); break;
    case 'uncomplete_task': close(); if (sel) await setTaskDone(sel.id, false); break;
    case 'delete_task': close(); if (sel) await deleteTaskWithUndo(sel.id); break;
    case 'show_ledger': {
      const month = p.month === 'last' ? R.shiftMonth(ledger.thisMonth(), -1) : ledger.thisMonth();
      const s = R.monthSummary(state.receipts, month);
      const amt = p.category ? (s.categories.find((c) => c.category === p.category)?.amount ?? 0) : s.total;
      close(); go(ledger.href(month, p.category));
      toast(`${R.monthLabel(month)}の${p.category ? `${p.category}` : '支出'}は ¥${amt.toLocaleString('ja-JP')}（レシート${s.count}件）`); break;
    }
    case 'scan_receipt': close(); go('#/ledger'); ledger.openScan(); break;
    default: break;
  }
}

let recognition = null;
function startListening() {
  const SR = SpeechRecognitionImpl();
  const btn = $('#voice-mic');
  if (!SR) return;
  if (recognition) { try { recognition.stop(); } catch { /* noop */ } return; }
  const r = new SR();
  recognition = r;
  r.lang = 'ja-JP'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  btn.textContent = '🎙 聞いています…（タップで停止）';
  r.onresult = (e) => {
    const text = e.results?.[0]?.[0]?.transcript || '';
    $('#voice-input').value = text;
    interpret(text);
  };
  r.onerror = (e) => {
    const msg = { 'not-allowed': 'マイクの許可がありません。設定でSafariのマイクを許可するか、テキストで入力してください。', 'service-not-allowed': '音声認識が許可されていません。テキストで入力してください。',
      'no-speech': '音声が聞き取れませんでした。もう一度お試しください。', 'network': '音声認識サービスに接続できませんでした。テキストで入力してください。' }[e.error] || `音声認識エラー（${e.error}）。テキストで入力してください。`;
    setVoiceResult(`<div class="interp warn">${esc(msg)}</div>`);
  };
  r.onend = () => { recognition = null; btn.textContent = '🎤 話す'; };
  try { r.start(); } catch { recognition = null; btn.textContent = '🎤 話す'; }
}

// ---------- 設定画面の操作 ----------
function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const backupText = () => JSON.stringify(buildBackup({ tasks: state.tasks, requests: state.requests, receipts: state.receipts, rules: state.rules }), null, 2);

async function importFile(file) {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return toast(`読み込めません：${parsed.error}`);
  const warn = parsed.warnings.length ? `（${parsed.warnings.length}件の不正データをスキップ）` : '';
  const mode = await choose({
    title: 'バックアップを読み込む', message: `タスク${parsed.tasks.length}件・開発依頼${parsed.requests.length}件・レシート${parsed.receipts.length}件${warn}`,
    buttons: [{ value: 'merge', label: '今のデータに追加（同じIDは上書き）', kind: 'primary' }, { value: 'replace', label: '今のデータを置き換える', kind: 'danger' }],
  });
  if (!mode) return;
  await guard(async () => {
    if (mode === 'replace') await state.repo.replaceAll({ tasks: parsed.tasks, requests: parsed.requests, receipts: parsed.receipts, rules: parsed.rules });
    else await state.repo.putMany({ tasks: parsed.tasks, requests: parsed.requests, receipts: parsed.receipts, rules: parsed.rules });
    Object.assign(state, await state.repo.loadAll());
    render(); toast('読み込みました');
  });
}

async function onAction(el) {
  const { action, id } = el.dataset;
  switch (action) {
    case 'toggle': { const t = byId(id); if (t) await setTaskDone(id, !t.done); break; }
    case 'open-task': { const t = byId(id); if (t) { state.selectedTaskId = id; render(); openTaskForm({ task: t }); } break; }
    case 'new-task': openTaskForm({ projectId: el.dataset.project || null }); break;
    case 'new-request': openRequestForm({ projectId: el.dataset.project }); break;
    case 'req-approve': case 'req-reject': {
      const r = state.requests.find((x) => x.id === id);
      if (!r) break;
      const approve = action === 'req-approve';
      if (approve && !(await confirmDialog('この依頼を承認しますか？', '承認しても、このアプリはコードを実行しません。状態が「承認済み」になるだけです。', '承認する', false))) break;
      await guard(() => saveRequest(M.setApproval(r, approve ? 'approved' : 'rejected')));
      break;
    }
    case 'req-delete':
      if (await confirmDialog('開発依頼を削除しますか？', '', '削除する')) await guard(() => removeRequest(id));
      break;
    case 'filter-project': {
      const q = new URLSearchParams({ view: el.dataset.view });
      if (el.value) q.set('project', el.value);
      go(`#/tasks?${q}`); break;
    }
    case 'export': download(`ai-control-panel-${today()}.json`, backupText()); toast('書き出しました'); break;
    case 'copy-json':
      try { await navigator.clipboard.writeText(backupText()); toast('JSONをコピーしました'); } catch { toast('コピーできませんでした。「書き出す」を使ってください'); }
      break;
    case 'import': $('#import-file').click(); break;
    case 'add-samples': {
      const existing = new Set(state.tasks.map((t) => t.id));
      const samples = M.sampleTasks(today()).filter((t) => !existing.has(t.id));
      if (!samples.length) { toast('サンプルは追加済みです'); break; }
      await guard(async () => { state.tasks.push(...samples); render(); toast(`サンプル${samples.length}件を追加しました`); await state.repo.putTasks(samples); });
      break;
    }
    case 'remove-samples': {
      const ids = state.tasks.filter((t) => t.sample).map((t) => t.id);
      if (!(await confirmDialog('サンプルを削除しますか？', `サンプルタスク${ids.length}件を削除します（編集したものは残ります）。`, '削除する'))) break;
      await guard(async () => { state.tasks = state.tasks.filter((t) => !t.sample); render(); toast('サンプルを削除しました'); for (const i of ids) await state.repo.deleteTask(i); });
      break;
    }
    case 'clear-all':
      if (!(await confirmDialog('すべてのデータを削除しますか？', `タスク${state.tasks.length}件・開発依頼${state.requests.length}件・レシート${state.receipts.length}件が消えます。元に戻せません。`, 'すべて削除'))) break;
      await guard(async () => { await state.repo.clearAll(); state.tasks = []; state.requests = []; state.receipts = []; state.rules = []; state.selectedTaskId = null; render(); toast('すべて削除しました'); });
      break;
    case 'undo': { const fn = state.undo; $('#toast').hidden = true; state.undo = null; if (fn) await fn(); break; }
    default: if (action?.startsWith('ledger-')) await ledger.onAction(el); break;
  }
}

// ---------- 起動 ----------
async function init() {
  state.repo = await openRepository();
  ledger = createLedger({ state, $, esc, toast, guard, choose, confirmDialog, render, go });
  Object.assign(state, await state.repo.loadAll());
  navigator.storage?.persist?.().catch(() => {});

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && el.tagName !== 'SELECT') onAction(el);
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('select[data-action]')) onAction(e.target);
    if (e.target.id === 'import-file' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; }
  });
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target === d) d.close(); // 背景タップで閉じる
  }));
  $('#toast').addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (b) onAction(b); });

  $('#mic-fab').addEventListener('click', openVoice);
  const vd = $('#voice-dialog');
  vd.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) vd.close();
    const v = e.target.closest('[data-vact]')?.dataset.vact;
    if (v === 'cancel') setVoiceResult('');
    if (v === 'run' && state.voice.parsed) runCommand(state.voice.parsed);
  });
  vd.addEventListener('close', () => { try { recognition?.abort(); } catch { /* noop */ } recognition = null; $('#voice-mic').textContent = '🎤 話す'; });
  $('#voice-mic').addEventListener('click', startListening);
  $('#voice-form').addEventListener('submit', (e) => { e.preventDefault(); interpret($('#voice-input').value); });

  window.addEventListener('hashchange', render);
  render();
  document.body.dataset.ready = 'true';

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch((e) => {
  console.error(e);
  $('#app').innerHTML = '<div class="empty">起動に失敗しました。ページを再読み込みしてください。</div>';
});
```

## FILE: server.mjs

```js
// 依存なしの静的サーバー。既定は 127.0.0.1 のみ待受（外部へ公開しない）。
// 同じWi-FiのiPadから試す場合のみ HOST=0.0.0.0 を明示する。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export function startServer({ root, port = 8080, host = '127.0.0.1' }) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad request'); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      }).end(buf);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const useDist = process.argv.includes('--dist');
  const root = path.join(here, useDist ? 'dist' : 'public');
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  startServer({ root, port, host }).then(() => {
    console.log(`AI Control Panel: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/  (root: ${path.basename(root)})`);
    if (host === '0.0.0.0') console.log('注意: 同じネットワーク内の端末から見える状態です。信頼できるネットワークでのみ使ってください。');
  });
}
```

## FILE: build.mjs

```js
// public/ を検証して dist/ に出力する。外部ツール不要。
// - 全JSの構文チェック / manifest と index.html の参照チェック
// - Service Worker にファイル一覧とバージョン（内容ハッシュ）を埋め込む
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'public');
// 出力先: 既定は dist/。GitHub Pages用は `node build.mjs --out docs`（Pagesは / か /docs しか公開元に選べない）
const outName = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist';
if (!['dist', 'docs'].includes(outName)) { console.error(`BUILD FAILED: --out は dist か docs のみ（指定: ${outName}）`); process.exit(1); }
const out = path.join(here, outName);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

const fail = (msg) => { console.error(`BUILD FAILED: ${msg}`); process.exit(1); };

const files = walk(src).sort();
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(src, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`syntax error in ${f}\n${r.stderr}`);
}

try { JSON.parse(fs.readFileSync(path.join(src, 'manifest.webmanifest'), 'utf8')); } catch (e) { fail(`manifest.webmanifest: ${e.message}`); }
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).concat(manifest.icons.map((i) => i.src));
for (const r of refs) if (!files.includes(r)) fail(`missing file referenced: ${r}`);

const hash = crypto.createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(src, f)));
const version = hash.digest('hex').slice(0, 10);

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}
// 約14MBのOCR部品はプリキャッシュしない（初回の読み取り時に取得され、以降はService Workerがキャッシュする）
const assets = ['./', ...files.filter((f) => f !== 'sw.js' && !f.startsWith('vendor/'))].map((f) => JSON.stringify(f)).join(', ');
const swPath = path.join(out, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("const VERSION = 'dev';") || !sw.includes('/*ASSETS*/')) fail('sw.js placeholders not found');
sw = sw.replace("const VERSION = 'dev';", `const VERSION = '${version}';`).replace('/*ASSETS*/', assets);
fs.writeFileSync(swPath, sw);

fs.writeFileSync(path.join(out, '.nojekyll'), ''); // GitHub PagesのJekyll処理を無効化
console.log(`Build OK: ${files.length} files -> ${outName}/ (version ${version})`);
```

## FILE: tests/unit/model.test.js

```js
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
```

## FILE: tests/unit/voice.test.js

```js
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
```

## FILE: tests/unit/voice-phrases.test.js

```js
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
```

## FILE: tests/unit/repository.test.js

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend, createRepository, openBackend } from '../../public/js/storage/repository.js';
import * as M from '../../public/js/core/model.js';
import * as R from '../../public/js/core/receipt.js';

const task = (id, title = id) => M.createTask({ projectId: 'university', title }, new Date(), id).task;

test('保存・取得・削除', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a'));
  await repo.putTasks([task('b'), task('c')]);
  await repo.putRequest(M.createRequest({ projectId: 'sim-game', body: 'x' }, new Date(), 'r1').request);
  let all = await repo.loadAll();
  assert.equal(all.tasks.length, 3);
  assert.equal(all.requests.length, 1);
  await repo.deleteTask('b');
  await repo.deleteRequest('r1');
  all = await repo.loadAll();
  assert.deepEqual(all.tasks.map((t) => t.id).sort(), ['a', 'c']);
  assert.equal(all.requests.length, 0);
});

test('同じIDのputは上書き（追加ではない）', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a', '旧'));
  await repo.putTask(task('a', '新'));
  const { tasks } = await repo.loadAll();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '新');
});

test('replaceAll / putMany / clearAll', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('old'));
  await repo.replaceAll({ tasks: [task('n1'), task('n2')], requests: [] });
  assert.deepEqual((await repo.loadAll()).tasks.map((t) => t.id).sort(), ['n1', 'n2']);
  await repo.putMany({ tasks: [task('n3')], requests: [] });
  assert.equal((await repo.loadAll()).tasks.length, 3);
  await repo.clearAll();
  assert.deepEqual(await repo.loadAll(), { tasks: [], requests: [], receipts: [], rules: [] });
});

test('取得したデータを書き換えても保存内容は変わらない', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a', '元'));
  (await repo.loadAll()).tasks[0].title = '改ざん';
  assert.equal((await repo.loadAll()).tasks[0].title, '元');
});

test('IndexedDBが無い環境ではメモリ保存に切り替わる', async () => {
  const b = await openBackend('x');
  assert.equal(b.kind, 'memory');
  assert.equal(b.persistent, false);
});

test('レシートと分類ルールの保存・削除・全消去', async () => {
  const repo = createRepository(createMemoryBackend());
  const r = R.createReceipt({ date: '2026-10-24', items: [{ name: '牛乳', amount: 198, category: '食費' }] }, new Date(), 'rcp-1').receipt;
  await repo.putReceipt(r);
  await repo.putRules([R.makeRule('牛乳', '食費'), R.makeRule('卵', '食費')]);
  let all = await repo.loadAll();
  assert.equal(all.receipts.length, 1);
  assert.equal(all.rules.length, 2);
  await repo.deleteReceipt('rcp-1');
  await repo.clearRules();
  all = await repo.loadAll();
  assert.deepEqual([all.receipts.length, all.rules.length], [0, 0]);
  await repo.putReceipt(r);
  await repo.clearAll();
  assert.equal((await repo.loadAll()).receipts.length, 0);
});
```

## FILE: tests/unit/receipt.test.js

```js
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
```

## FILE: tests/unit/backup.test.js

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../public/js/core/model.js';
import * as R from '../../public/js/core/receipt.js';
import { buildBackup, parseBackup } from '../../public/js/core/backup.js';

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
```

## FILE: tests/e2e/run.mjs

```js
// Playwright(Chromium)でのE2E。dist/ を配信して、iPad幅とスマホ幅で主要操作を確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server.mjs';

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

await browser.close();
server.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\nE2E: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — 失敗時のスクリーンショット: ${tmp}` : ''}`);
if (!failed.length) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
```

