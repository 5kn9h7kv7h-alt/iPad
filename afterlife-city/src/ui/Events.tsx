import { useMemo, useState } from 'react';
import { useGame, useWorld } from '../store/game';
import { CATEGORY_LABEL, SEASON_LABEL, type EventCategory, type SimEvent, type WorldState } from '../sim/types';
import { dateOf, formatDate } from '../sim/clock';
import { Chip, PanelShell, Section, nameOf, stamp } from './common';

export function EventsPanel() {
  const w = useWorld();
  const [cat, setCat] = useState<'all' | EventCategory>('all');
  const [minor, setMinor] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const select = useGame(s => s.selectCitizen);
  const setTab = useGame(s => s.setTab);
  const focusBuilding = useGame(s => s.focusBuilding);

  const list = useMemo(
    () => [...w.events].reverse().filter(e => (cat === 'all' || e.category === cat) && (minor || e.importance >= 12)).slice(0, 150),
    [w.events.length, cat, minor], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <PanelShell title="EVENTS" sub="街で起きた出来事の記録">
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>すべて</Chip>
        {(Object.keys(CATEGORY_LABEL) as EventCategory[]).map(k => <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{CATEGORY_LABEL[k]}</Chip>)}
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={minor} onChange={e => setMinor(e.target.checked)} />些細な出来事も表示</label>
      <ul className="space-y-1.5">
        {list.length === 0 && <li className="py-8 text-center text-sm text-slate-500">まだ記録された出来事がありません</li>}
        {list.map(e => (
          <li key={e.id} className="rounded-xl bg-white/5">
            <button className="w-full p-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="tabular-nums">{stamp(w, e.time)}</span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-slate-300">{CATEGORY_LABEL[e.category]}</span>
                {e.source === 'ai' && <span className="rounded-full bg-violet-400/20 px-1.5 py-0.5 text-violet-200">AI</span>}
                {e.source === 'player' && <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-amber-200">介入</span>}
              </div>
              <div className="mt-1 text-sm">{e.summary}</div>
            </button>
            {open === e.id && <Detail e={e} w={w} onPerson={id => { select(id); setTab('people'); }} onPlace={id => focusBuilding(id)} />}
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function Detail({ e, w, onPerson, onPlace }: { e: SimEvent; w: WorldState; onPerson: (id: string) => void; onPlace: (id: string) => void }) {
  const loc = e.locationId ? w.buildings[e.locationId] : null;
  return (
    <div className="fade-up border-t border-white/10 px-3 pb-3 pt-2 text-xs text-slate-300">
      <dl className="grid grid-cols-[4rem_1fr] gap-y-1">
        <dt className="text-slate-500">発生日時</dt><dd>{formatDate(w.startDate, e.time)} {stamp(w, e.time).split(' ')[1]}</dd>
        <dt className="text-slate-500">場所</dt><dd>{loc ? <button className="underline decoration-dotted" onClick={() => onPlace(loc.id)}>{loc.name}</button> : '—'}</dd>
        <dt className="text-slate-500">関係者</dt><dd>{e.people.length ? e.people.map(id => <button key={id} className="mr-2 underline decoration-dotted" onClick={() => onPerson(id)}>{nameOf(w, id)}</button>) : '—'}</dd>
        <dt className="text-slate-500">原因</dt><dd>{e.cause || '—'}</dd>
        <dt className="text-slate-500">結果</dt><dd>{e.result || '—'}</dd>
        {e.related.length > 0 && <><dt className="text-slate-500">関連</dt><dd>{e.related.map(id => w.events.find(x => x.id === id)?.summary).filter(Boolean).join(' / ')}</dd></>}
      </dl>
      {e.dialogue && (
        <div className="mt-3 space-y-1 rounded-lg bg-black/25 p-2">
          {e.dialogue.map((l, i) => <p key={i}><b className="text-slate-400">{nameOf(w, l.speakerId).split(' ')[0]}</b>「{l.text}」</p>)}
        </div>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const w = useWorld();
  const focusBuilding = useGame(s => s.focusBuilding);
  const entries = useMemo(() => [...w.events].filter(e => e.historic).reverse(), [w.events.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const m = new Map<string, SimEvent[]>();
    for (const e of entries) {
      const d = dateOf(w.startDate, e.time);
      const key = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(e);
    }
    return [...m.entries()];
  }, [entries, w.startDate]);
  const pop = Object.values(w.citizens).filter(c => c.movedOutAt === undefined).length;
  const bld = Object.values(w.buildings).filter(b => b.status === 'open').length;
  const gone = Object.values(w.citizens).filter(c => c.movedOutAt !== undefined);
  const lost = Object.values(w.buildings).filter(b => b.status === 'closed' || b.status === 'demolished');
  const friends = Object.values(w.relationships).filter(r => r.kind === 'friend').length;
  return (
    <PanelShell title="HISTORY" sub="街がどう変わってきたか">
      <div className="mb-5 grid grid-cols-4 gap-2 text-center">
        {[['人口', pop], ['営業中の建物', bld], ['友人の絆', friends], ['季節', SEASON_LABEL[w.env.season]]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl bg-white/5 p-2"><div className="text-base font-semibold tabular-nums">{v}</div><div className="text-[10px] text-slate-400">{l}</div></div>
        ))}
      </div>
      {(gone.length > 0 || lost.length > 0) && (
        <Section title="CITY MEMORY — かつての街">
          <ul className="space-y-1 text-sm text-slate-300">
            {lost.map(b => <li key={b.id}><button className="underline decoration-dotted" onClick={() => focusBuilding(b.id)}>{b.name}</button>　<span className="text-slate-500">{b.status === 'demolished' ? '取り壊された' : '閉店'}</span></li>)}
            {gone.map(c => <li key={c.id}>{c.name}　<span className="text-slate-500">{c.occupation} · 街を去った</span></li>)}
          </ul>
        </Section>
      )}
      {groups.length === 0 && <p className="py-8 text-center text-sm text-slate-500">街の歴史はこれから刻まれていきます。</p>}
      {groups.map(([month, evs]) => (
        <Section key={month} title={month}>
          <ol className="relative ml-1.5 border-l border-white/15 pl-4">
            {evs.map(e => (
              <li key={e.id} className="relative mb-3">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-amber-300" />
                <div className="text-[11px] text-slate-500">{stamp(w, e.time)} · {CATEGORY_LABEL[e.category]}</div>
                <div className="text-sm">{e.summary}</div>
                {e.result && <div className="text-xs text-slate-400">{e.result}</div>}
              </li>
            ))}
          </ol>
        </Section>
      ))}
    </PanelShell>
  );
}
