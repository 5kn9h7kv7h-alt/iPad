import { useMemo, useState } from 'react';
import { sim, useGame, useWorld, type Speed } from '../store/game';
import { formatDate, formatTime } from '../sim/clock';
import { interestingCitizen } from '../render/director';
import { ACTIVITY_LABEL, AREA_LABEL, KIND_LABEL, SEASON_LABEL, WEATHER_LABEL, type Building } from '../sim/types';
import { holdFestival, placeProp, proposeShop, PROP_LABEL, type PropKind } from '../sim/interventions';
import { Avatar, Bar, Chip, MoodChip, stamp, whereNow } from './common';
import { isOutdoor } from '../sim/paths';
import { relationsOf } from '../sim/social';

const WEATHER_ICON = { clear: '☀', cloudy: '☁', rain: '☂', fog: '〰' } as const;

export function TopBar() {
  const w = useWorld();
  const speed = useGame(s => s.speed);
  const setSpeed = useGame(s => s.setSpeed);
  const speeds: [Speed, string][] = [[0, '⏸'], [1, '1×'], [2, '2×'], [5, '5×'], [10, '10×']];
  return (
    <div className="safe-t pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
      <div className="glass pointer-events-auto mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-4 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-[0.2em]">LUMIÈRE BAY</div>
          <div className="text-[11px] text-slate-400">AFTERLIFE CITY</div>
        </div>
        <div className="flex items-center gap-3 text-sm" data-testid="clock">
          <span className="hidden text-slate-300 sm:inline">{formatDate(w.startDate, w.time)}</span>
          <span className="text-lg font-light tabular-nums">{formatTime(w.time)}</span>
          <span className="text-slate-300">{WEATHER_ICON[w.env.weather]} {WEATHER_LABEL[w.env.weather]}</span>
          <span className="text-slate-300">{w.env.temperature.toFixed(0)}°C</span>
          <span className="hidden text-slate-400 md:inline">{SEASON_LABEL[w.env.season]}</span>
        </div>
        <div className="flex gap-1" role="group" aria-label="時間操作">
          {speeds.map(([v, l]) => (
            <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v}
              className={`h-8 min-w-9 rounded-lg px-2 text-xs ${speed === v ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CityOverlay() {
  const w = useWorld();
  const mode = useGame(s => s.cameraMode);
  const setMode = useGame(s => s.setCameraMode);
  const shot = useGame(s => s.shotLabel);
  const spotlight = useGame(s => s.spotlight);
  const setSpotlight = useGame(s => s.setSpotlight);
  const openDoc = useGame(s => s.openDocumentary);
  const selectedC = useGame(s => s.selectedCitizen);
  const selectedB = useGame(s => s.selectedBuilding);
  const setTab = useGame(s => s.setTab);
  const selectCitizen = useGame(s => s.selectCitizen);
  const [sheet, setSheet] = useState(false);
  const [showEvents, setShowEvents] = useState(true);

  const today = useMemo(() => [...w.events].reverse().filter(e => e.importance >= 12).slice(0, 5), [w.events.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const feat = spotlight ? w.citizens[spotlight] : null;

  return (
    <>
      {/* camera status + spotlight */}
      <div className="pointer-events-none absolute inset-x-3 top-[104px] z-10 flex flex-col items-start gap-2 sm:top-[76px] sm:flex-row sm:justify-between">
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1 text-xs">
          <span className={`ml-2 mr-1 inline-block h-2 w-2 rounded-full ${mode === 'manual' ? 'bg-amber-400' : 'animate-pulse bg-rose-500'}`} />
          <span className="pr-2 text-slate-300" data-testid="shot-label">{mode === 'manual' ? 'Manual' : shot}</span>
          <Chip active={mode === 'auto'} onClick={() => setMode('auto')}>AUTO</Chip>
          <Chip active={mode === 'follow'} onClick={() => { if (!spotlight) { const id = interestingCitizen(w); if (id) setSpotlight(id); } setMode('follow'); }}>追跡</Chip>
        </div>
        <div className="glass fade-up pointer-events-auto w-[min(260px,calc(100vw-1.5rem))] rounded-2xl p-3">
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">気になる住人</div>
          {feat ? (
            <>
              <div className="flex items-center gap-2">
                <Avatar c={feat} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{feat.name}</div><div className="truncate text-[11px] text-slate-400">{whereNow(w, feat)}</div></div>
                <MoodChip c={feat} />
              </div>
              <div className="mt-2 flex gap-1.5">
                <Chip active={mode === 'follow'} onClick={() => setMode('follow')}>追跡</Chip>
                <Chip onClick={() => { selectCitizen(feat.id); setTab('people'); }}>詳細</Chip>
                <Chip onClick={() => openDoc(feat.id)}>人生</Chip>
                <Chip onClick={() => { setSpotlight(null); setMode('auto'); }}>解除</Chip>
              </div>
            </>
          ) : (
            <button className="w-full rounded-xl bg-white/10 py-2 text-xs hover:bg-white/20" onClick={() => { const id = interestingCitizen(w); if (id) setSpotlight(id); }}>
              今、気になる人を見つける
            </button>
          )}
        </div>
      </div>

      {/* info card for picks */}
      {selectedC && <CitizenQuick id={selectedC} />}
      {selectedB && <BuildingQuick id={selectedB} />}

      {/* today's events */}
      {!selectedC && !selectedB && (
        <div className="absolute bottom-[78px] left-3 z-10 w-[min(340px,calc(100vw-5.5rem))]">
          <div className="glass fade-up rounded-2xl p-3">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setShowEvents(v => !v)}>
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">今日の出来事</span>
              <span className="text-xs text-slate-400">{showEvents ? '−' : '＋'}</span>
            </button>
            {showEvents && (
              <ul className="mt-2 space-y-1.5">
                {today.length === 0 && <li className="text-xs text-slate-500">まだ静かな朝です。</li>}
                {today.slice(0, 4).map(e => (
                  <li key={e.id} className="text-xs leading-snug text-slate-200">
                    <span className="mr-1.5 tabular-nums text-slate-500">{stamp(w, e.time).split(' ')[1]}</span>{e.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <button onClick={() => setSheet(true)} aria-label="街に介入する"
        className="glass absolute bottom-[78px] right-3 z-10 rounded-full px-4 py-3 text-sm hover:bg-white/20">＋ 介入</button>
      {sheet && <InterventionSheet onClose={() => setSheet(false)} />}
    </>
  );
}

function CitizenQuick({ id }: { id: string }) {
  const w = useWorld();
  const c = w.citizens[id];
  const setSpotlight = useGame(s => s.setSpotlight);
  const setMode = useGame(s => s.setCameraMode);
  const setTab = useGame(s => s.setTab);
  const select = useGame(s => s.selectCitizen);
  const openDoc = useGame(s => s.openDocumentary);
  if (!c) return null;
  const friends = relationsOf(w, c.id).filter(r => r.kind === 'friend' || r.kind === 'family').length;
  return (
    <div className="glass-solid fade-up absolute inset-x-3 bottom-[78px] z-10 mx-auto max-w-md rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <Avatar c={c} size={48} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{c.name} <span className="text-xs text-slate-400">{c.age}歳 · {c.occupation}</span></div>
          <div className="truncate text-xs text-slate-400">{whereNow(w, c)}</div>
        </div>
        <MoodChip c={c} />
      </div>
      <div className="mt-2 text-xs text-slate-300">目標：{c.currentGoal}　<span className="text-slate-500">親しい人 {friends}人</span></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active onClick={() => { setSpotlight(c.id); setMode('follow'); }}>この人を追う</Chip>
        <Chip onClick={() => { select(c.id); setTab('people'); }}>プロフィール</Chip>
        <Chip onClick={() => openDoc(c.id)}>人生を振り返る</Chip>
        <Chip onClick={() => select(null)}>閉じる</Chip>
      </div>
    </div>
  );
}

function BuildingQuick({ id }: { id: string }) {
  const w = useWorld();
  const b = w.buildings[id];
  const select = useGame(s => s.selectBuilding);
  const selectC = useGame(s => s.selectCitizen);
  const setTab = useGame(s => s.setTab);
  if (!b) return null;
  const here = Object.values(w.citizens).filter(c => c.currentLocation === b.id && c.movedOutAt === undefined && (c.plan?.arrived ?? false));
  const staff = Object.values(w.citizens).filter(c => c.workplaceId === b.id && c.movedOutAt === undefined);
  const residents = Object.values(w.citizens).filter(c => c.homeId === b.id && c.movedOutAt === undefined);
  const props = w.props.filter(p => p.buildingId === b.id);
  return (
    <div className="glass-solid fade-up absolute inset-x-3 bottom-[78px] z-10 mx-auto max-w-md rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div><div className="font-medium">{b.name}</div><div className="text-xs text-slate-400">{KIND_LABEL[b.kind]} · {AREA_LABEL[b.area]}</div></div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${b.status === 'open' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'}`}>
          {b.status === 'open' ? (b.hours ? `営業 ${b.hours[0]}:00–${b.hours[1]}:00` : '利用可') : '閉店'}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-300">
        {b.isHome ? `住人：${residents.map(c => c.name).join('、') || 'なし'}` : `従業員：${staff.map(c => c.name).join('、') || 'なし'}`}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        いま：{here.length ? here.map(c => <button key={c.id} className="mr-2 underline decoration-dotted" onClick={() => selectC(c.id)}>{c.name}（{ACTIVITY_LABEL[c.activity]}）</button>) : '誰もいない'}
      </div>
      {props.length > 0 && <div className="mt-1 text-xs text-amber-200/80">設置物：{props.map(p => PROP_LABEL[p.kind]).join('、')}</div>}
      <div className="mt-3 flex gap-1.5"><Chip onClick={() => { setTab('events'); }}>出来事を見る</Chip><Chip onClick={() => select(null)}>閉じる</Chip></div>
    </div>
  );
}

function InterventionSheet({ onClose }: { onClose: () => void }) {
  const w = useWorld();
  const say = useGame(s => s.say);
  const touch = useGame(s => s.touch);
  const [target, setTarget] = useState<string>('b_park');
  const [tab, setTab] = useState<'prop' | 'shop' | 'fest'>('prop');
  const places = Object.values(w.buildings).filter((b: Building) => b.status === 'open' && (isOutdoor(b) || b.kind === 'cafe'));
  const festPlaces = places.filter(b => ['plaza', 'park', 'beach'].includes(b.kind));
  const lots = w.lots.filter(l => !l.used && !w.construction.some(c => c.lotId === l.id));
  const result = (r: { ok: boolean; message: string }) => { say(r.message); touch(); if (r.ok) onClose(); };
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div className="glass-solid safe-b fade-up mx-auto w-full max-w-lg rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h3 className="font-semibold">街への小さな介入</h3><button onClick={onClose} className="text-xs text-slate-400">閉じる</button></div>
        <p className="mb-3 text-xs text-slate-400">住人に行動を強制することはできません。環境を整え、街がどう変わるかを見守ります。</p>
        <div className="mb-3 flex gap-1.5"><Chip active={tab === 'prop'} onClick={() => setTab('prop')}>設備を置く</Chip><Chip active={tab === 'shop'} onClick={() => setTab('shop')}>店舗の候補</Chip><Chip active={tab === 'fest'} onClick={() => setTab('fest')}>季節のお祭り</Chip></div>
        {tab === 'prop' && (
          <>
            <select aria-label="設置場所" value={target} onChange={e => setTarget(e.target.value)} className="mb-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm">
              {places.map(b => <option key={b.id} value={b.id} className="text-black">{b.name}（{KIND_LABEL[b.kind]}）</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              {(['bench', 'plant', 'streetlight', 'playground'] as PropKind[]).map(k => (
                <button key={k} className="rounded-xl bg-white/10 py-3 text-sm hover:bg-white/20" onClick={() => result(placeProp(sim.world, target, k))}>{PROP_LABEL[k]}</button>
              ))}
            </div>
          </>
        )}
        {tab === 'shop' && (
          <div className="space-y-2">
            {lots.length === 0 && <p className="text-sm text-slate-400">空き地がありません。</p>}
            {lots.map(l => (
              <div key={l.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3">
                <div className="text-sm">{AREA_LABEL[l.area].split(' ')[0]}の空き地</div>
                <div className="flex gap-1.5">
                  {(l.area === 'seaside' ? ['cafe', 'restaurant', 'tourist'] : l.area === 'residential' ? ['shop', 'convenience'] : l.area === 'station' ? ['restaurant', 'convenience'] : ['cafe', 'bookstore', 'shop']).map(k => (
                    <Chip key={k} onClick={() => result(proposeShop(sim.world, l.id, k as never))}>{KIND_LABEL[k as keyof typeof KIND_LABEL]}</Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'fest' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">明日の夕方、{SEASON_LABEL[w.env.season]}のお祭りが開かれます。誰が来るかは住人次第です。</p>
            {festPlaces.map(b => <button key={b.id} className="w-full rounded-xl bg-white/10 py-3 text-sm hover:bg-white/20" onClick={() => result(holdFestival(sim.world, b.id))}>{b.name}で開催</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

export { Bar };
