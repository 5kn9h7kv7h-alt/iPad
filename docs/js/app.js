import * as M from './core/model.js';
import { parseCommand } from './core/voice.js';
import { openRepository } from './storage/repository.js';
import { buildBackup, parseBackup, decodeImportText } from './core/backup.js';
import * as R from './core/receipt.js';
import { createLedger } from './ledger.js';
import { saveFile } from './core/save.js';
import { startFx } from './fx.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { repo: null, tasks: [], requests: [], receipts: [], rules: [], selectedTaskId: null, undo: null, toastTimer: null, voice: { parsed: null } };
let ledger; // init() で生成（保存層の準備後）
const SpeechRecognitionImpl = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

// ---------- 小物 ----------
const today = () => M.todayStr();
const byId = (id) => state.tasks.find((t) => t.id === id) || null;

function dueInfo(t) {
  if (!t.due) return null;
  const td = today();
  const [, m, d] = t.due.split('-').map(Number);
  if (t.done) return { text: `${m}/${d}`, cls: '' };
  if (t.due < td) return { text: `期限切れ ${m}/${d}`, cls: 'over' };
  if (t.due === td) return { text: '今日まで', cls: 'today' };
  if (t.due === M.addDays(td, 1)) return { text: '明日まで', cls: '' };
  return { text: `${m}/${d}まで`, cls: '' };
}

function toast(message, undo = null) {
  const el = $('#toast');
  state.undo = undo;
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-action="undo">元に戻す</button>' : ''}`;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.hidden = true; state.undo = null; }, undo ? 7000 : 3500);
}

async function guard(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast('保存に失敗しました。もう一度お試しください'); return null; }
}

function choose({ title, message = '', buttons }) {
  return new Promise((resolve) => {
    const dlg = $('#choice-dialog');
    dlg.innerHTML = `<h2 id="choice-title">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="form-actions" style="flex-direction:column;align-items:stretch">
        ${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        <button type="button" class="btn ghost" data-i="-1">キャンセル</button></div>`;
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (b) { const i = Number(b.dataset.i); done(i < 0 ? null : buttons[i].value); } };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
  });
}
const confirmDialog = async (title, message, okLabel, danger = true) =>
  (await choose({ title, message, buttons: [{ value: true, label: okLabel, kind: danger ? 'danger' : 'primary' }] })) === true;

// ---------- 永続化つき操作 ----------
// 画面を先に更新し（即時反映）、その後で永続化する。保存に失敗した場合は guard が通知する。
async function saveTask(task) {
  const i = state.tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) state.tasks[i] = task; else state.tasks.push(task);
  const written = state.repo.putTask(task); // 先に書き込みを開始（描画で遅れて、直後に閉じられても失われにくくする）
  render();
  await written;
}
async function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.selectedTaskId === id) state.selectedTaskId = null;
  const written = state.repo.deleteTask(id);
  render();
  await written;
}
async function saveRequest(req) {
  const i = state.requests.findIndex((r) => r.id === req.id);
  if (i >= 0) state.requests[i] = req; else state.requests.push(req);
  const written = state.repo.putRequest(req);
  render();
  await written;
}
async function removeRequest(id) {
  state.requests = state.requests.filter((r) => r.id !== id);
  const written = state.repo.deleteRequest(id);
  render();
  await written;
}

async function setTaskDone(id, done) {
  const t = byId(id);
  if (!t || t.done === done) return;
  state.selectedTaskId = id;
  await guard(() => saveTask(M.setDone(t, done)));
  toast(done ? `「${t.title}」を完了にしました` : `「${t.title}」を未完了に戻しました`,
    () => guard(() => saveTask(t)));
}

async function deleteTaskWithUndo(id) {
  const t = byId(id);
  if (!t) return;
  await guard(() => removeTask(id));
  toast(`「${t.title}」を削除しました`, () => guard(() => saveTask(t)));
}

// ---------- ルーティング ----------
function currentRoute() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  return { name: name || 'home', id: id ? decodeURIComponent(id) : null, q: new URLSearchParams(qs) };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const viewHref = (base, view, extra = {}) => {
  const q = new URLSearchParams({ view, ...extra });
  return `${base}?${q}`;
};

// ---------- 描画 ----------
function projectStyle(id) { return `--pc:${M.getProject(id)?.color || 'var(--accent)'}`; }

function taskRow(t, showProject) {
  const p = M.getProject(t.projectId);
  const due = dueInfo(t);
  return `<li class="task ${t.done ? 'done' : ''} ${state.selectedTaskId === t.id ? 'selected' : ''}" style="${projectStyle(t.projectId)}" data-task="${esc(t.id)}">
    <button class="check" type="button" data-action="toggle" data-id="${esc(t.id)}" aria-pressed="${t.done}"
      aria-label="${t.done ? '未完了に戻す' : '完了にする'}：${esc(t.title)}">✓</button>
    <button class="task-main" type="button" data-action="open-task" data-id="${esc(t.id)}">
      <span class="title">${esc(t.title)}</span>
      <span class="meta">
        ${showProject && p ? `<span class="badge proj">${p.code} ${esc(p.name)}</span>` : ''}
        ${due ? `<span class="badge ${due.cls}">${esc(due.text)}</span>` : ''}
        ${t.priority === 'high' ? '<span class="badge high">優先度 高</span>' : t.priority === 'low' ? '<span class="badge">優先度 低</span>' : ''}
        ${t.note ? '<span class="badge">メモ</span>' : ''}
      </span>
    </button></li>`;
}

function taskList(tasks, showProject, emptyMsg) {
  if (!tasks.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
  return `<ul class="tasks">${tasks.map((t) => taskRow(t, showProject)).join('')}</ul>`;
}

function chips(base, current, extra = {}) {
  return `<nav class="chips" aria-label="表示の切り替え">${M.TASK_VIEWS.map(([v, label]) =>
    `<a class="chip" href="#${viewHref(base, v, extra)}" ${v === current ? 'aria-current="true"' : ''}>${label}</a>`).join('')}</nav>`;
}

function homeView() {
  const td = today();
  const o = M.overallStats(state.tasks, td);
  const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' });
  const cards = M.PROJECTS.map((p) => {
    const s = M.projectStats(state.tasks, p.id, td);
    const nd = s.next ? dueInfo(s.next) : null;
    return `<a class="card" style="${projectStyle(p.id)}" href="#/project/${p.id}" data-testid="card-${p.id}">
      <div class="card-head"><div class="card-icon" aria-hidden="true">${p.code}</div><div><h3>${esc(p.name)}</h3>
        <span class="muted">${s.total ? `進捗 ${s.percent}%` : 'タスクなし'}</span></div></div>
      <div class="progress" role="progressbar" aria-valuenow="${s.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)}の進捗"><i style="width:${s.percent}%"></i></div>
      <div class="card-meta"><span>未完了 <b>${s.open}</b></span><span>完了 <b>${s.done}</b></span>${s.overdue ? `<span style="color:var(--danger)">期限切れ <b>${s.overdue}</b></span>` : ''}</div>
      <div class="card-next"><small data-en="Next Action">次にやること</small>${s.next ? `${esc(s.next.title)}${nd ? ` <span class="badge ${nd.cls}">${esc(nd.text)}</span>` : ''}` : '<span class="muted">未完了のタスクはありません</span>'}</div>
    </a>`;
  }).join('');
  return `<div class="page-head"><div><h1 data-en="Control Panel // Dashboard">AI コントロールパネル</h1><span class="muted">${esc(dateLabel)}</span></div>
      <button class="btn primary" type="button" data-action="new-task">＋ タスク追加</button></div>
    <div class="summary">
      <a class="stat" href="#${viewHref('/tasks', 'today')}"><b>${o.today}</b><span data-en="Today">今日</span></a>
      <a class="stat ${o.overdue ? 'alert' : ''}" href="#${viewHref('/tasks', 'overdue')}"><b>${o.overdue}</b><span data-en="Overdue">期限切れ</span></a>
      <a class="stat" href="#${viewHref('/tasks', 'high')}"><b>${o.high}</b><span data-en="High Prio">優先度高</span></a>
      <a class="stat" href="#${viewHref('/tasks', 'open')}"><b>${o.open}</b><span data-en="Open">未完了</span></a>
    </div>
    <div class="cards">${cards}${ledger.homeCard()}</div>
    ${state.tasks.length ? '' : '<p class="empty" style="margin-top:16px">まだタスクがありません。「＋ タスク追加」か、設定でサンプルを追加できます。</p>'}`;
}

function projectView(id, q) {
  const p = M.getProject(id);
  if (!p) return `<a class="back" href="#/">← ホーム</a><div class="empty">プロジェクトが見つかりません</div>`;
  const view = q.get('view') || 'open';
  const s = M.projectStats(state.tasks, id, today());
  const tasks = M.filterTasks(state.tasks, { projectId: id, view }, today());
  const reqs = state.requests.filter((r) => r.projectId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const reqHtml = reqs.length ? reqs.map(requestCard).join('') : '<div class="empty">開発依頼はまだありません</div>';
  return `<a class="back" href="#/">← ホーム</a>
    <div class="page-head" style="${projectStyle(id)}"><div class="card-head"><div class="card-icon" aria-hidden="true">${p.code}</div><div><h1 style="margin:0" data-en="Project Module">${esc(p.name)}</h1>
      <span class="muted">未完了 ${s.open} ・ 完了 ${s.done} ・ 進捗 ${s.percent}%</span></div></div>
      <button class="btn primary" type="button" data-action="new-task" data-project="${id}">＋ タスク追加</button></div>
    <div class="progress" style="${projectStyle(id)}"><i style="width:${s.percent}%"></i></div>
    <div class="card-next" style="border:0"><small class="muted" data-en="Next Action">次にやること</small> ${s.next ? `<b>${esc(s.next.title)}</b>` : '<span class="muted">なし</span>'}</div>
    ${chips(`/project/${id}`, view)}
    ${taskList(tasks, false, 'この条件のタスクはありません')}
    <h2 data-en="Dev Requests">開発依頼</h2>
    <p class="notice">開発依頼は<b>記録のみ</b>です。コードの実行は行いません（将来のClaude Code連携用に、承認状態と一緒に保存します）。</p>
    <div class="btn-row" style="margin:10px 0"><button class="btn" type="button" data-action="new-request" data-project="${id}">＋ 開発依頼を記録</button></div>
    <div class="tasks">${reqHtml}</div>`;
}

function requestCard(r) {
  const created = new Date(r.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cls = r.approval === 'approved' ? 'ok' : r.approval === 'rejected' ? 'over' : 'today';
  return `<div class="req" data-req="${esc(r.id)}">
    <div class="meta"><span class="badge ${cls}">${M.APPROVAL_LABEL[r.approval]}</span><span class="badge">${M.REQUEST_STATUS_LABEL[r.status]}</span><span class="muted">${esc(created)}</span></div>
    <p>${esc(r.body)}</p>
    <div class="req-actions">
      ${r.approval !== 'approved' ? `<button class="btn small" type="button" data-action="req-approve" data-id="${esc(r.id)}">承認する</button>` : ''}
      ${r.approval !== 'rejected' ? `<button class="btn small" type="button" data-action="req-reject" data-id="${esc(r.id)}">却下</button>` : ''}
      <button class="btn small ghost" type="button" data-action="req-delete" data-id="${esc(r.id)}">削除</button>
    </div></div>`;
}

function tasksView(q) {
  const view = q.get('view') || 'open';
  const pid = M.getProject(q.get('project')) ? q.get('project') : '';
  const tasks = M.filterTasks(state.tasks, { projectId: pid || null, view }, today());
  const options = [`<option value="">すべてのプロジェクト</option>`, ...M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`)].join('');
  return `<div class="page-head"><h1 data-en="Task Matrix">すべてのタスク</h1><button class="btn primary" type="button" data-action="new-task" data-project="${pid}">＋ タスク追加</button></div>
    <div class="filter-row"><label class="sr-only" for="proj-filter">プロジェクトで絞り込み</label>
      <select id="proj-filter" data-action="filter-project" data-view="${esc(view)}">${options}</select>
      <span class="muted">${tasks.length}件</span></div>
    ${chips('/tasks', view, pid ? { project: pid } : {})}
    ${taskList(tasks, true, 'この条件のタスクはありません')}`;
}

function settingsView() {
  const SR = SpeechRecognitionImpl();
  const secure = window.isSecureContext;
  const sampleCount = state.tasks.filter((t) => t.sample).length;
  const voiceMsg = !SR ? '❌ このブラウザは音声認識に対応していません。テキスト入力で同じ指示を実行できます。'
    : !secure ? '⚠️ 音声認識APIはありますが、HTTPS（または localhost）でないため使えない可能性があります。'
    : '✅ 音声認識を利用できます（初回はマイクの許可が必要です）。';
  return `<h1 data-en="System Config">設定</h1>
    <section class="panel"><h3 data-en="Voice Input">音声認識</h3><p class="status-line">${esc(voiceMsg)}</p>
      <p class="muted">音声認識はブラウザ／OSの機能です。Safariでは音声がApple側のサービスで処理される場合があります。このアプリは音声を保存せず、認識結果の文字だけを使います。</p></section>
    <section class="panel"><h3 data-en="Storage">データの保存</h3>
      <p>${state.repo.persistent ? '✅ このブラウザ内（IndexedDB）に保存しています。' : '⚠️ この環境ではブラウザ内保存が使えず、再読み込みでデータが消えます。バックアップを書き出してください。'}</p>
      <p class="muted">Safariは、長期間開かないサイトのデータを自動削除することがあります。「ホーム画面に追加」して使い、定期的にJSONを書き出してください。タスク ${state.tasks.length}件・開発依頼 ${state.requests.length}件・レシート ${state.receipts.length}件。</p></section>
    <section class="panel"><h3 data-en="Backup">バックアップ（JSON）</h3>
      <div class="btn-row"><button class="btn" type="button" data-action="export">書き出す</button>
        <button class="btn" type="button" data-action="copy-json">JSONをコピー</button>
        <button class="btn" type="button" data-action="import">読み込む…</button>
        <button class="btn" type="button" data-action="import-text">コードで読み込む…</button></div>
      <input id="import-file" type="file" accept="application/json,.json" hidden></section>
    <section class="panel"><h3 data-en="Learned Rules">家計簿の分類ルール</h3>
      <p class="muted">レシートで分類を直すと、同じ品名は次回から自動でその分類になります（学習済み ${state.rules.length}件）。レシート画像は保存しません。</p>
      <div class="btn-row"><button class="btn" type="button" data-action="ledger-reset-rules" ${state.rules.length ? '' : 'disabled'}>学習内容をリセット</button></div></section>
    <section class="panel"><h3 data-en="Sample Data">サンプルデータ</h3>
      <div class="btn-row"><button class="btn" type="button" data-action="add-samples">サンプルタスクを追加</button>
        <button class="btn" type="button" data-action="remove-samples" ${sampleCount ? '' : 'disabled'}>サンプルを削除（${sampleCount}件）</button></div></section>
    <section class="panel"><h3 data-en="Wipe Data">データの全消去</h3><p class="muted">タスクと開発依頼をすべて削除します。元に戻せません。先にバックアップを書き出してください。</p>
      <div class="btn-row"><button class="btn danger" type="button" data-action="clear-all">すべて削除…</button></div></section>
    <section class="panel"><h3 data-en="About">このアプリについて</h3>
      <p class="muted">APIキーや認証情報は保存・表示しません。外部サービスへの通信は行いません。コード実行機能はありません（開発依頼は記録のみ）。</p></section>`;
}

let lastRouteKey = null;
function render() {
  const r = currentRoute();
  const routeKey = `${r.name}/${r.id || ''}`;
  if (lastRouteKey !== null && routeKey !== lastRouteKey) window.scrollTo(0, 0); // 画面が変わったらHUDの下に隠れないよう先頭へ
  lastRouteKey = routeKey;
  const app = $('#app');
  let html;
  if (r.name === 'project') html = projectView(r.id, r.q);
  else if (r.name === 'tasks') html = tasksView(r.q);
  else if (r.name === 'ledger') html = ledger.view(r.q);
  else if (r.name === 'settings') html = settingsView();
  else html = homeView();
  app.innerHTML = html;
  const nav = r.name === 'project' ? 'home' : r.name;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ---------- タスク／依頼フォーム ----------
function fieldErr(errors, k) { return `<div class="err" data-err="${k}">${errors?.[k] ? esc(errors[k]) : ''}</div>`; }

function openTaskForm({ task = null, projectId = null, title = '' } = {}) {
  const dlg = $('#task-dialog');
  const v = task || { title, projectId: projectId || currentRoute().id || M.PROJECTS[0].id, priority: 'mid', due: '', note: '' };
  if (!M.getProject(v.projectId)) v.projectId = M.PROJECTS[0].id;
  if (task) state.selectedTaskId = task.id;
  dlg.innerHTML = `<div class="sheet-head"><h2 id="task-dialog-title">${task ? 'タスクを編集' : 'タスクを追加'}</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
    <form class="form" id="task-form" novalidate>
      <div class="field"><label for="tf-title">タイトル</label><input id="tf-title" type="text" maxlength="200" autocomplete="off" value="${esc(v.title)}">${fieldErr({}, 'title')}</div>
      <div class="field"><label for="tf-project">プロジェクト</label><select id="tf-project">${M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === v.projectId ? 'selected' : ''}>${p.code} · ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><span class="label">優先度</span><div class="seg" role="radiogroup" aria-label="優先度">
        ${['high', 'mid', 'low'].map((p) => `<label><input type="radio" name="tf-priority" value="${p}" ${v.priority === p ? 'checked' : ''}><span>${M.PRIORITY_LABEL[p]}</span></label>`).join('')}</div></div>
      <div class="field"><label for="tf-due">期限</label><input id="tf-due" type="date" value="${esc(v.due || '')}">
        <div class="quick"><button type="button" class="btn small" data-due="0">今日</button><button type="button" class="btn small" data-due="1">明日</button><button type="button" class="btn small" data-due="7">1週間後</button><button type="button" class="btn small ghost" data-due="">なし</button></div>${fieldErr({}, 'due')}</div>
      <div class="field"><label for="tf-note">メモ</label><textarea id="tf-note" maxlength="2000">${esc(v.note || '')}</textarea></div>
      <div class="form-actions">
        ${task ? `<button type="button" class="btn danger" data-act="delete">削除</button><button type="button" class="btn" data-act="toggle">${task.done ? '未完了に戻す' : '完了にする'}</button>` : ''}
        <button type="submit" class="btn primary">保存</button></div>
    </form>`;
  const form = $('#task-form', dlg);
  dlg.onclick = async (e) => {
    if (e.target.closest('[data-close]')) return dlg.close();
    const due = e.target.closest('[data-due]');
    if (due) { const n = due.dataset.due; $('#tf-due', dlg).value = n === '' ? '' : M.addDays(today(), Number(n)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'delete') {
      if (await confirmDialog('タスクを削除しますか？', `「${task.title}」を削除します。`, '削除する')) { dlg.close(); await deleteTaskWithUndo(task.id); }
    } else if (act === 'toggle') { dlg.close(); await setTaskDone(task.id, !task.done); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = {
      title: $('#tf-title', dlg).value, projectId: $('#tf-project', dlg).value,
      priority: form.querySelector('input[name=tf-priority]:checked')?.value, due: $('#tf-due', dlg).value || null, note: $('#tf-note', dlg).value,
    };
    const res = task ? M.updateTask(task, input) : M.createTask(input);
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = res.errors?.[el.dataset.err] || ''; });
    if (!res.ok) { const first = Object.keys(res.errors)[0]; $(`[data-err="${first}"]`, dlg)?.scrollIntoView({ block: 'nearest' }); return; }
    await guard(async () => {
      await saveTask(res.task);
      state.selectedTaskId = res.task.id;
      dlg.close();
      toast(task ? '保存しました' : `「${res.task.title}」を追加しました`);
      render();
    });
  };
  dlg.oncancel = () => {};
  dlg.showModal();
  if (!task) $('#tf-title', dlg).focus();
}

function openRequestForm({ projectId = null, body = '' } = {}) {
  const dlg = $('#request-dialog');
  const pid = M.getProject(projectId) ? projectId : (currentRoute().id || M.PROJECTS[0].id);
  dlg.innerHTML = `<div class="sheet-head"><h2 id="request-dialog-title">開発依頼を記録</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
    <p class="notice">記録のみで、コードは実行されません。承認状態は「承認待ち」で保存されます。</p>
    <form class="form" id="request-form" novalidate>
      <div class="field"><label for="rf-project">プロジェクト</label><select id="rf-project">${M.PROJECTS.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${p.code} · ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="rf-body">依頼内容</label><textarea id="rf-body" maxlength="2000">${esc(body)}</textarea>${fieldErr({}, 'body')}</div>
      <div class="form-actions"><button type="submit" class="btn primary">記録する</button></div></form>`;
  dlg.onclick = (e) => { if (e.target.closest('[data-close]')) dlg.close(); };
  $('#request-form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const res = M.createRequest({ projectId: $('#rf-project', dlg).value, body: $('#rf-body', dlg).value });
    $('[data-err="body"]', dlg).textContent = res.errors?.body || '';
    if (!res.ok) return;
    await guard(async () => { await saveRequest(res.request); dlg.close(); toast('開発依頼を記録しました（承認待ち）'); });
  };
  dlg.showModal();
}

// ---------- 音声・テキスト指示 ----------
function ctxNow() {
  const r = currentRoute();
  return { currentProjectId: r.name === 'project' ? r.id : null, selectedTaskId: byId(state.selectedTaskId) ? state.selectedTaskId : null };
}

function setVoiceResult(html) { $('#voice-result').innerHTML = html; }

function openVoice() {
  const dlg = $('#voice-dialog');
  const SR = SpeechRecognitionImpl();
  $('#voice-support').textContent = SR
    ? (window.isSecureContext ? '「話す」を押して指示するか、下の欄に入力してください。' : 'HTTPSでないため音声認識が使えない場合があります。その場合は下の欄に入力してください。')
    : 'このブラウザは音声認識に対応していません。下の欄に入力して同じ操作ができます。';
  $('#voice-mic').hidden = !SR;
  $('#voice-input').value = '';
  setVoiceResult('');
  state.voice.parsed = null;
  dlg.showModal();
  if (!SR) $('#voice-input').focus();
}

function interpret(text) {
  const parsed = parseCommand(text, ctxNow());
  state.voice.parsed = parsed;
  if (parsed.intent === 'empty') return setVoiceResult('<div class="interp">指示を入力してください。</div>');
  if (parsed.intent === 'unknown') {
    return setVoiceResult(`<div class="interp warn"><b>解釈できませんでした</b><span class="muted">「${esc(text)}」</span>
      <span class="muted">例：「今日やることを表示」「大学の勉強に、レポートを書くを追加」</span></div>`);
  }
  if (!parsed.mutating) { runCommand(parsed); return; }
  const sel = byId(ctxNow().selectedTaskId);
  const needsTarget = ['complete_task', 'uncomplete_task', 'delete_task'].includes(parsed.intent);
  if (needsTarget && !sel) {
    return setVoiceResult(`<div class="interp warn"><b>${esc(parsed.summary)}</b><span>対象のタスクが選ばれていません。先にタスクをタップしてから、もう一度指示してください。</span></div>`);
  }
  const label = parsed.intent === 'delete_task' ? '削除する' : '実行する';
  setVoiceResult(`<div class="interp ${parsed.danger ? 'warn' : ''}">
    <span class="muted">認識：「${esc(text)}」</span><b>${esc(parsed.summary)}</b>
    ${needsTarget ? `<span>対象：「${esc(sel.title)}」</span>` : ''}
    ${parsed.intent === 'add_task' && (!parsed.title || !parsed.projectId) ? '<span class="muted">足りない項目は、次の画面で入力します。</span>' : ''}
    <div class="form-actions"><button class="btn ghost" type="button" data-vact="cancel">やめる</button>
      <button class="btn ${parsed.danger ? 'danger' : 'primary'}" type="button" data-vact="run">${label}</button></div></div>`);
}

async function runCommand(p) {
  const dlg = $('#voice-dialog');
  const td = today();
  const close = () => { if (dlg.open) dlg.close(); };
  const sel = byId(ctxNow().selectedTaskId);
  switch (p.intent) {
    case 'show_tasks': {
      const n = M.filterTasks(state.tasks, { projectId: p.projectId, view: p.view }, td).length;
      close(); go(viewHref('#/tasks', p.view, p.projectId ? { project: p.projectId } : {}));
      toast(`${p.summary}（${n}件）`); break;
    }
    case 'show_project': close(); go(`#/project/${p.projectId}`); toast(p.summary); break;
    case 'show_status': {
      const o = M.overallStats(state.tasks, td);
      close(); go(p.projectId ? `#/project/${p.projectId}` : '#/');
      toast(p.projectId ? p.summary : `未完了${o.open}件 / 今日${o.today}件 / 期限切れ${o.overdue}件`); break;
    }
    case 'add_task': {
      if (!p.title || !p.projectId) { close(); openTaskForm({ projectId: p.projectId, title: p.title || '' }); break; }
      const res = M.createTask({ projectId: p.projectId, title: p.title });
      if (!res.ok) { close(); openTaskForm({ projectId: p.projectId, title: p.title }); break; }
      await guard(() => saveTask(res.task));
      state.selectedTaskId = res.task.id;
      close(); go(`#/project/${p.projectId}`); toast(`「${res.task.title}」を追加しました`, () => guard(() => removeTask(res.task.id)));
      break;
    }
    case 'add_request': {
      if (!p.body || !p.projectId) { close(); openRequestForm({ projectId: p.projectId, body: p.body || '' }); break; }
      const res = M.createRequest({ projectId: p.projectId, body: p.body });
      if (!res.ok) { close(); openRequestForm({ projectId: p.projectId, body: p.body }); break; }
      await guard(() => saveRequest(res.request));
      close(); go(`#/project/${p.projectId}`); toast('開発依頼を記録しました（承認待ち・実行はされません）'); break;
    }
    case 'complete_task': close(); if (sel) await setTaskDone(sel.id, true); break;
    case 'uncomplete_task': close(); if (sel) await setTaskDone(sel.id, false); break;
    case 'delete_task': close(); if (sel) await deleteTaskWithUndo(sel.id); break;
    case 'show_ledger': {
      const month = p.month === 'last' ? R.shiftMonth(ledger.thisMonth(), -1) : ledger.thisMonth();
      const s = R.monthSummary(state.receipts, month);
      const amt = p.category ? (s.categories.find((c) => c.category === p.category)?.amount ?? 0) : s.total;
      close(); go(ledger.href(month, p.category));
      toast(`${R.monthLabel(month)}の${p.category ? `${p.category}` : '支出'}は ¥${amt.toLocaleString('ja-JP')}（レシート${s.count}件）`); break;
    }
    case 'scan_receipt': close(); go('#/ledger'); ledger.openScan(); break;
    default: break;
  }
}

let recognition = null;
function startListening() {
  const SR = SpeechRecognitionImpl();
  const btn = $('#voice-mic');
  if (!SR) return;
  if (recognition) { try { recognition.stop(); } catch { /* noop */ } return; }
  const r = new SR();
  recognition = r;
  r.lang = 'ja-JP'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  btn.textContent = '🎙 聞いています…（タップで停止）';
  r.onresult = (e) => {
    const text = e.results?.[0]?.[0]?.transcript || '';
    $('#voice-input').value = text;
    interpret(text);
  };
  r.onerror = (e) => {
    const msg = { 'not-allowed': 'マイクの許可がありません。設定でSafariのマイクを許可するか、テキストで入力してください。', 'service-not-allowed': '音声認識が許可されていません。テキストで入力してください。',
      'no-speech': '音声が聞き取れませんでした。もう一度お試しください。', 'network': '音声認識サービスに接続できませんでした。テキストで入力してください。' }[e.error] || `音声認識エラー（${e.error}）。テキストで入力してください。`;
    setVoiceResult(`<div class="interp warn">${esc(msg)}</div>`);
  };
  r.onend = () => { recognition = null; btn.textContent = '🎤 話す'; };
  try { r.start(); } catch { recognition = null; btn.textContent = '🎤 話す'; }
}

// ---------- 設定画面の操作 ----------
const backupText = () => JSON.stringify(buildBackup({ tasks: state.tasks, requests: state.requests, receipts: state.receipts, rules: state.rules }), null, 2);

async function importFile(file) {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return toast(`読み込めません：${parsed.error}`);
  const warn = parsed.warnings.length ? `（${parsed.warnings.length}件の不正データをスキップ）` : '';
  const mode = await choose({
    title: 'バックアップを読み込む', message: `タスク${parsed.tasks.length}件・開発依頼${parsed.requests.length}件・レシート${parsed.receipts.length}件${warn}`,
    buttons: [{ value: 'merge', label: '今のデータに追加（同じIDは上書き）', kind: 'primary' }, { value: 'replace', label: '今のデータを置き換える', kind: 'danger' }],
  });
  if (!mode) return;
  await guard(async () => {
    if (mode === 'replace') await state.repo.replaceAll({ tasks: parsed.tasks, requests: parsed.requests, receipts: parsed.receipts, rules: parsed.rules });
    else await state.repo.putMany({ tasks: parsed.tasks, requests: parsed.requests, receipts: parsed.receipts, rules: parsed.rules });
    Object.assign(state, await state.repo.loadAll());
    render(); toast('読み込みました');
  });
}

const yenText = (n) => `¥${n.toLocaleString('ja-JP')}`;

/** Claudeなどから受け取った読み込みコード（またはJSON）を貼り付けて、今のデータに追加する */
function openImportText() {
  const dlg = $('#import-dialog');
  dlg.innerHTML = `<div class="sheet-head"><h2 id="import-title" data-en="Import Code">コードで読み込む</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
    <p class="notice">Claudeから受け取った読み込みコード（<code>ACPRCP1:</code>で始まる文字列）か、バックアップのJSONを貼り付けます。<b>今のデータは消えず、追加されます</b>（同じレシートを2回読み込んでも重複しません）。</p>
    <form class="form" id="import-form" novalidate>
      <div class="field"><label for="import-text">コード</label><textarea id="import-text" autocomplete="off" spellcheck="false" placeholder="ACPRCP1:…"></textarea></div>
      <div id="import-err" class="err" role="alert"></div>
      <div class="form-actions"><button type="submit" class="btn primary">内容を確認</button></div></form>`;
  dlg.onclick = (e) => { if (e.target.closest('[data-close]')) dlg.close(); };
  $('#import-form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const err = (m) => { $('#import-err', dlg).textContent = m || ''; };
    const dec = decodeImportText($('#import-text', dlg).value);
    if (!dec.ok) return err(dec.error);
    const parsed = parseBackup(dec.json);
    if (!parsed.ok) return err(parsed.error);
    const total = parsed.tasks.length + parsed.requests.length + parsed.receipts.length;
    if (!total) return err('読み込める内容がありません');
    err('');
    const lines = parsed.receipts.slice(0, 8).map((r) => `${r.date} ${r.store || '（店名なし）'} ${yenText(r.total)}`).join(' / ');
    const ok = await choose({
      title: '次の内容を追加します',
      message: `レシート${parsed.receipts.length}件・タスク${parsed.tasks.length}件・開発依頼${parsed.requests.length}件${parsed.warnings.length ? `（不正な${parsed.warnings.length}件をスキップ）` : ''}。${lines ? `　${lines}` : ''}`,
      buttons: [{ value: true, label: '追加する', kind: 'primary' }],
    });
    if (ok !== true) return;
    await guard(async () => {
      await state.repo.putMany({ tasks: parsed.tasks, requests: parsed.requests, receipts: parsed.receipts, rules: parsed.rules });
      Object.assign(state, await state.repo.loadAll());
      dlg.close();
      const first = parsed.receipts[0];
      go(first ? ledger.href(R.monthOf(first.date)) : '#/');
      toast(`追加しました（レシート${parsed.receipts.length}件）`);
    });
  };
  dlg.showModal();
  $('#import-text', dlg).focus();
}

async function onAction(el) {
  const { action, id } = el.dataset;
  switch (action) {
    case 'toggle': { const t = byId(id); if (t) await setTaskDone(id, !t.done); break; }
    case 'open-task': { const t = byId(id); if (t) { state.selectedTaskId = id; render(); openTaskForm({ task: t }); } break; }
    case 'new-task': openTaskForm({ projectId: el.dataset.project || null }); break;
    case 'new-request': openRequestForm({ projectId: el.dataset.project }); break;
    case 'req-approve': case 'req-reject': {
      const r = state.requests.find((x) => x.id === id);
      if (!r) break;
      const approve = action === 'req-approve';
      if (approve && !(await confirmDialog('この依頼を承認しますか？', '承認しても、このアプリはコードを実行しません。状態が「承認済み」になるだけです。', '承認する', false))) break;
      await guard(() => saveRequest(M.setApproval(r, approve ? 'approved' : 'rejected')));
      break;
    }
    case 'req-delete':
      if (await confirmDialog('開発依頼を削除しますか？', '', '削除する')) await guard(() => removeRequest(id));
      break;
    case 'filter-project': {
      const q = new URLSearchParams({ view: el.dataset.view });
      if (el.value) q.set('project', el.value);
      go(`#/tasks?${q}`); break;
    }
    case 'export': { const r = await saveFile(`ai-control-panel-${today()}.json`, backupText(), 'application/json'); if (r === 'saved') toast('書き出しました'); else if (r === 'failed') toast('書き出せませんでした。「JSONをコピー」をお使いください'); break; }
    case 'copy-json':
      try { await navigator.clipboard.writeText(backupText()); toast('JSONをコピーしました'); } catch { toast('コピーできませんでした。「書き出す」を使ってください'); }
      break;
    case 'import': $('#import-file').click(); break;
    case 'import-text': openImportText(); break;
    case 'add-samples': {
      const existing = new Set(state.tasks.map((t) => t.id));
      const samples = M.sampleTasks(today()).filter((t) => !existing.has(t.id));
      if (!samples.length) { toast('サンプルは追加済みです'); break; }
      await guard(async () => { const written = state.repo.putTasks(samples); state.tasks.push(...samples); render(); toast(`サンプル${samples.length}件を追加しました`); await written; });
      break;
    }
    case 'remove-samples': {
      const ids = state.tasks.filter((t) => t.sample).map((t) => t.id);
      if (!(await confirmDialog('サンプルを削除しますか？', `サンプルタスク${ids.length}件を削除します（編集したものは残ります）。`, '削除する'))) break;
      await guard(async () => { state.tasks = state.tasks.filter((t) => !t.sample); render(); toast('サンプルを削除しました'); for (const i of ids) await state.repo.deleteTask(i); });
      break;
    }
    case 'clear-all':
      if (!(await confirmDialog('すべてのデータを削除しますか？', `タスク${state.tasks.length}件・開発依頼${state.requests.length}件・レシート${state.receipts.length}件が消えます。元に戻せません。`, 'すべて削除'))) break;
      await guard(async () => { await state.repo.clearAll(); state.tasks = []; state.requests = []; state.receipts = []; state.rules = []; state.selectedTaskId = null; render(); toast('すべて削除しました'); });
      break;
    case 'undo': { const fn = state.undo; $('#toast').hidden = true; state.undo = null; if (fn) await fn(); break; }
    default: if (action?.startsWith('ledger-')) await ledger.onAction(el); break;
  }
}

// ---------- 起動 ----------
async function init() {
  state.repo = await openRepository();
  ledger = createLedger({ state, $, esc, toast, guard, choose, confirmDialog, render, go });
  Object.assign(state, await state.repo.loadAll());
  navigator.storage?.persist?.().catch(() => {});

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && el.tagName !== 'SELECT') onAction(el);
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('select[data-action]')) onAction(e.target);
    if (e.target.id === 'import-file' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; }
  });
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target === d) d.close(); // 背景タップで閉じる
  }));
  $('#toast').addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (b) onAction(b); });

  $('#mic-fab').addEventListener('click', openVoice);
  const vd = $('#voice-dialog');
  vd.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) vd.close();
    const v = e.target.closest('[data-vact]')?.dataset.vact;
    if (v === 'cancel') setVoiceResult('');
    if (v === 'run' && state.voice.parsed) runCommand(state.voice.parsed);
  });
  vd.addEventListener('close', () => { try { recognition?.abort(); } catch { /* noop */ } recognition = null; $('#voice-mic').textContent = '🎤 話す'; });
  $('#voice-mic').addEventListener('click', startListening);
  $('#voice-form').addEventListener('submit', (e) => { e.preventDefault(); interpret($('#voice-input').value); });

  window.addEventListener('hashchange', render);
  startFx();
  render();
  document.body.dataset.ready = 'true';

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch((e) => {
  console.error(e);
  $('#app').innerHTML = '<div class="empty">起動に失敗しました。ページを再読み込みしてください。</div>';
});
