// 学習記録のCSV。端末内で読むだけで、外部へは送らない。
// 見出し行があれば列名で判定（日付 / 内容・科目 / 分）。なければ「日付, 内容, 分」の順とみなす。

export interface StudyRow { date: Date; text: string; minutes?: number }

/** RFC 4180 相当の簡易CSVパーサ（引用符・引用符内の改行とカンマに対応）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const s = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x.length));
}

export function parseDateLoose(v: string): Date | null {
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2}))?/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '12', m[5] ?? '0'].map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

const DATE_COL = /^(date|日付|日時|学習日|day)$/i;
const TEXT_COL = /^(content|内容|科目|subject|title|タイトル|memo|メモ|教材|text)$/i;
const MIN_COL = /^(minutes|mins|min|分|時間\(分\)|学習時間|duration)$/i;

export function parseStudyCsv(text: string): { rows: StudyRow[]; invalid: number } {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error('学習記録のCSVとして読み込めませんでした（空のファイルです）');
  let dateIdx = 0, textIdx: number[] = [1], minIdx = 2, body = table;
  const header = table[0];
  if (header.some((h) => DATE_COL.test(h))) {
    dateIdx = header.findIndex((h) => DATE_COL.test(h));
    textIdx = header.map((h, i) => (TEXT_COL.test(h) ? i : -1)).filter((i) => i >= 0);
    minIdx = header.findIndex((h) => MIN_COL.test(h));
    if (textIdx.length === 0) throw new Error('内容の列（内容・科目・メモなど）が見つかりません');
    body = table.slice(1);
  }
  const rows: StudyRow[] = [];
  let invalid = 0;
  for (const r of body) {
    const date = parseDateLoose(r[dateIdx] ?? '');
    const t = textIdx.map((i) => r[i] ?? '').filter(Boolean).join(' / ');
    if (!date || !t) { invalid++; continue; }
    const minutes = minIdx >= 0 ? Number(r[minIdx]) : NaN;
    rows.push({ date, text: t.slice(0, 200), minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : undefined });
  }
  return { rows, invalid };
}
