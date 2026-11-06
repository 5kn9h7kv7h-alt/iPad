import { useState } from 'react';
import { sim, useGame, useWorld, type Speed } from '../store/game';
import { formatDate, formatTime } from '../sim/clock';
import { interestingCitizen } from '../render/director';
import { ACTIVITY_LABEL, AREA_LABEL, KIND_LABEL, SEASON_LABEL, WEATHER_LABEL, type Building } from '../sim/types';
import { holdFestival, placeProp, proposeShop, PROP_LABEL, type PropKind } from '../sim/interventions';
import { Avatar, Chip, MoodText, whereNow } from './common';
import { isOutdoor } from '../sim/paths';
import { relationsOf } from '../sim/social';

const SHOT_JA: Record<string, string> = {
  'Aerial Shot': '空撮', 'Street Shot': '街角', 'Character Follow': '人物', 'Event Shot': '出来事', 'Ambient Shot': '風景',
};

export function TopBar() {
  const w = useWorld();
  const speed = useGame(s => s.speed);
  const setSpeed = useGame(s => s.setSpeed);
  const hud = useGame(s => s.hud);
  const speeds: [Speed, string][] = [[0, '停止'], [1, '1×'], [2, '2×'], [5, '5×'], [10, '10×']];
  return (
    <div className={`hud ${hud ? '' : 'off'} pointer-events-none absolute inset-x-0 top-0 z-20`}>
      <div className="panel safe-t pointer-events-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-x-0 border-t-0 px-4 pb-2.5 pt-3">
        <div className="flex items-baseline gap-3">
          <span className="serif text-[17px] leading-none">ルミエール・ベイ</span>
          <span className="lbl hidden sm:inline">{SEASON_LABEL[w.env.season]}</span>
        </div>
        <div className="flex items-baseline gap-3" data-testid="clock">
          <span className="lbl hidden sm:inline">{formatDate(w.startDate, w.time)}</span>
          <span className="num text-[19px] font-light leading-none">{formatTime(w.time)}</span>
          <span className="text-[12px]" style={{ color: 'var(--paper2)' }}>{WEATHER_LABEL[w.env.weather]}　{w.env.temperature.toFixed(0)}°</span>
        </div>
        <div className="flex" role="group" aria-label="時間の速さ">
          {speeds.map(([v, l], i) => (
            <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v} className={`btn num ${speed === v ? 'on' : ''}`} style={{ marginLeft: i ? -1 : 0, minWidth: 40 }}>{l}</button>
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
  const hud = useGame(s => s.hud);
  const [sheet, setSheet] = useState(false);
  const feat = spotlight ? w.citizens[spotlight] : null;
  const follow = () => { if (!spotlight) { const id = interestingCitizen(w); if (id) setSpotlight(id); } setMode('follow'); };
  const label = mode === 'manual' ? '手動' : mode === 'follow' ? '追跡中' : SHOT_JA[shot] ?? shot;

  return (
    <>
      <div className={`hud ${hud ? '' : 'off'} pointer-events-none absolute inset-x-3 top-[calc(86px+env(safe-area-inset-top))] z-10 flex flex-col items-start gap-2 sm:top-[calc(62px+env(safe-area-inset-top))] sm:flex-row sm:justify-between`}>
        <div className="panel pointer-events-auto flex items-center">
          <span className="lbl px-3" data-testid="shot-label">{label}</span>
          <button className={`btn ${mode === 'auto' ? 'on' : ''}`} style={{ borderWidth: '0 0 0 1px' }} onClick={() => setMode('auto')}>自動</button>
          <button className={`btn ${mode === 'follow' ? 'on' : ''}`} style={{ borderWidth: '0 0 0 1px' }} onClick={follow}>追跡</button>
        </div>
        {feat ? (
          <div className="panel pointer-events-auto w-[min(270px,calc(100vw-1.5rem))] p-3">
            <div className="flex items-center gap-2.5">
              <Avatar c={feat} size={34} />
              <div className="min-w-0 flex-1"><div className="truncate text-[13px]">{feat.name}</div><div className="lbl truncate">{whereNow(w, feat)}</div></div>
              <MoodText c={feat} />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <Chip active={mode === 'follow'} onClick={() => setMode('follow')}>追う</Chip>
              <Chip onClick={() => { selectCitizen(feat.id); setTab('people'); }}>詳しく</Chip>
              <Chip onClick={() => openDoc(feat.id)}>人生</Chip>
              <Chip onClick={() => { setSpotlight(null); setMode('auto'); }}>やめる</Chip>
            </div>
          </div>
        ) : (
          <button className="btn panel pointer-events-auto" onClick={() => { const id = interestingCitizen(w); if (id) { setSpotlight(id); setMode('follow'); } }}>誰かを追う</button>
        )}
      </div>

      {selectedC && <CitizenQuick id={selectedC} />}
      {selectedB && <BuildingQuick id={selectedB} />}

      <button onClick={() => setSheet(true)} aria-label="街に手を加える"
        className={`hud ${hud ? '' : 'off'} btn panel absolute bottom-[72px] right-3 z-10 px-4 py-3 text-[13px]`}>手を加える</button>
      {sheet && <InterventionSheet onClose={() => setSheet(false)} />}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="panel-solid fade-up absolute inset-x-3 bottom-[72px] z-10 mx-auto max-w-md p-4">{children}</div>;
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
    <Card>
      <div className="flex items-center gap-3">
        <Avatar c={c} size={46} />
        <div className="min-w-0 flex-1">
          <div className="serif text-[16px]">{c.name}</div>
          <div className="lbl mt-0.5">{c.age}歳　{c.occupation}</div>
          <div className="lbl mt-0.5 truncate" style={{ color: 'var(--paper2)' }}>{whereNow(w, c)}</div>
        </div>
        <MoodText c={c} />
      </div>
      <div className="lbl mt-3">{c.currentGoal}　／　親しい人 {friends}人</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active onClick={() => { setSpotlight(c.id); setMode('follow'); }}>この人を追う</Chip>
        <Chip onClick={() => { select(c.id); setTab('people'); }}>詳しく</Chip>
        <Chip onClick={() => openDoc(c.id)}>人生</Chip>
        <Chip onClick={() => select(null)}>閉じる</Chip>
      </div>
    </Card>
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
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div><div className="serif text-[16px]">{b.name}</div><div className="lbl mt-0.5">{KIND_LABEL[b.kind]}　{AREA_LABEL[b.area].split(' ')[1]}</div></div>
        <span className="lbl">{b.status === 'open' ? (b.hours ? `${b.hours[0]}時〜${b.hours[1]}時` : '') : '閉店'}</span>
      </div>
      <div className="mt-3 text-[12px]" style={{ color: 'var(--paper2)' }}>
        {b.isHome ? `住む人　${residents.map(c => c.name).join('、') || 'なし'}` : `働く人　${staff.map(c => c.name).join('、') || 'なし'}`}
      </div>
      <div className="lbl mt-1.5">
        いる人　{here.length ? here.map(c => <button key={c.id} className="link mr-2" onClick={() => selectC(c.id)}>{c.name}（{ACTIVITY_LABEL[c.activity]}）</button>) : '誰もいない'}
      </div>
      {props.length > 0 && <div className="lbl mt-1.5">置いたもの　{props.map(p => PROP_LABEL[p.kind]).join('、')}</div>}
      <div className="mt-3 flex gap-1.5"><Chip onClick={() => setTab('events')}>出来事</Chip><Chip onClick={() => select(null)}>閉じる</Chip></div>
    </Card>
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
    <div className="absolute inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div className="panel-solid safe-b fade-up mx-auto w-full max-w-lg border-x-0 border-b-0 p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-1 flex items-baseline justify-between"><h3 className="serif text-[17px]">街に手を加える</h3><button onClick={onClose} className="btn">閉じる</button></div>
        <p className="lbl mb-4">住人に何かをさせることはできません。置いたものに、住人がどう応えるかを見守ります。</p>
        <div className="mb-4 flex gap-4 border-b" style={{ borderColor: 'var(--rule)' }}>
          {([['prop', '設備'], ['shop', '店の候補'], ['fest', 'お祭り']] as const).map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'prop' && (
          <>
            <select aria-label="設置場所" value={target} onChange={e => setTarget(e.target.value)} className="field mb-3 w-full">
              {places.map(b => <option key={b.id} value={b.id}>{b.name}（{KIND_LABEL[b.kind]}）</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              {(['bench', 'plant', 'streetlight', 'playground'] as PropKind[]).map(k => (
                <button key={k} className="btn py-3 text-[13px]" onClick={() => result(placeProp(sim.world, target, k))}>{PROP_LABEL[k]}</button>
              ))}
            </div>
          </>
        )}
        {tab === 'shop' && (
          <div className="space-y-2">
            {lots.length === 0 && <p className="lbl">空き地がありません。</p>}
            {lots.map(l => (
              <div key={l.id} className="flex items-center justify-between border p-3" style={{ borderColor: 'var(--rule)' }}>
                <div className="text-[13px]">{AREA_LABEL[l.area].split(' ')[1]}の空き地</div>
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
            <p className="lbl">明日の夕方に{SEASON_LABEL[w.env.season]}のお祭りが開かれます。誰が来るかは住人次第です。</p>
            {festPlaces.map(b => <button key={b.id} className="btn w-full py-3 text-[13px]" onClick={() => result(holdFestival(sim.world, b.id))}>{b.name}で開く</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
