// iCalendar (.ics) の最小パーサ。端末内で読むだけで、外部へは送らない。
// 対応: VEVENT の SUMMARY / DTSTART / UID / LOCATION / STATUS / RRULE(有無のみ)。
// 制限: 繰り返し予定は初回のみ。TZID付きの時刻は、その壁時計の時刻を端末のローカル時刻として扱う。

export interface IcsEvent { uid: string; summary: string; start: Date; allDay: boolean; location?: string; recurring: boolean }

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** `NAME;PARAM=V:VALUE` を名前と値に分ける（引用符の中の `:` は区切りにしない）。 */
function splitProp(line: string): { name: string; params: string; value: string } | null {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) {
      const head = line.slice(0, i);
      const semi = head.indexOf(';');
      return { name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(), params: semi < 0 ? '' : head.slice(semi + 1).toUpperCase(), value: line.slice(i + 1) };
    }
  }
  return null;
}

export function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = m[7] ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? null : { date, allDay: m[4] === undefined };
}

export function parseIcs(text: string): { events: IcsEvent[]; invalid: number } {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('カレンダーファイル（.ics）として読み込めませんでした');
  // 行の折り返し（次行が空白で始まる）を戻す
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: IcsEvent[] = [];
  let invalid = 0;
  let cur: Partial<IcsEvent> & { cancelled?: boolean } | null = null;
  let depth = 0; // VEVENT 内の VALARM などを読み飛ばす
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = { recurring: false }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }
    if (/^END:VEVENT$/i.test(line)) {
      if (!cur.cancelled) {
        if (cur.start && cur.summary) events.push({ uid: cur.uid ?? '', summary: cur.summary, start: cur.start, allDay: !!cur.allDay, location: cur.location, recurring: !!cur.recurring });
        else invalid++;
      }
      cur = null; continue;
    }
    if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    const p = splitProp(line);
    if (!p) continue;
    if (p.name === 'SUMMARY') cur.summary = unescape(p.value).slice(0, 200);
    else if (p.name === 'UID') cur.uid = p.value.trim();
    else if (p.name === 'LOCATION') cur.location = unescape(p.value).slice(0, 100) || undefined;
    else if (p.name === 'RRULE') cur.recurring = true;
    else if (p.name === 'STATUS') cur.cancelled = /CANCELLED/i.test(p.value);
    else if (p.name === 'DTSTART') { const d = parseIcsDate(p.value); if (d) { cur.start = d.date; cur.allDay = d.allDay; } }
  }
  return { events, invalid };
}
