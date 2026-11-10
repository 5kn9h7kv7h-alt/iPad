// generate-discovery の純粋ロジック（Deno にも Vitest にも依存しない）。
// リクエスト検証 / モデル選択 / プロンプト生成 / 応答の検証。

export const CATEGORIES = ['Science', 'Technology', 'Society', 'Daily Life', 'Ideas', 'Unknown'] as const;

export interface GenReq {
  profileSummary: string;
  interests: { name: string; weight: number }[];
  avoidKeys: string[];
  category?: (typeof CATEGORIES)[number];
  keyword?: string;
  keywords?: string[];
  allowWebSearch?: boolean;
  count: number;
}

export interface Cand {
  sourceKey: string; category: (typeof CATEGORIES)[number]; tags: string[]; title: string; fact: string;
  reasoning: string; suggestion: string; utility?: number; sources: { title: string; url: string }[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 入力を検証・正規化する。サイズを制限して悪用と費用増を防ぐ。 */
export function parseRequest(raw: unknown): GenReq {
  if (!raw || typeof raw !== 'object') throw new Error('invalid body');
  const r = raw as Record<string, unknown>;
  const count = Math.max(1, Math.min(5, Math.floor(Number(r.count) || 1)));
  const category = CATEGORIES.find((c) => c === r.category);
  return {
    profileSummary: str(r.profileSummary, 600),
    interests: Array.isArray(r.interests)
      ? (r.interests as Record<string, unknown>[]).slice(0, 12).map((i) => ({ name: str(i.name, 40), weight: Math.max(1, Math.min(5, Number(i.weight) || 1)) })).filter((i) => i.name)
      : [],
    avoidKeys: Array.isArray(r.avoidKeys) ? (r.avoidKeys as unknown[]).slice(0, 200).map((k) => str(k, 80)).filter(Boolean) : [],
    category,
    keyword: str(r.keyword, 60) || undefined,
    keywords: Array.isArray(r.keywords) ? (r.keywords as unknown[]).slice(0, 8).map((k) => str(k, 40)).filter(Boolean) : undefined,
    allowWebSearch: r.allowWebSearch === true,
    count,
  };
}

export type Tier = 'light' | 'heavy';

/**
 * 処理の複雑さに応じてモデルと思考の深さ(effort)を使い分ける（費用対策）。
 * - 通常の自動生成 → 軽量モデル・effort low
 * - Web検索あり／テーマ指定あり／Unknown（興味から離れた題材探し）→ 上位モデル・effort medium
 */
export function pickModel(req: GenReq, models: { light: string; heavy: string }): { model: string; tier: Tier; effort: 'low' | 'medium' } {
  const complex = req.allowWebSearch || !!req.keyword || !!req.keywords?.length || req.category === 'Unknown';
  return complex ? { model: models.heavy, tier: 'heavy', effort: 'medium' } : { model: models.light, tier: 'light', effort: 'low' };
}

/** 構造化出力のスキーマ（Web検索を使わないときに指定し、JSONとして必ず解釈できる応答にする）。 */
export const CANDIDATES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceKey', 'category', 'tags', 'title', 'fact', 'reasoning', 'suggestion', 'utility', 'sources'],
        properties: {
          sourceKey: { type: 'string' },
          category: { type: 'string', enum: [...CATEGORIES] },
          tags: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          fact: { type: 'string' },
          reasoning: { type: 'string' },
          suggestion: { type: 'string' },
          utility: { type: 'number' },
          sources: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } },
          },
        },
      },
    },
  },
} as const;

export function buildPrompt(req: GenReq): { system: string; user: string } {
  const system = [
    'あなたは個人向け発見アプリ LUCIDA の編集者です。ユーザーが「面白い」と感じる、新しい発見を日本語で作ります。',
    '厳守事項:',
    '- fact は、出典で確認できる事実だけを書く。確認できないことを事実として断定しない。数値や年は出典にあるものだけ。',
    '- reasoning は推測・考察であり、「〜かもしれない（推測）」のように推測と分かる書き方にする。',
    '- suggestion は、今日〜今週に試せる具体的で小さな行動の提案にする。',
    '- 各発見には必ず sources（title と https の url）を1件以上つける。実在を確認できないURLは作らない。出典を付けられない発見は出力しない。',
    '- avoidKeys に含まれる題材は避ける。',
    '- 出力は JSON のみ。説明文やコードフェンスは不要。',
    `- 形式: {"candidates":[{"sourceKey":string,"category":${CATEGORIES.map((c) => `"${c}"`).join('|')},"tags":string[],"title":string,"fact":string,"reasoning":string,"suggestion":string,"utility":number(0-1),"sources":[{"title":string,"url":string}]}]}`,
  ].join('\n');
  const lines = [
    `発見を${req.count}件作ってください。`,
    `ユーザーの興味の要約: ${req.profileSummary || '（なし）'}`,
    req.interests.length ? `興味: ${req.interests.map((i) => `${i.name}(重み${i.weight})`).join('、')}` : '',
    req.category ? `カテゴリは ${req.category} にしてください。${req.category === 'Unknown' ? 'ユーザーの既存の興味から離れたテーマを選んでください。' : ''}` : '分野はばらけさせてください。',
    req.keyword ? `キーワード: ${req.keyword}` : '',
    req.keywords?.length ? `次のいずれかに関連するテーマ: ${req.keywords.join('、')}` : '',
    req.allowWebSearch ? 'Web検索を使って最新・正確な情報を確認し、検索で見つけたページを出典にしてください。' : 'Web検索は使えません。確かな知識がある範囲だけで、信頼できる出典（論文DOI、公的機関、百科事典など）を付けてください。',
    req.avoidKeys.length ? `避ける題材のキー: ${req.avoidKeys.slice(0, 60).join(', ')}` : '',
  ];
  return { system, user: lines.filter(Boolean).join('\n') };
}

/** モデルの出力テキストから候補を取り出し、出典のないものを除外する。 */
export function parseModelOutput(text: string): Cand[] {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('モデルの出力にJSONが見つかりません');
  const json = JSON.parse(text.slice(start, end + 1)) as { candidates?: unknown };
  if (!Array.isArray(json.candidates)) throw new Error('candidates がありません');
  const out: Cand[] = [];
  for (const r of json.candidates as Record<string, unknown>[]) {
    const category = CATEGORIES.find((c) => c === r.category);
    const sources = Array.isArray(r.sources)
      ? (r.sources as Record<string, unknown>[]).map((s) => ({ title: str(s.title, 200), url: str(s.url, 500) })).filter((s) => s.title && /^https:\/\//.test(s.url))
      : [];
    const title = str(r.title, 120), fact = str(r.fact, 600);
    if (!category || !title || !fact || sources.length === 0) continue;
    out.push({
      sourceKey: str(r.sourceKey, 80) || `ai-${title}`, category,
      tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map((t) => str(t, 30)).filter(Boolean).slice(0, 8) : [],
      title, fact, reasoning: str(r.reasoning, 600), suggestion: str(r.suggestion, 400),
      utility: typeof r.utility === 'number' ? Math.max(0, Math.min(1, r.utility)) : undefined, sources,
    });
  }
  return out;
}
