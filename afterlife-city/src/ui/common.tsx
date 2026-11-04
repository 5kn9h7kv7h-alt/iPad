import type { ReactNode } from 'react';
import { MOOD_LABEL, type Citizen, type WorldState } from '../sim/types';
import { formatStamp } from '../sim/clock';
import { describeNow } from '../sim/behavior';

const SKIN = ['#f1c9a5', '#e0ac82', '#c68b5f', '#8d5a3b'];
const HAIR = ['#2a211c', '#4a3426', '#7a5230', '#b88a4a', '#8c8c92', '#c0452d'];
const TOP = ['#d65a4f', '#e0a64a', '#5b8fd1', '#4fa08a', '#8c6bb5', '#e8e2d6', '#3f4a5c', '#c46f9a', '#7aa84c', '#d98c3a'];

export function Avatar({ c, size = 40 }: { c: Citizen; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 rounded-full bg-slate-700/60">
      <path d="M6 40c0-9 6-13 14-13s14 4 14 13z" fill={TOP[c.look.top]} />
      <circle cx="20" cy="17" r="8.5" fill={SKIN[c.look.skin]} />
      <path d="M11 16c0-7 4-10 9-10s9 3 9 10c-2-3-5-4-9-4s-7 1-9 4z" fill={HAIR[c.look.hair]} />
    </svg>
  );
}

export const MOOD_COLOR: Record<string, string> = {
  cheerful: 'bg-amber-400/20 text-amber-200', content: 'bg-emerald-400/20 text-emerald-200', calm: 'bg-sky-400/20 text-sky-200',
  tired: 'bg-slate-400/20 text-slate-300', lonely: 'bg-indigo-400/25 text-indigo-200', irritated: 'bg-rose-400/25 text-rose-200',
};

export function MoodChip({ c }: { c: Citizen }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${MOOD_COLOR[c.currentMood]}`}>{MOOD_LABEL[c.currentMood]}</span>;
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${active ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h3>{right}</div>
      {children}
    </section>
  );
}

export function Bar({ label, value, tone = 'bg-sky-400' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex justify-between text-[11px] text-slate-400"><span>{label}</span><span>{Math.round(value)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

export function PanelShell({ title, onClose, children, sub }: { title: string; onClose?: () => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="safe-t flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3 pt-4">
        <div><h2 className="text-base font-semibold tracking-wide">{title}</h2>{sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}</div>
        {onClose && <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20">閉じる</button>}
      </header>
      <div className="scroll-y min-h-0 flex-1 px-4 py-4">{children}</div>
    </div>
  );
}

export const stamp = (w: WorldState, t: number) => formatStamp(w.startDate, t);
export const whereNow = (w: WorldState, c: Citizen) => (c.movedOutAt !== undefined ? '街を去った' : describeNow(w, c));
export const nameOf = (w: WorldState, id: string) => w.citizens[id]?.name ?? '（不明）';
