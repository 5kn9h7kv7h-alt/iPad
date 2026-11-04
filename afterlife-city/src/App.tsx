import { useEffect, useState } from 'react';
import { CityCanvas } from './render/Scene';
import { detectTier } from './render/quality';
import { newGame, sim, useGame } from './store/game';
import { step, catchUp } from './sim/engine';
import { loadGame, saveGame } from './store/persist';
import { fetchStatus } from './ai/client';
import { enrichDialogue, requestEventProposals } from './ai/service';
import { CityOverlay, TopBar } from './ui/City';
import { PeoplePanel } from './ui/People';
import { EventsPanel, HistoryPanel } from './ui/Events';
import { SettingsPanel } from './ui/Settings';
import { DigestModal, DocumentaryModal, Toast } from './ui/Modals';

const TABS: { id: 'city' | 'people' | 'events' | 'history' | 'settings'; label: string; icon: string }[] = [
  { id: 'city', label: 'CITY', icon: '◎' }, { id: 'people', label: 'PEOPLE', icon: '☺' }, { id: 'events', label: 'EVENTS', icon: '✦' },
  { id: 'history', label: 'HISTORY', icon: '❖' }, { id: 'settings', label: 'SETTINGS', icon: '⚙' },
];

function useDesktop() {
  const [d, setD] = useState(() => matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const m = matchMedia('(min-width: 768px)');
    const f = () => setD(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return d;
}

/** Time keeper: 1 real second = 1 sim minute (× speed). Also autosave + AI scheduling. */
function SimDriver() {
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0, ui = 0, saveT = 0, enrichT = 0;
    let aiBusy = false, lastAiAt = sim.world.time, hiddenAt = 0;
    const enriched = new Set<string>();
    const g = useGame;

    const persist = () => { const s = g.getState(); if (s.ready) void saveGame({ world: sim.world, savedAtMs: Date.now(), speed: s.speed, aiEnabled: s.aiEnabled }); };

    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const s = g.getState();
      if (s.ready && s.speed > 0) {
        acc += dt * s.speed;
        const n = Math.min(Math.floor(acc), 120);
        acc -= Math.floor(acc);
        for (let i = 0; i < n; i++) step(sim.world);
      }
      ui += dt; saveT += dt; enrichT += dt;
      if (ui > 0.5) { ui = 0; s.touch(); }
      if (saveT > 20) { saveT = 0; persist(); }
      const aiOn = s.ready && s.aiEnabled && s.aiStatus.enabled;
      if (aiOn && !aiBusy && sim.world.time - lastAiAt >= 360) {
        aiBusy = true; lastAiAt = sim.world.time;
        requestEventProposals(sim.world).then(l => g.getState().pushAiLog(l)).finally(() => { aiBusy = false; });
      }
      if (aiOn && !aiBusy && enrichT > 25) {
        enrichT = 0;
        const ev = [...sim.world.events].reverse().find(e => e.dialogue && e.importance >= 30 && !enriched.has(e.id));
        if (ev) { enriched.add(ev.id); aiBusy = true; enrichDialogue(sim.world, ev).finally(() => { aiBusy = false; }); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); persist(); return; }
      const st = g.getState();
      if (hiddenAt && st.speed > 0) {
        const mins = ((Date.now() - hiddenAt) / 1000) * st.speed;
        if (mins >= 30) {
          const r = catchUp(sim.world, mins);
          if (r.digest.length) st.setDigest({ simulated: r.simulated, days: r.days, events: r.digest });
        } else for (let i = 0; i < Math.floor(mins); i++) step(sim.world);
      }
      hiddenAt = 0; last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', persist);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', persist); };
  }, []);
  return null;
}

function Boot() {
  useEffect(() => {
    let live = true;
    (async () => {
      const [rec, status] = await Promise.all([loadGame(), fetchStatus()]);
      if (!live) return;
      useGame.getState().setAi({ aiStatus: status, aiEnabled: rec?.aiEnabled ?? true });
      if (rec) {
        const away = rec.speed > 0 ? (Date.now() - rec.savedAtMs) / 1000 : 0; // 1 real sec = 1 sim minute
        useGame.getState().replaceWorld(rec.world, away);
        useGame.getState().setSpeed((rec.speed as 0 | 1 | 2 | 5 | 10) || 1);
      } else newGame();
    })();
    return () => { live = false; };
  }, []);
  return null;
}

export default function App() {
  const ready = useGame(s => s.ready);
  const tab = useGame(s => s.tab);
  const setTab = useGame(s => s.setTab);
  const desktop = useDesktop();
  const tier = useGame(s => s.quality);
  const panelOpen = tab !== 'city';
  const frameloop = !ready || (!desktop && panelOpen) ? 'never' : 'always';

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Boot />
      {ready && <SimDriver />}
      <div className="absolute inset-0">{ready && <CityCanvas frameloop={frameloop} tier={tier} />}</div>
      {!ready && <div className="absolute inset-0 grid place-items-center text-sm tracking-[0.3em] text-slate-400">LUMIÈRE BAY</div>}

      {ready && <TopBar />}
      {ready && tab === 'city' && <CityOverlay />}

      {ready && panelOpen && (
        <aside className="glass-solid absolute inset-x-0 bottom-[64px] top-0 z-20 md:inset-x-auto md:right-0 md:top-0 md:w-[440px] md:rounded-l-3xl" style={{ paddingTop: desktop ? 0 : 0 }}>
          <div className="h-full pt-[68px] md:pt-[76px]">
            {tab === 'people' && <PeoplePanel />}
            {tab === 'events' && <EventsPanel />}
            {tab === 'history' && <HistoryPanel />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </aside>
      )}

      <nav className="glass-solid safe-b absolute inset-x-0 bottom-0 z-30 border-x-0 border-b-0" aria-label="メインナビゲーション">
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map(t => (
            <li key={t.id}>
              <button onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[10px] tracking-widest transition ${tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <span className="text-lg leading-none">{t.icon}</span>{t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {ready && <DigestModal />}
      {ready && <DocumentaryModal />}
      <Toast />
    </div>
  );
}
