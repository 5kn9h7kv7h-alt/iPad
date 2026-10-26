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
