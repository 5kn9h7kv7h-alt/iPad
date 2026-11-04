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

## 実装範囲（仕様 9. MVP）

5エリア・建物26棟・住人30人／自律移動と生活サイクル／性格・欲求・気分／関係（面識・友情・信頼・好意・緊張）／記憶と要約／
AI会話・AIイベント生成・検証／昼夜・天候・季節／自動カメラと住人追跡／EVENTS・HISTORY・PEOPLE（6タブのプロフィール）／
LIFE DOCUMENTARY・CITY MEMORY／介入／保存・復元・留守中ダイジェスト。

## 既知の制約

- AI経路（`server/index.mjs` → 実API）は、APIキーが無い環境のため**実APIでは未検証**。検証層・パース・フォールバックはテスト済み。
- 3D素材は未使用で、ローポリのプリミティブで街を構成（「リアルな3D」は未達）。実機スマホでの性能は未計測。
- 学校・子どもは未実装（住人は成人のみ）。経済・交通AI・自由建築は仕様どおり対象外。
- drei は `OrbitControls` / `Html` のみ使用。
