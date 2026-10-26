// 純粋なデータ処理（DOM・保存に依存しない）。単体テスト対象。

export const PRIORITIES = ['high', 'mid', 'low'];
export const PRIORITY_LABEL = { high: '高', mid: '中', low: '低' };
const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };

export const TASK_VIEWS = [
  ['open', '未完了'],
  ['today', '今日'],
  ['overdue', '期限切れ'],
  ['high', '優先度高'],
  ['done', '完了'],
  ['all', 'すべて'],
];

// 将来 Claude Code 連携で使う状態。初期版では 'waiting' のまま。
export const REQUEST_STATUS_LABEL = { waiting: '待機中', running: '実行中', done: '完了', failed: '失敗' };
export const APPROVAL_LABEL = { pending: '承認待ち', approved: '承認済み', rejected: '却下' };

export const PROJECTS = [
  { id: 'study-grove', name: 'Study Grove', icon: '🌿', code: 'SG', color: '#3dffb0',
    aliases: ['Study Grove', 'スタディグローブ', 'スタディーグローブ', 'スタディグルーブ', 'スタディーグルーブ'] },
  { id: 'sim-game', name: 'シミュレーションゲーム', icon: '🎮', code: 'SIM', color: '#ffb454',
    aliases: ['シミュレーションゲーム', 'ゲーム制作', 'ゲーム開発', 'ゲーム'] },
  { id: 'materials-informatics', name: 'Materials Informatics', icon: '🔬', code: 'MI', color: '#2de2ff',
    aliases: ['Materials Informatics', 'マテリアルズインフォマティクス', 'マテリアルインフォマティクス'] },
  { id: 'university', name: '大学の勉強', icon: '📚', code: 'UNI', color: '#b39cff',
    aliases: ['大学の勉強', '大学勉強', '大学'] },
];

export function getProject(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}

// ---- 日付 ----
const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

export function newId(prefix = '') {
  const rnd = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + rnd;
}

// ---- タスク ----
export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;

function validateTaskFields(f) {
  const errors = {};
  const title = typeof f.title === 'string' ? f.title.trim() : '';
  if (!title) errors.title = 'タイトルを入力してください';
  else if (title.length > TITLE_MAX) errors.title = `タイトルは${TITLE_MAX}文字以内にしてください`;
  if (!getProject(f.projectId)) errors.projectId = 'プロジェクトを選んでください';
  if (!PRIORITIES.includes(f.priority)) errors.priority = '優先度が正しくありません';
  const due = f.due ? f.due : null;
  if (due !== null && !isValidDate(due)) errors.due = '期限の日付が正しくありません';
  const note = typeof f.note === 'string' ? f.note.trim() : '';
  if (note.length > NOTE_MAX) errors.note = `メモは${NOTE_MAX}文字以内にしてください`;
  return { errors, value: { title, projectId: f.projectId, priority: f.priority, due, note } };
}

export function createTask(input, now = new Date(), id = newId()) {
  const { errors, value } = validateTaskFields({ priority: 'mid', ...input });
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return { ok: true, task: { id, ...value, done: false, doneAt: null, createdAt: iso, updatedAt: iso } };
}

export function updateTask(task, patch, now = new Date()) {
  const { errors, value } = validateTaskFields({ ...task, ...patch });
  if (Object.keys(errors).length) return { ok: false, errors };
  const next = { ...task, ...value, updatedAt: now.toISOString() };
  delete next.sample; // 編集したらサンプル扱いを外す（一括削除の対象外にする）
  return { ok: true, task: next };
}

export function setDone(task, done, now = new Date()) {
  const iso = now.toISOString();
  return { ...task, done: !!done, doneAt: done ? iso : null, updatedAt: iso };
}

export const isOverdue = (t, today) => !t.done && !!t.due && t.due < today;
export const isDueToday = (t, today) => !t.done && t.due === today;

export function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  const pa = PRIORITY_RANK[a.priority], pb = PRIORITY_RANK[b.priority];
  if (pa !== pb) return pa - pb;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export const sortTasks = (tasks) => [...tasks].sort(compareTasks);

export function filterTasks(tasks, { projectId = null, view = 'open' } = {}, today = todayStr()) {
  const out = tasks.filter((t) => {
    if (projectId && t.projectId !== projectId) return false;
    switch (view) {
      case 'open': return !t.done;
      case 'done': return t.done;
      case 'today': return isDueToday(t, today);
      case 'overdue': return isOverdue(t, today);
      case 'high': return !t.done && t.priority === 'high';
      case 'all': return true;
      default: return false;
    }
  });
  return sortTasks(out);
}

export function projectStats(tasks, projectId, today = todayStr()) {
  const mine = tasks.filter((t) => t.projectId === projectId);
  const done = mine.filter((t) => t.done).length;
  const open = mine.length - done;
  return {
    total: mine.length, open, done,
    percent: mine.length ? Math.round((done / mine.length) * 100) : 0,
    overdue: mine.filter((t) => isOverdue(t, today)).length,
    next: sortTasks(mine.filter((t) => !t.done))[0] || null,
  };
}

export function overallStats(tasks, today = todayStr()) {
  return {
    open: tasks.filter((t) => !t.done).length,
    today: tasks.filter((t) => isDueToday(t, today)).length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    high: tasks.filter((t) => !t.done && t.priority === 'high').length,
  };
}

// ---- 開発依頼（タスクとは別管理。初期版は記録のみで、コードは実行しない）----
export const REQUEST_MAX = 2000;

export function createRequest(input, now = new Date(), id = newId('req-')) {
  const errors = {};
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) errors.body = '依頼内容を入力してください';
  else if (body.length > REQUEST_MAX) errors.body = `依頼内容は${REQUEST_MAX}文字以内にしてください`;
  if (!getProject(input.projectId)) errors.projectId = 'プロジェクトを選んでください';
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return {
    ok: true,
    request: { id, projectId: input.projectId, body, createdAt: iso, updatedAt: iso, approval: 'pending', status: 'waiting' },
  };
}

export function setApproval(req, approval, now = new Date()) {
  if (!Object.keys(APPROVAL_LABEL).includes(approval)) throw new Error(`invalid approval: ${approval}`);
  return { ...req, approval, updatedAt: now.toISOString() };
}

// ---- サンプル ----
export function sampleTasks(today = todayStr(), now = new Date()) {
  const rows = [
    ['study-grove', '学習ログ画面のレイアウトを確認する', 'high', 0],
    ['study-grove', '復習リマインド機能のアイデアを書き出す', 'low', 5],
    ['sim-game', '資源バランスの数値を見直す', 'mid', 1],
    ['sim-game', 'セーブデータ形式を決める', 'high', -1],
    ['materials-informatics', '論文を1本読んで要点をまとめる', 'mid', 2],
    ['materials-informatics', 'データセットの欠損値を確認する', 'high', 0],
    ['university', 'レポートの構成を考える', 'high', 3],
    ['university', '小テストの範囲を復習する', 'mid', 0],
  ];
  return rows.map(([projectId, title, priority, offset], i) => {
    const r = createTask({ projectId, title, priority, due: addDays(today, offset), note: 'サンプルタスクです' },
      new Date(now.getTime() + i), `sample-${i + 1}`);
    return { ...r.task, sample: true };
  });
}
