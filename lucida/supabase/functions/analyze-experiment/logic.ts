// analyze-experiment の純粋ロジック（Deno にも Vitest にも依存しない）。
// 事実（集計）はクライアントが計算して送ってくる。AIは「推測」と「提案」だけを書く。

export interface AnalyzeReq {
  experiment: { title: string; hypothesis: string; plan: string; startsOn: string; endsOn: string; outcome?: string; result?: string };
  facts: string[];
  logs: { day: string; did: boolean; rating?: number; text: string }[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const OUTCOMES = ['supported', 'not_supported', 'unclear'];
const OUTCOME_JA: Record<string, string> = { supported: '仮説は支持された', not_supported: '仮説は支持されなかった', unclear: 'どちらとも言えない' };

/** 入力を検証・正規化する。サイズを制限して悪用と費用増を防ぐ。 */
export function parseAnalyzeRequest(raw: unknown): AnalyzeReq {
  if (!raw || typeof raw !== 'object') throw new Error('invalid body');
  const r = raw as Record<string, unknown>;
  const e = (r.experiment ?? {}) as Record<string, unknown>;
  const title = str(e.title, 120);
  if (!title) throw new Error('experiment.title is required');
  const outcome = OUTCOMES.find((o) => o === e.outcome);
  return {
    experiment: { title, hypothesis: str(e.hypothesis, 600), plan: str(e.plan, 600), startsOn: str(e.startsOn, 10), endsOn: str(e.endsOn, 10), outcome, result: str(e.result, 1200) || undefined },
    facts: Array.isArray(r.facts) ? (r.facts as unknown[]).map((f) => str(f, 300)).filter(Boolean).slice(0, 12) : [],
    logs: Array.isArray(r.logs)
      ? (r.logs as Record<string, unknown>[]).slice(-60).map((l) => ({
        day: str(l.day, 10), did: l.did === true,
        rating: typeof l.rating === 'number' && l.rating >= 1 && l.rating <= 5 ? Math.round(l.rating) : undefined,
        text: str(l.text, 200),
      })).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.day))
      : [],
  };
}

export function buildAnalyzePrompt(req: AnalyzeReq): { system: string; user: string } {
  const system = [
    'あなたは、個人が自分で行った小さな実験の振り返りを手伝う編集者です。日本語で書きます。',
    '厳守事項:',
    '- 「集計済みの事実」は正しいものとして扱い、数え直したり、矛盾することを書いたりしない。',
    '- inferences は推測であり、「〜かもしれません」「〜の可能性があります」のように、推測と分かる書き方にする。断定しない。',
    '- これは1人の短期間の記録であり、因果関係は言えない。一般化しない。',
    '- nextSteps は、次に試せる具体的で小さな行動にする。',
    '- 医療・診断・治療に関わる助言はしない。体調に関する内容は、一般的な範囲にとどめる。',
    '- 記録が少ないときは、少ないことを踏まえて控えめに書く。',
    '- inferences は1〜4件、nextSteps は1〜3件。それぞれ1〜2文。',
    '- 出力は JSON のみ: {"inferences": string[], "nextSteps": string[]}',
  ].join('\n');
  const e = req.experiment;
  const logs = req.logs.map((l) => `${l.day} ${l.did ? '実施' : '未実施'}${l.rating ? ` 手応え${l.rating}/5` : ''}${l.text ? ` メモ:${l.text}` : ''}`);
  const user = [
    `実験: ${e.title}`,
    `仮説: ${e.hypothesis || '（未記入）'}`,
    `行動計画: ${e.plan || '（未記入）'}`,
    `期間: ${e.startsOn} 〜 ${e.endsOn}`,
    e.outcome ? `本人の自己評価: ${OUTCOME_JA[e.outcome]}` : '本人の自己評価: まだない',
    e.result ? `本人が書いた結果: ${e.result}` : '',
    '',
    '集計済みの事実:',
    ...(req.facts.length ? req.facts.map((f) => `- ${f}`) : ['- （なし）']),
    '',
    `実施記録（${logs.length}件）:`,
    ...(logs.length ? logs : ['（記録なし）']),
  ];
  return { system, user: user.filter((l) => l !== '').join('\n') };
}

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['inferences', 'nextSteps'],
  properties: { inferences: { type: 'array', items: { type: 'string' } }, nextSteps: { type: 'array', items: { type: 'string' } } },
} as const;

export function parseAnalysisOutput(text: string): { inferences: string[]; nextSteps: string[] } {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('モデルの出力にJSONが見つかりません');
  const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, 400)).filter(Boolean).slice(0, max) : []);
  const out = { inferences: list(json.inferences, 4), nextSteps: list(json.nextSteps, 3) };
  if (out.inferences.length + out.nextSteps.length === 0) throw new Error('分析が空です');
  return out;
}
