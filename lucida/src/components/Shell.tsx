import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useLucida } from '../store';

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ITEMS = [
  { to: '/', label: 'Home', ja: 'ホーム', icon: I('M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z') },
  { to: '/explore', label: 'Explore', ja: '探索', icon: I('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4') },
  { to: '/network', label: 'Network', ja: '関連', icon: I('M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 6l8 3M7 18l1-9m9 1l-8 7') },
  { to: '/lab', label: 'Lab', ja: '実験', icon: I('M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3') },
  { to: '/archive', label: 'Archive', ja: '記録', icon: I('M4 5h16v4H4zM6 9v10h12V9M10 13h4') },
];

export function Shell({ children }: { children: ReactNode }) {
  const { toast } = useLucida();
  return (
    <div className="shell">
      <nav className="nav" aria-label="メインナビゲーション">
        <div className="nav-brand"><span className="wordmark">LUCIDA</span><span className="tagline">Personal Discovery Intelligence</span></div>
        <ul>
          {ITEMS.map((it) => (
            <li key={it.to}>
              <NavLink to={it.to} end={it.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {it.icon}<span className="nav-label">{it.label}</span><span className="nav-ja">{it.ja}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main">{children}</main>
      <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
    </div>
  );
}
