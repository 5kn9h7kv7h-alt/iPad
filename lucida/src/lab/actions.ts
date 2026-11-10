import { analyzeExperiment, analyzeRemote } from '../ai/analysis';
import { extractTags } from '../ai/profile';
import type { Repository } from '../data/repository';
import { deriveState } from '../domain/state';
import { OUTCOME_JA, type Analysis, type Experiment, type ExperimentLog, type Outcome } from '../domain/types';
import { dateKey, newId, nowIso } from '../domain/util';
import { addEdge, removeNodeData } from '../knowledge/actions';
import { nodeId, pairKey } from '../knowledge/graph';

export interface ExperimentInput { title: string; hypothesis: string; plan: string; startsOn: string; endsOn: string; discoveryId?: string }

const DAY = 86400000;
export function isValidDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const dayMs = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

export function validateExperiment(input: ExperimentInput): ExperimentInput {
  const title = input.title.trim();
  if (!title) throw new Error('実験の名前を入力してください');
  if (!isValidDay(input.startsOn) || !isValidDay(input.endsOn)) throw new Error('開始日と終了日を正しく入力してください');
  if (dayMs(input.endsOn) < dayMs(input.startsOn)) throw new Error('終了日は開始日以降にしてください');
  if ((dayMs(input.endsOn) - dayMs(input.startsOn)) / DAY > 365) throw new Error('期間は1年以内にしてください');
  return { ...input, title: title.slice(0, 80), hypothesis: input.hypothesis.trim().slice(0, 500), plan: input.plan.trim().slice(0, 500) };
}

export async function createExperiment(repo: Repository, raw: ExperimentInput, now = new Date()): Promise<Experiment> {
  const input = validateExperiment(raw);
  const exp: Experiment = {
    id: newId(), title: input.title, hypothesis: input.hypothesis, plan: input.plan, startsOn: input.startsOn, endsOn: input.endsOn,
    status: dayMs(input.startsOn) <= dayMs(dateKey(now)) ? 'running' : 'planned', discoveryId: input.discoveryId, createdAt: now.toISOString(),
  };
  await repo.experiments.put(exp);
  if (input.discoveryId && (await repo.discoveries.get(input.discoveryId))) {
    // きっかけになった発見との関係は事実なので、候補ではなくエッジとして記録する
    await addEdge(repo, { source: nodeId('discovery', input.discoveryId), target: nodeId('experiment', exp.id), relation: 'きっかけ', origin: 'system' });
    // 「試す予定」は実験になったので外す
    if (deriveState(input.discoveryId, await repo.interactions.list()).planned) {
      await repo.interactions.put({ id: newId(), discoveryId: input.discoveryId, kind: 'unplan', createdAt: nowIso() });
    }
  }
  return exp;
}

export async function updateExperiment(repo: Repository, id: string, patch: Partial<ExperimentInput>): Promise<Experiment> {
  const prev = await repo.experiments.get(id);
  if (!prev) throw new Error('実験が見つかりません');
  const v = validateExperiment({ title: prev.title, hypothesis: prev.hypothesis, plan: prev.plan, startsOn: prev.startsOn, endsOn: prev.endsOn, ...patch });
  const next = { ...prev, title: v.title, hypothesis: v.hypothesis, plan: v.plan, startsOn: v.startsOn, endsOn: v.endsOn };
  await repo.experiments.put(next);
  return next;
}

export async function removeExperiment(repo: Repository, id: string): Promise<void> {
  for (const l of await repo.experimentLogs.list()) if (l.experimentId === id) await repo.experimentLogs.remove(l.id);
  await removeNodeData(repo, nodeId('experiment', id));
  await repo.experiments.remove(id);
}

export interface LogInput { day: string; did: boolean; rating?: number; text: string }

export async function addLog(repo: Repository, experimentId: string, input: LogInput): Promise<ExperimentLog> {
  const exp = await repo.experiments.get(experimentId);
  if (!exp) throw new Error('実験が見つかりません');
  if (!isValidDay(input.day)) throw new Error('日付を正しく入力してください');
  const rating = input.rating && input.rating >= 1 && input.rating <= 5 ? (Math.round(input.rating) as ExperimentLog['rating']) : undefined;
  const log: ExperimentLog = { id: newId(), experimentId, day: input.day, did: input.did, rating, text: input.text.trim().slice(0, 500), createdAt: nowIso() };
  await repo.experimentLogs.put(log);
  if (exp.status === 'planned') await repo.experiments.put({ ...exp, status: 'running' });
  return log;
}

export const removeLog = (repo: Repository, id: string) => repo.experimentLogs.remove(id);

export async function completeExperiment(repo: Repository, id: string, input: { outcome: Outcome; result: string }): Promise<Experiment> {
  const exp = await repo.experiments.get(id);
  if (!exp) throw new Error('実験が見つかりません');
  const result = input.result.trim();
  if (!result) throw new Error('結果を一言でも書いてください');
  // 結果が変わったら、古い分析は合わなくなるので消す
  const next: Experiment = { ...exp, status: 'done', outcome: input.outcome, result: result.slice(0, 1000), completedAt: exp.completedAt ?? nowIso(), aiAnalysis: undefined };
  await repo.experiments.put(next);
  return next;
}

export async function reopenExperiment(repo: Repository, id: string): Promise<void> {
  const exp = await repo.experiments.get(id);
  if (exp) await repo.experiments.put({ ...exp, status: 'running' });
}

export interface AnalysisOptions { endpoint?: string | null; headers?: Record<string, string>; fetchImpl?: typeof fetch; today?: string }

/** 分析して保存する。外部AIが使えればAI、失敗・未設定ならルールベース（アプリは止めない）。 */
export async function runAnalysis(repo: Repository, id: string, opts: AnalysisOptions = {}): Promise<{ analysis: Analysis; notice?: string }> {
  const exp = await repo.experiments.get(id);
  if (!exp) throw new Error('実験が見つかりません');
  const logs = (await repo.experimentLogs.list()).filter((l) => l.experimentId === id);
  const today = opts.today ?? dateKey();
  let analysis: Analysis, notice: string | undefined;
  if (opts.endpoint) {
    try { analysis = await analyzeRemote(opts.endpoint, exp, logs, today, opts.fetchImpl, opts.headers); }
    catch (e) {
      analysis = analyzeExperiment(exp, logs, today);
      notice = `AIによる分析に失敗したため、ルールベースの分析に切り替えました（${(e as Error).message}）`;
    }
  } else analysis = analyzeExperiment(exp, logs, today);
  await repo.experiments.put({ ...exp, aiAnalysis: analysis });
  return { analysis, notice };
}

/**
 * 実験の結果を Knowledge Network に加える: 結果を「気づき」として記録し、実験ノードと結ぶ。
 * 何度押しても気づきは1つ（結果を書き直したら、その気づきを更新する）。
 */
export async function addResultToNetwork(repo: Repository, id: string): Promise<{ noteId: string }> {
  const exp = await repo.experiments.get(id);
  if (!exp) throw new Error('実験が見つかりません');
  if (exp.status !== 'done' || !exp.result) throw new Error('先に結果を入力してください');
  const externalId = `exp-result:${id}`;
  const text = `実験「${exp.title}」の結果（${exp.outcome ? OUTCOME_JA[exp.outcome] : '評価なし'}）: ${exp.result}`;
  const prev = (await repo.notes.list()).find((n) => n.externalId === externalId);
  const noteId = prev?.id ?? newId();
  await repo.notes.put({ id: noteId, kind: 'insight', text, tags: extractTags(text), createdAt: prev?.createdAt ?? nowIso(), externalId });
  const a = nodeId('experiment', id), b = nodeId('insight', noteId);
  if (!(await repo.edges.list()).some((e) => e.status === 'active' && pairKey(e.sourceNode, e.targetNode) === pairKey(a, b))) {
    await addEdge(repo, { source: a, target: b, relation: '結果', origin: 'system' });
  }
  return { noteId };
}
