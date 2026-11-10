# LUCIDA — Personal Discovery Intelligence

「AIに質問するために開く」のではなく、「何か面白い発見があるかもしれないから開く」ための個人向け発見アプリ。
発見 → 理解 → 実践 → 新しい発見、という循環を1つのアプリで回します。

このディレクトリは、リポジトリ直下の既存アプリ（AIコントロールパネル）から**完全に独立**しています。依存関係・ビルド設定はすべてここに閉じています。

## 起動

```bash
cd lucida
npm install
npm run dev          # http://localhost:5173/
npm run build        # 型チェック（アプリ + サーバー関数）+ 本番ビルド → dist/
npm run preview      # ビルド結果を http://127.0.0.1:4173/ で確認
npm test             # 単体テスト (Vitest)
npm run test:e2e     # 実ブラウザ検証 (要: npm run build、Playwright/Chromium)
```

追加設定なしで動きます（この端末内に保存 + ルールベース生成）。環境変数は `.env.example` を参照。
本番ビルドは PWA で、ホーム画面に追加でき、一度開けばオフラインでも起動します。

## 画面

| 画面 | できること |
|---|---|
| Home | 今日の発見（開いたときだけ生成）、好奇心向けの発見、日々の気づき、試してみること、最近の動き。初回は興味のテーマを選ぶ |
| Explore | キーワード・6カテゴリで探索、関連テーマ、異分野の組み合わせ、新しい発見の生成 |
| Network | 知識グラフ（テーマ・発見・疑問・気づき・実験）。関連づけの候補を承認/却下、ノード追加、ノードから探索 |
| Lab | 仮説と期間を決めて実験 → 実施記録 → 結果 → 分析（事実/推測/提案）→ 結果を Network へ |
| Archive | 発見・保存・疑問・記録・実験・出典の履歴。検索・カテゴリ・タグ・日付で絞り込み |
| Profile | 興味プロフィール、提案数と費用の設定、分野のバランス、外部の記録の取り込み、バックアップ |

## 構成

| パス | 役割 |
|---|---|
| `src/domain/` | 型、日付・ハッシュ等のユーティリティ、反応履歴から現在状態を導く `state.ts` |
| `src/data/repository.ts` | 保存層のインターフェース。UI は `Repository` だけを使う |
| `src/data/idb.ts` / `memory.ts` | IndexedDB（既定）/ メモリ実装 |
| `src/data/supabase.ts` | Supabase 実装とサインイン（`VITE_LUCIDA_BACKEND=supabase` で有効。**実環境では未検証**） |
| `src/ai/provider.ts` | `DiscoveryProvider`（差し替え可能な生成元） |
| `src/ai/ruleBased.ts` + `catalog.ts` | ルールベース生成（同梱カタログ28件、費用ゼロ、外部通信なし） |
| `src/ai/remote.ts` | サーバー側 AI を呼ぶプロバイダー（応答検証・出典必須） |
| `src/ai/scoring.ts` | Interest / Novelty / Utility / Timing / Diversity、Adaptive な重み、分野の偏り補正 |
| `src/ai/frequency.ts` | 提案数の自動調整（直近7日の反応で ±1 件） |
| `src/ai/similarity.ts` | 言い換えによる重複の検出（しきい値は実測に基づく） |
| `src/ai/engine.ts` | 生成フロー（重複除去・日次上限・キャッシュ・失敗時フォールバック） |
| `src/ai/analysis.ts` | 実験の分析（集計は常に端末内。AI は推測と提案だけ） |
| `src/knowledge/` | 知識グラフの組み立て・関連づけ候補・配置（`graph.ts`）と編集操作（`actions.ts`） |
| `src/lab/actions.ts` | 実験の作成・記録・完了・分析・Network への追加 |
| `src/integrations/` | 外部の記録の取り込み（カレンダー .ics / 学習記録 CSV）。許可制・端末内処理 |
| `src/pages/` | 各画面 |
| `supabase/migrations/` | テーブルと RLS（全テーブル `auth.uid() = user_id`） |
| `supabase/functions/` | AI 中継サーバー（Edge Function）。キーはサーバー側のみ |

## 設計上の約束

- **事実・推測・提案を分ける**: 発見は `fact`（出典つき）/ `reasoning`（推測）/ `suggestion`（提案）の別フィールド。実験の分析も「集計 / 推測 / 提案」に分け、画面でラベルを付ける。
- **APIキーはクライアントに置かない**: `VITE_` 付きの値はブラウザに公開される。AI キーはサーバー側（Edge Function）にだけ置き、アプリには URL だけを渡す。
- **費用を抑える**: 要約プロフィールだけを送る / 1日の生成上限 / 応答キャッシュ / 重複の除去 / モデルと思考の深さの使い分け / ルールベースのみに切替可能。
- **通知・監視をしない**: 発見はアプリを開いたときにだけ作る。提案数は反応が少なければ自動で減る。
- **外部連携は明示的な許可が前提**: Web 検索も、ファイルの取り込みも、設定で「許可する」にしたものだけが動く。取り込みファイルは端末内で読み、外部へ送らない。

## AI を有効にする（任意）

AI がなくても全機能が動きます（ルールベース）。有効にする場合は Supabase のプロジェクトが必要です。

```bash
# 1) テーブルを作る（0001 → 0002 → 0003 の順に適用）
supabase db push

# 2) AI キーをサーバー側にだけ置き、関数をデプロイする
supabase secrets set ANTHROPIC_API_KEY=...
supabase functions deploy generate-discovery
supabase functions deploy analyze-experiment

# 3) lucida/.env.local に URL と公開鍵を書く（AI キーは書かない）
VITE_LUCIDA_BACKEND=supabase
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_LUCIDA_AI_ENDPOINT=https://<project>.supabase.co/functions/v1/generate-discovery
VITE_LUCIDA_ANALYZE_ENDPOINT=https://<project>.supabase.co/functions/v1/analyze-experiment
```

- **利用者の確認**: 関数はサインイン済みの利用者だけが呼べます（Supabase Auth にトークンを問い合わせて確認）。自分のアカウントを作ったら、Supabase の Authentication 設定で新規登録を止めておくと安全です。
- **モデル**（サーバー側の環境変数で変更可）:

  | 変数 | 既定 | 使われる場面 |
  |---|---|---|
  | `LUCIDA_MODEL_LIGHT` | `claude-haiku-5-5` | Home の自動生成、実験の分析（思考の深さ low） |
  | `LUCIDA_MODEL_HEAVY` | `claude-opus-5-5` | Web 検索あり・テーマ指定・Unknown の探索（思考の深さ medium） |
  | `LUCIDA_MODEL_ANALYZE` | `LUCIDA_MODEL_LIGHT` と同じ | 実験の分析だけ別のモデルにしたい場合 |

  費用をさらに抑えたい場合は `LUCIDA_MODEL_HEAVY=claude-sonnet-5-5` にできます（価格はおよそ半分）。
- **拒否時のフォールバック**: Opus / Sonnet / Fable 系では、モデルが応答を断った場合に Anthropic 推奨の別モデルでサーバー側が再実行する指定（`fallbacks: "default"`）を付けています。
- **Web 検索**: Profile で「許可する」にし、かつ手動の探索・関連発見のときだけ使われます（Home の自動生成では使いません）。
- その他の環境変数: `LUCIDA_ALLOWED_ORIGIN`（CORS の許可元。既定 `*`）、`LUCIDA_ALLOW_ANON=true`（利用者の確認を省く。誰でも呼べるようになるので非推奨）。

## 検証の状況

| 対象 | 状況 |
|---|---|
| アプリ本体（全画面・保存・生成・グラフ・実験・取り込み・PWA） | 単体テストと実ブラウザ E2E（390px / 1280px）で検証済み |
| サーバー関数のロジック（入力検証・プロンプト・モデル選択・応答検証・拒否/一時停止/打ち切りの扱い・利用者確認） | 単体テスト済み。Anthropic SDK の型に対する型チェック済み |
| サーバー関数の実デプロイ、Anthropic API との実通信、Web 検索の実動作 | **未検証**（開発環境から Supabase / Anthropic API に接続できないため） |
| Supabase への保存、サインイン、マイグレーションの適用 | **未検証**（同上。SQL は実行していない） |
| 同梱カタログの出典 URL | 編集時点の記録。到達確認は**未実施**（UI にも「未確認」と表示し、利用者が「確認した」を記録できる） |

## 既知の制約

- 同梱カタログは28件で有限。出し切ると「新しく出せる発見が尽きました」と表示する（AI を有効にすると広がる）。
- 「関連づけの候補」「関連テーマ」「異分野の組み合わせ」はルールベース（共通するタグ・言葉から機械的に挙げる）。
- カレンダーの取り込みは .ics ファイル経由。繰り返し予定は初回のみ。タイムゾーン付きの時刻は端末のローカル時刻として扱う。
- サーバー側の利用回数制限は未実装（クライアント側の1日の上限と、サインイン必須で守っている）。
- フォントは Google Fonts。読み込めないときは端末の明朝体・ゴシック体になる。
