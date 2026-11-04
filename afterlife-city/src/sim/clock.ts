import { MINUTES_PER_DAY, type Season } from './types';

export const dayOf = (t: number) => Math.floor(t / MINUTES_PER_DAY);
export const minuteOfDay = (t: number) => ((t % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const hourOf = (t: number) => minuteOfDay(t) / 60;
export const hm = (h: number, m = 0) => h * 60 + m;

export function dateOf(startDate: string, t: number): Date {
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dayOf(t));
  return d;
}
export function seasonOf(startDate: string, t: number): Season {
  const m = dateOf(startDate, t).getUTCMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function formatDate(startDate: string, t: number): string {
  const d = dateOf(startDate, t);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]})`;
}
export function formatTime(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function isWeekend(startDate: string, t: number): boolean {
  const wd = dateOf(startDate, t).getUTCDay();
  return wd === 0 || wd === 6;
}
export function formatStamp(startDate: string, t: number): string {
  const d = dateOf(startDate, t);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${formatTime(t)}`;
}
