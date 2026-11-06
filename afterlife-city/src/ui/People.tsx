import { useMemo, useState } from 'react';
import { useGame, useWorld } from '../store/game';
import { ACTIVITY_LABEL, AREA_LABEL, MOOD_LABEL, type AreaId, type Citizen, type Relationship } from '../sim/types';
import { relationsOf } from '../sim/social';
import { formatDate } from '../sim/clock';
import { Avatar, Bar, Chip, MoodChip, PanelShell, Section, stamp, whereNow } from './common';
import { INTEREST_PLACES } from '../sim/world';
import { updateMood } from '../sim/behavior';

const AGE_BANDS: [string, (a: number) => boolean][] = [
  ['全年齢', () => true], ['〜29', a => a < 30], ['30代', a => a >= 30 && a < 40], ['40代', a => a >= 40 && a < 50], ['50歳〜', a => a >= 50],
];

export function PeoplePanel() {
  const w = useWorld();
  const selected = useGame(s => s.selectedCitizen);
  const select = useGame(s => s.selectCitizen);
  const [q, setQ] = useState('');
  const [job, setJob] = useState('all');
  const [area, setArea] = useState<'all' | AreaId>('all');
  const [age, setAge] = useState(0);
  const [rel, setRel] = useState<'all' | 'friends' | 'lonely'>('all');
  const [activeOnly, setActiveOnly] = useState(false);

  const all = useMemo(() => Object.values(w.citizens).filter(c => c.movedOutAt === undefined), [w.time, w.citizens]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => [...new Set(all.map(c => c.occupation))].sort(), [all.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected && w.citizens[selected]) return <Profile id={selected} onBack={() => select(null)} />;

  const list = all.filter(c => {
    if (q && !c.name.includes(q) && !c.occupation.includes(q)) return false;
    if (job !== 'all' && c.occupation !== job) return false;
    if (area !== 'all' && w.buildings[c.homeId]?.area !== area) return false;
    if (!AGE_BANDS[age][1](c.age)) return false;
    if (activeOnly && (c.activity === 'sleep' || c.activity === 'home')) return false;
    if (rel !== 'all') {
      const n = relationsOf(w, c.id).filter(r => r.kind === 'friend' || r.kind === 'family').length;
      if (rel === 'friends' && n < 2) return false;
      if (rel === 'lonely' && n >= 2) return false;
    }
    return true;
  });

  const sel = 'field text-xs';
  return (
    <PanelShell title="住人" sub={`${list.length} / ${all.length}人`}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="名前・職業で検索" aria-label="住人検索"
        className="mb-3 w-full border border-[color:var(--rule)] px-3 py-2 text-sm" />
      <div className="mb-3 flex flex-wrap gap-2">
        <select className={sel} value={job} onChange={e => setJob(e.target.value)} aria-label="職業"><option value="all" className="text-black">職業: すべて</option>{jobs.map(j => <option key={j} className="text-black">{j}</option>)}</select>
        <select className={sel} value={area} onChange={e => setArea(e.target.value as 'all' | AreaId)} aria-label="エリア"><option value="all" className="text-black">エリア: すべて</option>{(Object.keys(AREA_LABEL) as AreaId[]).map(a => <option key={a} value={a} className="text-black">{AREA_LABEL[a].split(' ')[0]}</option>)}</select>
        <select className={sel} value={age} onChange={e => setAge(Number(e.target.value))} aria-label="年齢層">{AGE_BANDS.map(([l], i) => <option key={l} value={i} className="text-black">{l}</option>)}</select>
        <select className={sel} value={rel} onChange={e => setRel(e.target.value as 'all')} aria-label="人間関係"><option value="all" className="text-black">関係: すべて</option><option value="friends" className="text-black">親しい人が多い</option><option value="lonely" className="text-black">親しい人が少ない</option></select>
        <Chip active={activeOnly} onClick={() => setActiveOnly(v => !v)}>活動中のみ</Chip>
      </div>
      <ul className="space-y-1.5">
        {list.map(c => (
          <li key={c.id}>
            <button onClick={() => select(c.id)} className="flex w-full items-center gap-3 border border-[color:var(--rule)] p-2.5 text-left transition hover:bg-[rgba(236,228,212,0.05)]">
              <Avatar c={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{c.name}</span><span className="text-[11px] text-[color:var(--muted)]">{c.age}歳 · {c.occupation}</span></div>
                <div className="truncate text-xs text-[color:var(--muted)]">{whereNow(w, c)}</div>
                <div className="truncate text-[11px] text-[color:var(--faint)]">{c.recentActions[0]?.text ?? ''}</div>
              </div>
              <MoodChip c={c} />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-8 text-center text-sm text-[color:var(--faint)]">該当する住人がいません</li>}
      </ul>
    </PanelShell>
  );
}

const TABS = ['Profile', 'Daily Life', 'Relationships', 'Memories', 'Life Story', 'Current Status'] as const;
type PTab = typeof TABS[number];
const TAB_JA: Record<PTab, string> = { Profile: 'プロフィール', 'Daily Life': '生活', Relationships: '人間関係', Memories: '記憶', 'Life Story': '人生', 'Current Status': 'いま' };

function Profile({ id, onBack }: { id: string; onBack: () => void }) {
  const w = useWorld();
  const c = w.citizens[id];
  const [tab, setTab] = useState<PTab>('Profile');
  const setSpotlight = useGame(s => s.setSpotlight);
  const setMode = useGame(s => s.setCameraMode);
  const setTabG = useGame(s => s.setTab);
  const openDoc = useGame(s => s.openDocumentary);
  return (
    <PanelShell title={c.name} sub={`${c.age}歳 · ${c.occupation}`} onClose={onBack}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar c={c} size={64} />
        <div className="min-w-0 flex-1"><MoodChip c={c} /><div className="mt-1 text-xs text-[color:var(--paper2)]">{whereNow(w, c)}</div></div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip active onClick={() => { setSpotlight(c.id); setMode('follow'); setTabG('city'); }}>追跡する</Chip>
        <Chip onClick={() => openDoc(c.id)}>人生を振り返る</Chip>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{TAB_JA[t]}</button>)}
      </div>
      {tab === 'Profile' && <ProfileTab c={c} />}
      {tab === 'Daily Life' && <DailyTab c={c} />}
      {tab === 'Relationships' && <RelTab c={c} />}
      {tab === 'Memories' && <MemTab c={c} />}
      {tab === 'Life Story' && <StoryTab c={c} />}
      {tab === 'Current Status' && <StatusTab c={c} />}
    </PanelShell>
  );
}

function ProfileTab({ c }: { c: Citizen }) {
  const w = useWorld();
  const home = w.buildings[c.homeId], work = c.workplaceId ? w.buildings[c.workplaceId] : null;
  const P = c.personality;
  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-[color:var(--paper2)]">{c.bio}</p>
      <Section title="性格">
        <Bar label="社交性" value={P.sociability} /><Bar label="好奇心" value={P.curiosity} />
        <Bar label="忍耐力" value={P.patience} /><Bar label="活動性" value={P.activity} /><Bar label="新しい経験への積極性" value={P.openness} />
      </Section>
      <Section title="暮らし">
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm"><dt className="text-[color:var(--faint)]">住まい</dt><dd>{home.name}</dd><dt className="text-[color:var(--faint)]">職場</dt><dd>{work?.name ?? '（なし）'}</dd><dt className="text-[color:var(--faint)]">趣味</dt><dd>{c.interests.join('、')}</dd><dt className="text-[color:var(--faint)]">人生の目標</dt><dd>{c.currentGoal}</dd><dt className="text-[color:var(--faint)]">越してきた日</dt><dd>{c.movedInAt === 0 ? '昔から住んでいる' : formatDate(w.startDate, c.movedInAt)}</dd></dl>
      </Section>
    </>
  );
}

function DailyTab({ c }: { c: Citizen }) {
  const w = useWorld();
  const r = c.dailyRoutine;
  const t = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  return (
    <>
      <Section title="一日のリズム">
        <ul className="space-y-1 text-sm"><li>起床 <b className="tabular-nums">{t(r.wake)}</b></li>
          {c.workplaceId ? <><li>家を出る <b className="tabular-nums">{t(r.leaveHome)}</b></li><li>勤務 <b className="tabular-nums">{t(r.workStart)}–{t(r.workEnd)}</b>（{w.buildings[c.workplaceId].name}）</li></> : <li>決まった勤務はなし</li>}
          <li>就寝 <b className="tabular-nums">{t(r.bed)}</b></li></ul>
      </Section>
      <Section title="よく行く場所">
        <ul className="space-y-1 text-sm">{Object.entries(c.visits).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => <li key={id} className="flex justify-between"><span>{w.buildings[id]?.name ?? id}</span><span className="text-[color:var(--faint)]">{n}回</span></li>)}</ul>
      </Section>
      <Section title="最近の行動">
        <ul className="space-y-1 text-sm">{c.recentActions.slice(0, 8).map((a, i) => <li key={i}><span className="mr-2 tabular-nums text-[color:var(--faint)]">{stamp(w, a.t)}</span>{a.text}</li>)}</ul>
      </Section>
      <Section title="趣味が向かう先">
        <p className="text-xs text-[color:var(--muted)]">{c.interests.map(i => `${i}→${[...new Set(INTEREST_PLACES[i] ?? [])].length ? '街の各所' : ''}`).join(' / ')}</p>
      </Section>
    </>
  );
}

const REL_LABEL: Record<Relationship['kind'], string> = { family: '家族', coworker: '同僚', neighbor: 'ご近所', acquaintance: '知人', friend: '友人', rival: '不仲' };
function RelTab({ c }: { c: Citizen }) {
  const w = useWorld();
  const select = useGame(s => s.selectCitizen);
  const rels = relationsOf(w, c.id).filter(r => r.familiarity >= 5).sort((a, b) => b.familiarity - a.familiarity);
  return (
    <ul className="space-y-2">
      {rels.length === 0 && <li className="text-sm text-[color:var(--faint)]">まだ親しい相手はいません。</li>}
      {rels.map(r => {
        const o = w.citizens[r.aId === c.id ? r.bId : r.aId];
        if (!o || o.movedOutAt !== undefined) return null;
        return (
          <li key={r.aId + r.bId} className="border border-[color:var(--rule)] p-3">
            <button className="flex w-full items-center gap-2 text-left" onClick={() => select(o.id)}>
              <Avatar c={o} size={32} /><span className="flex-1 text-sm">{o.name}</span>
              <span className={`px-2 py-0.5 text-[11px] ${r.kind === 'friend' ? 'lbl' : r.kind === 'rival' ? 'lbl' : 'lbl'}`}>{REL_LABEL[r.kind]}</span>
            </button>
            <div className="mt-2 grid grid-cols-2 gap-x-4">
              <Bar label="面識" value={r.familiarity} /><Bar label="友情" value={r.friendship} />
              <Bar label="信頼" value={r.trust} /><Bar label="好意" value={r.affection} />
            </div>
            {r.tension > 8 && <Bar label="緊張・対立" value={r.tension} />}
            {r.sharedInterest && <div className="mt-1 text-[11px] text-[color:var(--muted)]">共通の趣味：{r.sharedInterest}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function MemTab({ c }: { c: Citizen }) {
  const w = useWorld();
  const list = [...c.memories].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <ul className="space-y-2">
      {list.length === 0 && <li className="text-sm text-[color:var(--faint)]">心に残る出来事はまだありません。重要な出来事だけが長期記憶になります。</li>}
      {list.map(m => (
        <li key={m.memoryId} className="border border-[color:var(--rule)] p-3">
          <div className="flex items-center justify-between text-[11px] text-[color:var(--faint)]"><span>{stamp(w, m.createdAt)}{m.summarized ? ' · 要約' : ''}</span><span className={m.emotionalImpact >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{m.emotionalImpact >= 0 ? '＋' : '−'}{Math.abs(m.emotionalImpact)}</span></div>
          <p className="mt-1 text-sm">{m.summary}</p>
          <div className="mt-1 h-1 overflow-hidden border border-[color:var(--rule)]"><div className="h-full" style={{ width: `${m.importance}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function StoryTab({ c }: { c: Citizen }) {
  const w = useWorld();
  const evs = c.lifeEvents.map(id => w.events.find(e => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  return (
    <ol className="relative ml-2 border-l border-[color:var(--rule)] pl-4">
      <li className="mb-4"><div className="absolute -left-[4px] mt-1.5 h-[7px] w-[7px] bg-[color:var(--paper2)]" /><div className="text-[11px] text-[color:var(--faint)]">はじまり</div><div className="text-sm">{c.movedInAt === 0 ? `${c.name}はルミエール・ベイで暮らしていた。` : `${formatDate(w.startDate, c.movedInAt)}に越してきた。`}</div></li>
      {evs.map(e => (
        <li key={e.id} className="mb-4"><div className="absolute -left-[4px] mt-1.5 h-[7px] w-[7px] bg-[color:var(--paper2)]" /><div className="text-[11px] text-[color:var(--faint)]">{stamp(w, e.time)}</div><div className="text-sm">{e.summary}</div></li>
      ))}
      {evs.length === 0 && <li className="text-sm text-[color:var(--faint)]">まだ語られる出来事はありません。</li>}
    </ol>
  );
}

function StatusTab({ c }: { c: Citizen }) {
  const w = useWorld();
  void updateMood;
  return (
    <>
      <Section title="いま">
        <p className="text-sm">{whereNow(w, c)}（{ACTIVITY_LABEL[c.activity]}）</p>
        <p className="mt-1 text-sm text-[color:var(--paper2)]">気分：{MOOD_LABEL[c.currentMood]}　目標：{c.currentGoal}</p>
      </Section>
      <Section title="欲求">
        <Bar label="体力" value={c.needs.energy} /><Bar label="満腹" value={c.needs.hunger} />
        <Bar label="交流" value={c.needs.social} /><Bar label="楽しみ" value={c.needs.fun} />
      </Section>
      {c.plan && <Section title="これから"><p className="text-sm">{w.buildings[c.plan.buildingId]?.name}で{ACTIVITY_LABEL[c.plan.activity]}</p></Section>}
    </>
  );
}
