// 家計簿の画面（レシート読み取り・確認フォーム・月別集計）。app.js から createLedger(env) で組み込む。
import * as R from './core/receipt.js';
import { addDays, todayStr } from './core/model.js';
import { recognizeImage } from './core/ocr.js';

const yen = (n) => `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const dateLabel = (d) => { const [y, m, day] = d.split('-').map(Number); return `${m}/${day}(${WEEK[new Date(y, m - 1, day).getDay()]})`; };

export function createLedger(env) {
  const { state, $, esc, toast, guard, choose, confirmDialog, render, go } = env;
  const thisMonth = () => R.monthOf(todayStr());

  function ledgerQuery(q) {
    const month = R.isValidMonth(q.get('month')) ? q.get('month') : thisMonth();
    const cat = R.CATEGORIES.includes(q.get('cat')) ? q.get('cat') : null;
    return { month, cat };
  }
  const href = (month, cat) => `#/ledger?${new URLSearchParams({ month, ...(cat ? { cat } : {}) })}`;

  // ---------- 画面 ----------
  function view(q) {
    const { month, cat } = ledgerQuery(q);
    const sum = R.monthSummary(state.receipts, month);
    const list = R.receiptsInMonth(state.receipts, month).filter((r) => !cat || r.items.some((i) => i.category === cat));
    const cats = sum.categories.map((c) => `
      <a class="catrow" href="${href(month, cat === c.category ? null : c.category)}" ${cat === c.category ? 'aria-current="true"' : ''} style="--cc:${R.CATEGORY_COLORS[c.category]}">
        <span class="cat-name"><i class="swatch" aria-hidden="true"></i>${esc(c.category)}</span>
        <span class="cat-amt">${yen(c.amount)} <small>${c.percent}%</small></span>
        <span class="cat-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.percent))}%"></i></span>
      </a>`).join('');
    const rows = list.map((r) => {
      const badges = [...new Set(r.items.map((i) => i.category))].slice(0, 3).map((c) => `<span class="badge" style="--cc:${R.CATEGORY_COLORS[c]}"><i class="swatch" aria-hidden="true"></i>${esc(c)}</span>`).join('');
      return `<li class="rcp"><button type="button" class="rcp-main" data-action="ledger-open" data-id="${esc(r.id)}">
        <span class="rcp-date">${esc(dateLabel(r.date))}</span>
        <span class="rcp-body"><span class="title">${esc(r.store || '（店名なし）')}</span><span class="meta">${badges}<span class="muted">${r.items.length}品目</span></span></span>
        <span class="rcp-amt">${yen(R.amountInCategory(r, cat))}</span></button></li>`;
    }).join('');
    const isThis = month === thisMonth();
    return `<div class="page-head"><h1>家計簿</h1>
        <div class="btn-row"><button class="btn primary" type="button" data-action="ledger-scan">📷 レシートを読み取る</button>
          <button class="btn" type="button" data-action="ledger-new">＋ 手入力</button></div></div>
      <nav class="month-nav" aria-label="月の切り替え">
        <a class="btn" href="${href(R.shiftMonth(month, -1))}" aria-label="前の月">◀</a>
        <b>${esc(R.monthLabel(month))}</b>
        <a class="btn" href="${href(R.shiftMonth(month, 1))}" aria-label="次の月">▶</a>
        ${isThis ? '' : `<a class="btn small ghost" href="${href(thisMonth())}">今月へ</a>`}</nav>
      <section class="spend" aria-label="支出の合計"><span class="muted">${isThis ? '今月' : esc(R.monthLabel(month))}の支出</span>
        <b data-testid="month-total">${yen(sum.total)}</b><span class="muted">レシート${sum.count}件</span></section>
      ${sum.categories.length ? `<h2>分類別</h2><div class="cats">${cats}</div>` : ''}
      <h2>${cat ? `${esc(cat)}のレシート` : 'レシート'}${cat ? ` <a class="btn small ghost" href="${href(month)}">絞り込みを解除</a>` : ''}</h2>
      ${list.length ? `<ul class="tasks">${rows}</ul>` : `<div class="empty">${sum.count ? 'この分類のレシートはありません' : 'この月のレシートはまだありません。「レシートを読み取る」か「手入力」で追加できます。'}</div>`}
      ${sum.count ? `<div class="btn-row" style="margin-top:14px"><button class="btn" type="button" data-action="ledger-csv" data-month="${month}">${esc(R.monthLabel(month))}をCSVで書き出す</button></div>` : ''}`;
  }

  // ---------- 読み取りシート ----------
  function openScan() {
    const dlg = $('#scan-dialog');
    dlg.innerHTML = `<div class="sheet-head"><h2 id="scan-title">レシートを読み取る</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
      <p class="notice">写真の文字認識は<b>この端末の中だけ</b>で行います。画像は保存も送信もしません。読み取った内容は、保存前に必ず確認・修正できます。</p>
      <div class="form">
        <label class="btn primary big" for="scan-file" id="scan-file-label">📷 写真を撮る／選ぶ</label>
        <input id="scan-file" class="sr-only" type="file" accept="image/*">
        <div id="scan-progress" class="interp" hidden><span id="scan-msg">準備中…</span><div class="progress"><i id="scan-bar" style="width:0%"></i></div></div>
        <div id="scan-error" class="interp warn" hidden></div>
        <details class="examples"><summary>撮影のコツ</summary><ul>
          <li>レシートを平らに置き、真上から、文字が横向きになるように撮ります。</li>
          <li>明るい場所で、影や折れ目が文字にかからないようにします。</li>
          <li>長いレシートは、全体が入るよう縦長に撮ります。</li></ul></details>
        <details class="examples"><summary>写真から文字をコピーして貼り付ける（精度が高いことがあります）</summary>
          <p class="muted">iPadの写真アプリでレシートを開き、文字を長押ししてコピー（テキスト認識）→ ここに貼り付けます。</p>
          <textarea id="scan-paste" placeholder="ここにレシートの文字を貼り付け" aria-label="レシートのテキスト"></textarea>
          <div class="form-actions"><button type="button" class="btn" data-act="parse-text">このテキストを解析</button></div></details>
        <div class="form-actions"><button type="button" class="btn ghost" data-act="manual">手入力にする</button></div>
      </div>`;
    const setErr = (msg) => { const el = $('#scan-error', dlg); el.hidden = !msg; el.textContent = msg || ''; };
    const finish = (text, source) => {
      const parsed = R.parseReceiptText(text, { rules: state.rules });
      dlg.close();
      openForm({ parsed: { ...parsed, rawText: text, source } });
    };
    $('#scan-file', dlg).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setErr('');
      const prog = $('#scan-progress', dlg);
      prog.hidden = false;
      $('#scan-file-label', dlg).setAttribute('aria-disabled', 'true');
      try {
        const { text } = await recognizeImage(file, (msg, p) => { $('#scan-msg', dlg).textContent = msg; $('#scan-bar', dlg).style.width = `${Math.round(p * 100)}%`; });
        if (!dlg.open) return; // 途中で閉じられた
        finish(text, 'ocr');
      } catch (err) {
        console.error(err);
        prog.hidden = true;
        setErr(`読み取れませんでした：${err.message || err}。写真を撮り直すか、下の「テキストを貼り付け」「手入力」をお使いください。`);
      } finally { e.target.value = ''; $('#scan-file-label', dlg).removeAttribute('aria-disabled'); }
    };
    dlg.onclick = (e) => {
      if (e.target.closest('[data-close]')) return dlg.close();
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'parse-text') {
        const text = $('#scan-paste', dlg).value;
        if (!text.trim()) return setErr('テキストを貼り付けてください');
        finish(text, 'manual');
      } else if (act === 'manual') { dlg.close(); openForm({}); }
    };
    dlg.showModal();
  }

  // ---------- レシート確認・編集フォーム ----------
  const catOptions = (sel) => R.CATEGORIES.map((c) => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const rowHtml = (it = { name: '', amount: '', category: 'その他' }) => `<div class="rrow" data-row>
      <input class="r-name" type="text" autocomplete="off" aria-label="品名" placeholder="品名" value="${esc(it.name)}">
      <input class="r-amount" type="text" inputmode="numeric" autocomplete="off" aria-label="金額（円）" placeholder="金額" value="${esc(it.amount)}">
      <select class="r-cat" aria-label="分類">${catOptions(it.category)}</select>
      <button type="button" class="btn small ghost" data-rm aria-label="この行を削除">✕</button></div>`;

  function openForm({ receipt = null, parsed = null } = {}) {
    const dlg = $('#receipt-dialog');
    const base = receipt || parsed || { date: todayStr(), store: '', items: [], rawText: '', source: 'manual', warnings: [] };
    const items = base.items.length ? base.items : [{ name: '', amount: '', category: 'その他' }];
    const warnings = parsed?.warnings || [];
    dlg.innerHTML = `<div class="sheet-head"><h2 id="receipt-title">${receipt ? 'レシートを編集' : parsed ? '読み取り結果を確認' : 'レシートを手入力'}</h2><button type="button" class="btn ghost" data-close>閉じる</button></div>
      ${parsed ? '<p class="notice">文字認識は間違えることがあります。<b>日付・店名・品名・金額・分類</b>を確認し、直してから保存してください。</p>' : ''}
      ${warnings.map((w) => `<div class="interp warn">⚠️ ${esc(w)}</div>`).join('')}
      <form class="form" id="receipt-form" novalidate>
        <div class="two"><div class="field"><label for="rf-date">日付</label><input id="rf-date" type="date" value="${esc(base.date)}"></div>
          <div class="field"><label for="rf-store">店名</label><input id="rf-store" type="text" maxlength="60" autocomplete="off" value="${esc(base.store || '')}"></div></div>
        <div class="field"><span class="label">品目</span><div id="rf-rows" class="rrows">${items.map(rowHtml).join('')}</div>
          <button type="button" class="btn small" data-add-row>＋ 品目を追加</button></div>
        <div class="rtotal"><span>合計</span><b id="rf-total" data-testid="form-total">¥0</b>${parsed?.total != null && parsed.items.length ? `<span class="muted">レシート記載: ${yen(parsed.total)}</span>` : ''}</div>
        <div id="rf-errors" class="err" role="alert"></div>
        ${base.rawText ? `<details class="examples"><summary>読み取ったテキストを見る</summary><pre class="raw">${esc(base.rawText)}</pre></details>` : ''}
        <div class="form-actions">${receipt ? '<button type="button" class="btn danger" data-act="delete">削除</button>' : ''}<button type="submit" class="btn primary">保存</button></div>
      </form>`;
    const form = $('#receipt-form', dlg);
    const rowsEl = $('#rf-rows', dlg);
    const readRows = () => [...rowsEl.querySelectorAll('[data-row]')].map((row) => {
      const raw = row.querySelector('.r-amount').value.trim();
      const n = R.parseYen(raw === '' ? 'x' : raw);
      return { name: row.querySelector('.r-name').value, amount: Number.isNaN(n) ? raw : n, category: row.querySelector('.r-cat').value };
    });
    const updateTotal = () => {
      const t = readRows().reduce((a, i) => a + (typeof i.amount === 'number' ? i.amount : 0), 0);
      $('#rf-total', dlg).textContent = yen(t);
    };
    updateTotal();
    form.addEventListener('input', updateTotal);
    // 品名を直したら、まだ分類を手で変えていない行は分類も推測し直す
    rowsEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('r-cat')) e.target.dataset.manual = '1';
      if (e.target.classList.contains('r-name')) {
        const sel = e.target.closest('[data-row]').querySelector('.r-cat');
        if (!sel.dataset.manual) sel.value = R.categorize(e.target.value, { rules: state.rules, store: $('#rf-store', dlg).value });
      }
    });
    dlg.onclick = async (e) => {
      if (e.target.closest('[data-close]')) return dlg.close();
      if (e.target.closest('[data-add-row]')) { rowsEl.insertAdjacentHTML('beforeend', rowHtml()); rowsEl.lastElementChild.querySelector('.r-name').focus(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { if (rowsEl.children.length > 1) rm.closest('[data-row]').remove(); else rm.closest('[data-row]').querySelectorAll('input').forEach((i) => { i.value = ''; }); updateTotal(); return; }
      if (e.target.closest('[data-act="delete"]')) {
        if (await confirmDialog('このレシートを削除しますか？', `${receipt.store || '（店名なし）'}　${yen(receipt.total)}`, '削除する')) { dlg.close(); await removeReceipt(receipt); }
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = { date: $('#rf-date', dlg).value, store: $('#rf-store', dlg).value, items: readRows().filter((i) => i.name.trim() || String(i.amount).trim()), rawText: base.rawText || '', source: base.source || 'manual' };
      const res = receipt ? R.updateReceipt(receipt, input) : R.createReceipt(input);
      rowsEl.querySelectorAll('[data-row]').forEach((r) => r.classList.remove('bad'));
      if (!res.ok) {
        const msgs = Object.values(res.errors);
        $('#rf-errors', dlg).textContent = [...new Set(msgs)].join(' / ');
        const rowEls = [...rowsEl.querySelectorAll('[data-row]')];
        const filtered = readRows();
        // フィルタ後の行番号 → 画面上の行に対応づけ
        let k = 0;
        rowEls.forEach((el, i) => { const it = filtered[i]; if (it.name.trim() || String(it.amount).trim()) { if (Object.keys(res.errors).some((key) => key.startsWith(`item-${k}-`))) el.classList.add('bad'); k++; } });
        return;
      }
      await guard(async () => {
        await saveReceipt(res.receipt);
        await learnRules(res.receipt);
        dlg.close();
        const month = R.monthOf(res.receipt.date);
        go(href(month));
        toast(`${receipt ? '保存しました' : 'レシートを追加しました'}（${yen(res.receipt.total)}）`, receipt ? null : () => guard(() => removeReceipt(res.receipt, true)));
      });
    };
    dlg.showModal();
    if (!parsed && !receipt) $('.r-name', dlg).focus();
  }

  // ---------- 保存・学習 ----------
  async function saveReceipt(r) {
    const i = state.receipts.findIndex((x) => x.id === r.id);
    if (i >= 0) state.receipts[i] = r; else state.receipts.push(r);
    render();
    await state.repo.putReceipt(r);
  }
  async function removeReceipt(r, silent = false) {
    state.receipts = state.receipts.filter((x) => x.id !== r.id);
    render();
    await state.repo.deleteReceipt(r.id);
    if (!silent) toast('レシートを削除しました', () => guard(() => saveReceipt(r)));
  }
  /** ユーザーが直した分類を覚える（次回から同じ品名に使う） */
  async function learnRules(receipt) {
    const changed = [];
    for (const it of receipt.items) {
      if (R.categorize(it.name, { rules: state.rules, store: receipt.store }) !== it.category) changed.push(R.makeRule(it.name, it.category));
    }
    if (!changed.length) return;
    for (const r of changed) { const i = state.rules.findIndex((x) => x.id === r.id); if (i >= 0) state.rules[i] = r; else state.rules.push(r); }
    await state.repo.putRules(changed);
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onAction(el) {
    const { action, id } = el.dataset;
    switch (action) {
      case 'ledger-scan': openScan(); break;
      case 'ledger-new': openForm({}); break;
      case 'ledger-open': { const r = state.receipts.find((x) => x.id === id); if (r) openForm({ receipt: r }); break; }
      case 'ledger-csv': {
        const month = el.dataset.month;
        download(`kakeibo-${month}.csv`, R.toCsv(R.receiptsInMonth(state.receipts, month)), 'text/csv;charset=utf-8');
        toast('CSVを書き出しました'); break;
      }
      case 'ledger-reset-rules':
        if (await confirmDialog('学習した分類ルールをリセットしますか？', `${state.rules.length}件のルールを削除します。レシートの内容は変わりません。`, 'リセット')) {
          await guard(async () => { await state.repo.clearRules(); state.rules = []; render(); toast('分類ルールをリセットしました'); });
        }
        break;
      default: break;
    }
  }

  const homeCard = () => {
    const month = thisMonth();
    const s = R.monthSummary(state.receipts, month);
    const top = s.categories[0];
    return `<a class="card ledger-card" href="#/ledger" style="--pc:#c2a04a" data-testid="ledger-card">
      <div class="card-head"><div class="card-icon" aria-hidden="true">🧾</div><div><h3>家計簿</h3><span class="muted">${esc(R.monthLabel(month))}の支出</span></div></div>
      <div class="spend-line"><b>${yen(s.total)}</b><span class="muted">レシート${s.count}件${top ? `・最多は${esc(top.category)}` : ''}</span></div></a>`;
  };

  return { view, onAction, openScan, homeCard, ledgerQuery, href, thisMonth, addDays };
}
