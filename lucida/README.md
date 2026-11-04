# LUCIDA — Personal Discovery Intelligence

「AIに質問するために開く」のではなく、「何か面白い発見があるかもしれないから開く」ための個人向け発見アプリ。
このディレクトリは、リポジトリ直下の既存アプリ（AIコントロールパネル）から**完全に独立**しています。依存関係・ビルド設定はすべてここに閉じています。

## 起動

```bash
cd lucida
npm install
npm run dev          # http://localhost:5173/
npm run build        # 型チェック + 本番ビルド → dist/
npm run preview      # ビルド結果を http://127.0.0.1:4173/ で確認
npm test             # 単体テスト (Vitest)
npm run test:e2e     # 実ブラウザ検証 (要: npm run build、Playwright/Chromium)
```

追加設定なしで動きます（ローカル保存 + ルールベース生成）。環境変数は `.env.example` を参照。

## 構成

| パス | 役割 |
|---|---|
| `src/domain/` | 型・日付/ハッシュ等のユーティリティ・反応履歴から現在状態を導く `state.ts` |
| `src/data/repository.ts` | 保存層のインターフェース。UIは `Repository` だけを使う |
| `src/data/idb.ts` / `memory.ts` | IndexedDB（既定）/ メモリ実装 |
| `src/data/supabase.ts` | Supabase実装（**準備のみ・未検証**。`VITE_LUCIDA_BACKEND=supabase` で有効化） |
| `supabase/migrations/0001_init.sql` | 仕様の11テーブル + 補助テーブル + RLS（全テーブル `auth.uid() = user_id`） |
| `src/ai/provider.ts` | `DiscoveryProvider`（差し替え可能な生成元） |
| `src/ai/ruleBased.ts` + `catalog.ts` | ルールベース生成（同梱カタログ28件、費用ゼロ、外部通信なし） |
| `src/ai/remote.ts` | サーバー側AIエンドポイントを呼ぶプロバイダー（応答検証・出典必須） |
| `src/ai/crossField.ts` | 異分野の組み合わせ（カテゴリが違い共通タグを持つ発見の組。「推測」と明示） |
| `supabase/functions/generate-discovery/` | AI中継サーバー（Edge Function）。キーはサーバー側のみ。`logic.ts` はテスト済み、`index.ts` は未デプロイ・未検証 |
| `src/ai/scoring.ts` | Interest / Novelty / Utility / Timing / Diversity と Adaptive 重み |
| `src/ai/engine.ts` | 生成フロー（重複除去・日次上限・キャッシュ・失敗時フォールバック） |
| `src/pages/` | Home / Explore / Network / Lab / Archive / Profile / Capture / DiscoveryDetail |

## 設計上の約束

- **事実・推測・提案を分離**: 発見は `fact`（出典つき）/ `reasoning`（推測）/ `suggestion`（提案）の別フィールドで、画面でもラベルで区別する。
- **APIキーはクライアントに置かない**: `VITE_` 付きの値はブラウザに公開される。AIキーはサーバー側（Edge Function等）に置き、アプリには中継URLだけを渡す。
- **コスト対策**: 要約プロフィールだけを送る / 日次上限 / 応答キャッシュ / 重複ハッシュ / ルールベースのみに切替可能。
- **通知・監視なし**: 発見はアプリを開いたときにだけ生成する。

## AIを有効にする（任意）

```bash
supabase secrets set ANTHROPIC_API_KEY=...          # キーはサーバー側にだけ置く
supabase functions deploy generate-discovery
# lucida/.env.local に、関数のURLだけを書く（キーは書かない）
VITE_LUCIDA_AI_ENDPOINT=https://<project>.functions.supabase.co/generate-discovery
```
- モデルは複雑さで使い分け（通常=軽量、テーマ指定/Unknown/検索あり=上位）。`LUCIDA_MODEL_LIGHT` / `LUCIDA_MODEL_HEAVY` で変更可。
- Web検索は、Profileで「許可する」にし、かつ手動の探索・関連発見のときだけ使われる（Homeの自動生成では使わない）。
- 現状の中継は `verify_jwt`（サインイン必須）前提だが、アプリ側のサインイン画面は未実装。サーバー側の利用回数制限も未実装（クライアントの日次上限のみ）。

## 既知の制約（Phase 2 時点）

- 同梱カタログの出典URLは編集時点の記録で、開発環境の制限により到達確認していない（UIにも明記）。
- Edge Function（`index.ts`）は、この環境でDeno/Anthropic APIに接続できず未デプロイ・未検証（純粋ロジックのみテスト済み）。Web検索ツール名・モデルIDは実環境で要確認。
- Supabase接続（認証画面を含む）は未接続・未検証。
- Network（グラフ）とLabの実験機能は Phase 3。現状は実データの素材一覧/「試す予定」一覧のみ。
- PWA（オフライン対応）は未実装。フォントはGoogle Fontsを読み込み、失敗時は端末のセリフ体/ゴシック体にフォールバック。
