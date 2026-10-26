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
