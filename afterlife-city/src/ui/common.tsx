import type { ReactNode } from 'react';
import { MOOD_LABEL, type Citizen, type WorldState } from '../sim/types';
import { formatStamp } from '../sim/clock';
import { describeNow } from '../sim/behavior';

const SKIN = ['#efc9a6', '#dcae86', '#c18c63', '#8d5d3f'];
const HAIR = ['#2a211c', '#4a3426', '#6f4e33', '#a8844e', '#9a9aa0', '#8f4430'];
const TOP = ['#a95a4c', '#c79a52', '#5f8296', '#5b8a78', '#7d6a92', '#e2dacb', '#3f4a5c', '#a87482', '#7b8f52', '#b98144'];

/** Small square portrait (head and shoulders), in the same colours as the 3D figure. */
export function Avatar({ c, size = 40 }: { c: Citizen; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" style={{ background: '#2a2620', border: '1px solid var(--rule)' }}>
      <path d="M7 40c0-9 6-13 13-13s13 4 13 13z" fill={TOP[c.look.top]} />
      <rect x="17.5" y="22" width="5" height="5" fill={SKIN[c.look.skin]} />
      <ellipse cx="20" cy="16.5" rx="7.5" ry="8.5" fill={SKIN[c.look.skin]} />
      <path d="M12 15c0-6.5 3.6-9.5 8-9.5s8 3 8 9.5c-1.8-2.6-4.4-3.6-8-3.6s-6.2 1-8 3.6z" fill={c.age > 62 ? HAIR[4] : HAIR[c.look.hair]} />
    </svg>
  );
}

export function MoodText({ c }: { c: Citizen }) {
  return <span className="lbl">{MOOD_LABEL[c.currentMood]}</span>;
}
/** kept for older imports */
export const MoodChip = MoodText;

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={active ? true : undefined} className={`btn ${active ? 'on' : ''}`}>{children}</button>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between border-b pb-1" style={{ borderColor: 'var(--rule)' }}>
        <h3 className="serif text-[13px]" style={{ color: 'var(--paper2)' }}>{title}</h3>{right}
      </div>
      {children}
    </section>
  );
}

export function Bar({ label, value }: { label: string; value: number; tone?: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[11px]" style={{ color: 'var(--muted)' }}><span>{label}</span><span className="num">{Math.round(value)}</span></div>
      <div className="h-px" style={{ background: 'var(--rule)' }}><div className="h-px" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: 'var(--paper2)', height: 2, marginTop: -0.5 }} /></div>
    </div>
  );
}

export function PanelShell({ title, onClose, children, sub }: { title: string; onClose?: () => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-end justify-between border-b px-4 pb-3 pt-4" style={{ borderColor: 'var(--rule)' }}>
        <div><h2 className="serif text-lg leading-none">{title}</h2>{sub && <div className="lbl mt-1.5">{sub}</div>}</div>
        {onClose && <button onClick={onClose} className="btn">戻る</button>}
      </header>
      <div className="scroll-y min-h-0 flex-1 px-4 py-4">{children}</div>
    </div>
  );
}

export const stamp = (w: WorldState, t: number) => formatStamp(w.startDate, t);
export const whereNow = (w: WorldState, c: Citizen) => (c.movedOutAt !== undefined ? '街を去った' : describeNow(w, c));
export const nameOf = (w: WorldState, id: string) => w.citizens[id]?.name ?? '（不明）';
