import { OUTCOME_JA, type Analysis, type Experiment, type ExperimentLog } from '../domain/types';
import { nowIso } from '../domain/util';

export const ANALYSIS_CAVEAT = 'この分析は、あなた1人の記録を集計したものです。因果関係を示すものではなく、推測と提案は参考としてお読みください。';

export interface ExperimentStats {
  periodDays: number;
  elapsedDays: number;
  logCount: number;
  didDays: number;
  skippedDays: number;
  /** 経過日数に対する実施日の割合 0..1（経過0日なら null） */
  adherence: number | null;
  ratedCount: number;
  avgRating: number | null;
  firstHalfAvg: number | null;
  secondHalfAvg: number | null;
  longestStreak: number;
}

const DAY = 86400000;
const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 記録の集計（事実）。AIを使う場合もここはローカルで計算し、AIに数えさせない。 */
export function computeStats(exp: Experiment, logs: ExperimentLog[], today: string): ExperimentStats {
  const start = toDate(exp.startsOn), end = toDate(exp.endsOn);
  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
  const until = Math.min(end.getTime(), toDate(today).getTime());
  const elapsedDays = Math.max(0, Math.min(periodDays, Math.round((until - start.getTime()) / DAY) + 1));
  // 同じ日の記録が複数あれば、最後の記録をその日の結果とする
  const byDay = new Map<string, ExperimentLog>();
  for (const l of [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) byDay.set(l.day, l);
  const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const didDays = days.filter((l) => l.did).length;
  const rated = days.filter((l) => typeof l.rating === 'number');
  const half = Math.floor(rated.length / 2);
  let longestStreak = 0, streak = 0, prev: number | null = null;
  for (const l of days) {
    const t = toDate(l.day).getTime();
    if (l.did) { streak = prev !== null && Math.round((t - prev) / DAY) === 1 ? streak + 1 : 1; longestStreak = Math.max(longestStreak, streak); prev = t; }
    else { streak = 0; prev = null; }
  }
  return {
    periodDays, elapsedDays, logCount: logs.length, didDays, skippedDays: days.length - didDays,
    adherence: elapsedDays > 0 ? Math.min(1, didDays / elapsedDays) : null,
    ratedCount: rated.length, avgRating: avg(rated.map((l) => l.rating!)),
    firstHalfAvg: rated.length >= 4 ? avg(rated.slice(0, half).map((l) => l.rating!)) : null,
    secondHalfAvg: rated.length >= 4 ? avg(rated.slice(rated.length - half).map((l) => l.rating!)) : null,
    longestStreak,
  };
}

export function statsToFacts(exp: Experiment, s: ExperimentStats): string[] {
  const facts = [`期間は ${exp.startsOn} 〜 ${exp.endsOn} の${s.periodDays}日間（うち経過${s.elapsedDays}日）。`];
  facts.push(s.logCount === 0 ? '実施記録はまだありません。' : `記録は${s.logCount}件。実施した日が${s.didDays}日、できなかった日が${s.skippedDays}日。`);
  if (s.adherence !== null && s.logCount > 0) facts.push(`実施率は${Math.round(s.adherence * 100)}%（経過日数に対する実施日の割合）。`);
  if (s.longestStreak >= 2) facts.push(`連続して実施できた最長は${s.longestStreak}日。`);
  if (s.avgRating !== null) facts.push(`手応えの平均は5点中${r1(s.avgRating)}（${s.ratedCount}日分）。`);
  if (s.firstHalfAvg !== null && s.secondHalfAvg !== null) facts.push(`手応えは前半が平均${r1(s.firstHalfAvg)}、後半が平均${r1(s.secondHalfAvg)}。`);
  if (exp.outcome) facts.push(`あなたの自己評価:「${OUTCOME_JA[exp.outcome]}」。`);
  return facts;
}

/** ルールベースの分析。外部通信なし・費用ゼロ。 */
export function analyzeExperiment(exp: Experiment, logs: ExperimentLog[], today: string): Analysis {
  const s = computeStats(exp, logs, today);
  const inferences: string[] = [];
  const nextSteps: string[] = [];
  const trend = s.firstHalfAvg !== null && s.secondHalfAvg !== null ? s.secondHalfAvg - s.firstHalfAvg : null;

  if (s.logCount === 0) {
    inferences.push('記録がないため、結果の判断は印象に基づいている可能性があります。');
    nextSteps.push('次に試すときは、1日1行でも「やった／できなかった」を残すと、振り返りの材料になります。');
  } else {
    if (s.adherence !== null && s.adherence < 0.4) {
      inferences.push('実施率が低めです。仮説の当否よりも「続けにくさ」が結果に影響しているかもしれません。');
      nextSteps.push('期間を短くするか、頻度や量を減らして、続けやすい形でもう一度試してみる。');
    } else if (s.adherence !== null && s.adherence >= 0.8) {
      inferences.push('実施率が高く、この行動は今の生活に組み込みやすいと考えられます。');
    }
    if (trend !== null && trend >= 0.5) inferences.push('後半ほど手応えが上がっています。慣れや効果の積み重ねがあるのかもしれません。');
    if (trend !== null && trend <= -0.5) inferences.push('後半ほど手応えが下がっています。新鮮さが薄れたか、負担が増えた可能性があります。');
    if (s.ratedCount > 0 && s.ratedCount < 3) inferences.push('手応えの記録が少ないため、平均値はあまり当てになりません。');
  }

  if (exp.outcome === 'supported') {
    // 手応えの記録が少ないうちは「記録と一致」とは言えない
    if (s.ratedCount >= 3 && s.avgRating !== null && s.avgRating >= 3.5 && (s.adherence ?? 0) >= 0.6) inferences.push('記録と自己評価が一致しており、この仮説はあなたに合っている可能性があります。');
    nextSteps.push('条件を1つだけ変えて（時間帯・量・場所など）もう一度試し、違いを比べる。');
    nextSteps.push('続けたい場合は、習慣としてそのまま継続する。');
  } else if (exp.outcome === 'not_supported') {
    inferences.push('仮説そのものではなく、試した条件（時間帯・量・期間）が合わなかった可能性も残ります。');
    nextSteps.push('条件を1つだけ変えて再実験するか、別の仮説に切り替える。');
  } else if (exp.outcome === 'unclear') {
    inferences.push('判断材料が足りないか、効果が小さい可能性があります。');
    nextSteps.push('何が変われば「支持された」と言えるかを先に決めてから、期間を延ばして再実験する。');
  } else {
    nextSteps.push('期間が終わったら、結果と自己評価を入力すると、分析が具体的になります。');
  }

  return { facts: statsToFacts(exp, s), inferences, nextSteps, caveat: ANALYSIS_CAVEAT, provider: 'rule-based', createdAt: nowIso() };
}

// ---- 外部AIによる分析（任意） ----

export interface AnalyzeRequest {
  experiment: Pick<Experiment, 'title' | 'hypothesis' | 'plan' | 'startsOn' | 'endsOn' | 'outcome' | 'result'>;
  /** ローカルで集計済みの事実。AIはこれを前提に推測と提案だけを書く */
  facts: string[];
  logs: Pick<ExperimentLog, 'day' | 'did' | 'rating' | 'text'>[];
}

/**
 * サーバー側のAIで「推測」と「提案」を書いてもらう。事実(facts)は常にローカル集計を使う。
 * 失敗したら呼び出し側がルールベースに切り替える。
 */
export async function analyzeRemote(
  endpoint: string, exp: Experiment, logs: ExperimentLog[], today: string,
  fetchImpl: typeof fetch = fetch, headers: Record<string, string> = {},
): Promise<Analysis> {
  const facts = statsToFacts(exp, computeStats(exp, logs, today));
  const body: AnalyzeRequest = {
    experiment: { title: exp.title, hypothesis: exp.hypothesis, plan: exp.plan, startsOn: exp.startsOn, endsOn: exp.endsOn, outcome: exp.outcome, result: exp.result },
    facts,
    logs: logs.slice(-60).map((l) => ({ day: l.day, did: l.did, rating: l.rating, text: l.text.slice(0, 200) })),
  };
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`分析エンドポイントがエラーを返しました (${res.status})`);
  const json = (await res.json()) as { inferences?: unknown; nextSteps?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 400)).slice(0, 6) : []);
  const inferences = list(json.inferences), nextSteps = list(json.nextSteps);
  if (inferences.length + nextSteps.length === 0) throw new Error('AIから有効な分析が得られませんでした');
  return { facts, inferences, nextSteps, caveat: ANALYSIS_CAVEAT, provider: 'remote-ai', createdAt: nowIso() };
}
