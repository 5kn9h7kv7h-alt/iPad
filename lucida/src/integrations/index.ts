import { hashText } from '../domain/util';
import { parseIcs } from './ics';
import { parseStudyCsv } from './study';

/**
 * 外部サービス連携の共通の形。
 * いまは「ユーザーが選んだファイルを端末内で読む」連携だけを実装している（外部通信なし）。
 * 将来 API 連携（Google カレンダー等）を足す場合は、同じ Integration を実装し、kind を 'remote' にして
 * 取得処理を足す。どの連携も、設定で明示的に許可するまで使えない（store 側で確認している）。
 */
export interface ImportItem { externalId: string; occurredAt: string; text: string }
export interface ParseResult { items: ImportItem[]; skipped: number; remarks: string[] }

export type IntegrationId = 'calendar' | 'study';
export interface Integration {
  id: IntegrationId;
  name: string;
  description: string;
  /** 許可する前に必ず見せる説明（何を読み、どこに保存し、何を送らないか） */
  disclosure: string;
  kind: 'file';
  accept: string;
  parse(text: string, now: Date): ParseResult;
}

const DAY = 86400000;
export const CALENDAR_WINDOW_DAYS = 90;
const MAX_ITEMS = 500;

export const INTEGRATIONS: Integration[] = [
  {
    id: 'calendar', name: 'カレンダー（.ics ファイル）', kind: 'file', accept: '.ics,text/calendar',
    description: 'カレンダーアプリから書き出した .ics ファイルを読み込み、過去の予定を「日常の記録」に加えます。',
    disclosure: `読み取るのは予定の件名・開始日時・場所だけです。過去${CALENDAR_WINDOW_DAYS}日分を、この端末の中に保存します。ファイルや予定の内容を外部へ送信することはありません。`,
    parse(text, now) {
      const { events, invalid } = parseIcs(text);
      const from = now.getTime() - CALENDAR_WINDOW_DAYS * DAY;
      const inRange = events.filter((e) => e.start.getTime() <= now.getTime() && e.start.getTime() >= from)
        .sort((a, b) => b.start.getTime() - a.start.getTime());
      const items = inRange.slice(0, MAX_ITEMS).map((e) => ({
        externalId: `cal:${hashText(`${e.uid}|${e.summary}|${e.start.toISOString()}`)}`,
        occurredAt: e.start.toISOString(),
        text: `予定: ${e.summary}${e.location ? `（${e.location}）` : ''}`,
      }));
      const remarks: string[] = [];
      const out = events.length - inRange.length;
      if (out > 0) remarks.push(`これからの予定と${CALENDAR_WINDOW_DAYS}日より前の予定（${out}件）は取り込みません。`);
      if (events.some((e) => e.recurring)) remarks.push('繰り返しの予定は、初回だけを取り込みます。');
      return { items, skipped: invalid + Math.max(0, inRange.length - MAX_ITEMS), remarks };
    },
  },
  {
    id: 'study', name: '学習記録（CSV ファイル）', kind: 'file', accept: '.csv,.tsv,text/csv',
    description: '学習アプリや表計算から書き出した CSV（日付, 内容, 分）を読み込み、「日常の記録」に加えます。',
    disclosure: '読み取るのは日付・内容・学習時間（分）だけです。この端末の中に保存し、外部へ送信することはありません。',
    parse(text, now) {
      const { rows, invalid } = parseStudyCsv(text);
      const past = rows.filter((r) => r.date.getTime() <= now.getTime() + DAY).sort((a, b) => b.date.getTime() - a.date.getTime());
      const items = past.slice(0, MAX_ITEMS).map((r) => ({
        externalId: `study:${hashText(`${r.date.toISOString()}|${r.text}|${r.minutes ?? ''}`)}`,
        occurredAt: r.date.toISOString(),
        text: `学習: ${r.text}${r.minutes ? `（${r.minutes}分）` : ''}`,
      }));
      return { items, skipped: invalid + (rows.length - past.length) + Math.max(0, past.length - MAX_ITEMS), remarks: [] };
    },
  },
];

export const getIntegration = (id: string) => INTEGRATIONS.find((i) => i.id === id);
