# AFTERLIFE CITY

海沿いの架空都市「LUMIÈRE BAY」で、30人の住人が自律的に暮らす観察型シミュレーション（開発仕様 v1.0 の MVP 実装）。
プレイヤーは管理者ではなく観察者。見ていない間も街の時間は進みます。

## 起動

```bash
cd afterlife-city
npm install
npm run dev            # http://localhost:5173  （AIなしで動作）
npm test               # シミュレーション / AI検証 / カメラ演出のテスト
npm run build          # 型チェック + 本番ビルド（dist/）
```

AI（会話の書き換え・イベント提案・人生ドキュメンタリー）を使う場合は、サーバー側にAPIキーを置きます。キーはブラウザに渡りません。

```bash
ANTHROPIC_API_KEY=... npm run server     # または GEMINI_API_KEY=...（AI_MODEL で変更可）
npm run dev                              # /api は :8787 にプロキシされる
# 本番: npm run build && ANTHROPIC_API_KEY=... npm run server  → http://127.0.0.1:8787
```

**AIを使わなくても街は成立します。** AIは演出・提案のみで、数値や関係性は常にエンジンが決めます。

## 構造（仕様 6.2）

```
City Renderer (src/render, R3F)      ← world を読むだけ。描画が重くても状態は壊れない
Simulation Engine (src/sim)          ← 純TypeScript。時間・移動・行動選択・関係・記憶・天候
World State                          ← 素のJSONオブジェクト（IDで相互参照）。IndexedDBへ保存
AI Event Engine (src/ai/service.ts)  ← 状況スナップショット → サーバー(/api/ai) → JSON提案
Validation Layer (src/ai/validate.ts)← 仕様5.2の6項目を検証し、通ったものだけスケジュール
Event / Memory (src/sim/log.ts)      ← 重要度30以上のみ長期記憶。多すぎれば自動要約
UI (src/ui, Zustand)
```

| 領域 | 主なファイル |
|---|---|
| 型定義 | `src/sim/types.ts` |
| 街・住人30人・関係の初期値 | `src/sim/world.ts` |
| 天候・季節・日照 | `src/sim/environment.ts` |
| 行動選択（欲求→性格→習慣→場所→関係→環境→記憶） | `src/sim/behavior.ts` |
| 交流・関係の変化（閾値で友人/不仲へ遷移） | `src/sim/social.ts` |
| 突発イベント・開業/閉店・転入/転出・祭り | `src/sim/happenings.ts` |
| OFFSCREEN LIFE（最大7日分を一括再計算） | `src/sim/engine.ts` `catchUp` |
| 映画的カメラ（Aerial/Street/Follow/Event/Ambient） | `src/render/director.ts` |
| 介入（ベンチ・植物・街灯・公園設備・店舗候補・祭り） | `src/sim/interventions.ts` |

## ビジュアル（Stylized Realism / Golden Hour）

| 層 | 実装 |
|---|---|
| 時刻・光 | `src/render/environment/atmosphere.ts`（純粋関数・テスト済み）。朝=淡い黄、昼=自然光、夕=黄金色と長い影、夜=深い青の空と月明かり。後処理は光のにじみ（ブルーム）と色調補正 |
| 空・海 | シェーダーで太陽・雲・星・海を計算。夕日は海面に光の道、夜は岸の街灯と窓の明かりが波に揺れる暖色の帯として映る |
| 地形 | 町を囲む丘・岬・岩場・防波堤。丘には住人の出入りしない背景の家並みと鐘楼のある教会 |
| 建物 | `src/render/buildings/*` 26棟（2〜4階建て）を種類別に生成。漆喰・瓦・石・木・石畳のCC0テクスチャ、鎧戸・バルコニー・花箱・軒。夜は街灯の光が低い壁面を暖かく照らす |
| 道路・小物 | `streets.ts` 縁石・横断歩道・鋳鉄の街灯・ベンチ・自転車・植木鉢・バス停・港の設備・灯台の先のガゼボ。ベンチ/テラスは座席アンカー付き |
| 車・船（飾り） | `world/Vehicles.tsx` 路肩の駐車車両、駅前を毎時0分（6〜22時）に出て町を一周するバス（前に人がいれば止まる）、湾を横切る帆船。シミュレーションには影響しない |
| 植生・天候・季節 | `world/*` 風で揺れる柔らかな樹冠（インスタンス）、雨・雪・花びら・落ち葉はGPU計算、季節で色が変わる |
| 住人 | `citizens/*` カメラに近い住人（スマホ8人・PC14人）は骨格アニメ付きの3Dモデル（歩く・座る・立ち止まる）、他は軽量な一括描画。シミュレーション状態は読むだけ |
| カメラ | `CameraRig.tsx` / `director.ts` 建物回避、ショット別の画角、夕方は太陽に照らされた側から撮影。屋根越しに海を望む構図と湾から町を振り返る構図（ゆっくり移動） |
| 歩行 | `sim/paths.ts` 人の速さ（1×で秒速約1.7）。玄関→歩道→交差点の横断歩道→歩道→玄関の経路で、建物を迂回する。描画はシミュレーションの各ステップ間を補間（`render/interp.ts`） |
| 生活の痕跡 | 雨の日の傘、漁船の朝の出港と昼過ぎの帰港、起きている人がいる家だけ窓が灯る、建物の接地陰影 |
| UI | 紙とインクの配色・角丸なし・不透明な面と細い線。眺めている間は操作パネルが8秒で消え、何もない所をタップで出し入れ |

画質は3段階（設定画面）。スマホは「標準」が既定。外部素材はすべてCC0（`public/assets/LICENSES.md`、変換スクリプトは `tools/assets/`）。
`npm run test:e2e:a` / `npm run test:e2e:b` で描画命令数・三角形数の上限（iPhone標準: 150 / 30万、軽量: 100 / 15万）と回帰を確認します。
`tests/audit.test.ts` は建物・小物・木・植え込み・道路の重なりと、全ての歩行経路が建物を通らないことを、`tests/walk.test.ts` は2日間の歩行が車道・建物内に入らないことを、`tests/vehicles.test.ts` は車とバスが車道上にあり建物・小物・歩行経路と交わらないことを検査します。
`npm run build && node tests/e2e/lookdev.mjs --tier mid --ref <参考画像>` で参考画と同じ8構図を撮影し、並べた比較画像を作ります。

## 実装範囲（仕様 9. MVP）

5エリア・建物26棟・住人30人／自律移動と生活サイクル／性格・欲求・気分／関係（面識・友情・信頼・好意・緊張）／記憶と要約／
AI会話・AIイベント生成・検証／昼夜・天候・季節／自動カメラと住人追跡／EVENTS・HISTORY・PEOPLE（6タブのプロフィール）／
LIFE DOCUMENTARY・CITY MEMORY／介入／保存・復元・留守中ダイジェスト。

## 既知の制約

- AI経路（`server/index.mjs` → 実API）は、APIキーが無い環境のため**実APIでは未検証**。検証層・パース・フォールバックはテスト済み。
- 実機iPhoneでの速度は未計測で、検証に使えるのはソフトウェア描画での描画命令数・三角形数のみです。
- 参考画のような手描きの密度（花・人混み・看板の細部）には届いていません。人物モデルは元素材の頭身が低く、頭を小さくして補正しています。
- 学校・子どもは未実装（住人は成人のみ）。経済・交通AI・自由建築は仕様どおり対象外。
- drei は `OrbitControls` / `Html` のみ使用。
