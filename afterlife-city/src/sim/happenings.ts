// Rule-based happenings: sudden events, city growth/decline, population, seasonal festivals, scheduled events.
// These keep the city alive even when AI is switched off.
import { chance, clamp, pick, rand, randInt } from './rng';
import { dateOf, dayOf, hourOf, minuteOfDay, seasonOf } from './clock';
import { createCitizen, makeBuilding, seedRelationshipsFor, type CSpec } from './world';
import { isWorkDay, inSleepWindow, startPlan } from './behavior';
import { consolidateMemories, logEvent, remember } from './log';
import { converse, getRel } from './social';
import { SEASON_LABEL, type Building, type BuildingKind, type Citizen, type ScheduledEvent, type WorldState } from './types';

const active = (w: WorldState) => Object.values(w.citizens).filter(c => c.movedOutAt === undefined);
const peopleAt = (w: WorldState, id: string) =>
  active(w).filter(c => c.currentLocation === id && c.plan?.arrived && c.activity !== 'sleep');

function once(w: WorldState, key: string): boolean {
  if (w.usedKeys.includes(key)) return false;
  w.usedKeys.push(key);
  if (w.usedKeys.length > 600) w.usedKeys.splice(0, 200);
  return true;
}

const boost = (c: Citizen, fun: number) => { c.needs.fun = clamp(c.needs.fun + fun); c.needs.social = clamp(c.needs.social + fun / 2); };

// ---------------------------------------------------------------- sudden events
type Sudden = (w: WorldState) => boolean;

const SUDDEN: { key: string; p: number; run: Sudden }[] = [
  {
    key: 'big_catch', p: 0.25, run: w => {
      const b = w.buildings['b_fishery'];
      if (!b || b.status !== 'open' || w.env.weather === 'rain') return false;
      const crew = peopleAt(w, b.id).filter(c => c.activity === 'work');
      if (crew.length < 1) return false;
      const ev = logEvent(w, {
        category: 'work', locationId: b.id, people: crew.map(c => c.id), importance: 38,
        summary: `${b.name}に大漁の船が戻ってきた`, cause: '海が穏やかで漁が順調だった', result: '市場に新鮮な魚が並ぶ見込み',
      });
      for (const c of crew) { boost(c, 20); remember(w, c, { summary: ev.summary, eventId: ev.id, locationId: b.id, people: ev.people, importance: 36, impact: 40 }); }
      return true;
    },
  },
  {
    key: 'lost_item', p: 0.15, run: w => {
      const b = w.buildings['b_station'];
      const here = peopleAt(w, b.id);
      if (here.length < 2) return false;
      const [finder, owner] = [pick(w, here), pick(w, here)];
      if (finder.id === owner.id) return false;
      const rel = getRel(w, finder.id, owner.id);
      rel.familiarity = clamp(rel.familiarity + 8); rel.trust = clamp(rel.trust + 6); rel.friendship = clamp(rel.friendship + 3);
      const ev = logEvent(w, {
        category: 'sudden', locationId: b.id, people: [finder.id, owner.id], importance: 40,
        summary: `${finder.name}が${b.name}で拾った財布を${owner.name}に届けた`, cause: 'ベンチの下に落とし物があった', result: '二人の間に信頼が生まれた',
      });
      remember(w, owner, { summary: ev.summary, eventId: ev.id, locationId: b.id, people: [finder.id], importance: 45, impact: 50 });
      remember(w, finder, { summary: ev.summary, eventId: ev.id, locationId: b.id, people: [owner.id], importance: 33, impact: 30 });
      return true;
    },
  },
  {
    key: 'stray_cat', p: 0.2, run: w => {
      const spots = Object.values(w.buildings).filter(b => (b.kind === 'park' || b.kind === 'plaza') && b.status === 'open');
      const b = pick(w, spots);
      const here = peopleAt(w, b.id);
      if (here.length < 2) return false;
      const ev = logEvent(w, {
        category: 'sudden', locationId: b.id, people: here.map(c => c.id), importance: 34,
        summary: `${b.name}に迷い猫が現れ、居合わせた人々が集まった`, cause: '人懐こい三毛猫がふらりと現れた', result: '居合わせた人たちが自然に言葉を交わした',
      });
      for (const c of here) { boost(c, 15); remember(w, c, { summary: ev.summary, eventId: ev.id, locationId: b.id, people: ev.people, importance: 32, impact: 35 }); }
      for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
        const r = getRel(w, here[i].id, here[j].id);
        r.familiarity = clamp(r.familiarity + 4); r.friendship = clamp(r.friendship + 1.5); r.meetings++;
      }
      return true;
    },
  },
  {
    key: 'sunset', p: 0.5, run: w => {
      const h = hourOf(w.time);
      if (h < 15 || h > 19.5 || w.env.weather === 'rain' || w.env.weather === 'fog') return false;
      const b = pick(w, [w.buildings['b_lookout'], w.buildings['b_beach']].filter(x => x?.status === 'open'));
      const here = b ? peopleAt(w, b.id) : [];
      if (!b || !here.length || w.env.daylight > 0.75 || w.env.daylight < 0.1) return false;
      const ev = logEvent(w, {
        category: 'environment', locationId: b.id, people: here.map(c => c.id), importance: 32,
        summary: `${b.name}で夕焼けが海を染めた`, cause: `${SEASON_LABEL[w.env.season]}の澄んだ空`, result: '見ていた人たちの心に残った',
      });
      for (const c of here) { boost(c, 12); remember(w, c, { summary: ev.summary, eventId: ev.id, locationId: b.id, people: [], importance: 31, impact: 30 }); }
      return true;
    },
  },
  {
    key: 'rain_shelter', p: 0.5, run: w => {
      if (w.env.weather !== 'rain') return false;
      const b = Object.values(w.buildings).find(x => (x.kind === 'cafe' || x.kind === 'shop') && x.status === 'open' && peopleAt(w, x.id).length >= 3);
      if (!b) return false;
      const here = peopleAt(w, b.id);
      logEvent(w, {
        category: 'commerce', locationId: b.id, people: here.map(c => c.id), importance: 18,
        summary: `急な雨で${b.name}に雨宿りの客が集まった`, cause: '雨脚が強まった', result: '店がいつもより賑わった',
      });
      return true;
    },
  },
  {
    key: 'market_sale', p: 0.3, run: w => {
      const b = w.buildings['b_market'];
      if (!b || b.status !== 'open') return false;
      const here = peopleAt(w, b.id);
      if (here.length < 2) return false;
      logEvent(w, { category: 'commerce', locationId: b.id, people: here.map(c => c.id), importance: 16, summary: `${b.name}で朝獲れの魚の特売が始まった`, cause: '大漁の翌朝', result: '買い物客でにぎわった' });
      return true;
    },
  },
  {
    key: 'fog_horn', p: 0.5, run: w => {
      if (w.env.weather !== 'fog') return false;
      logEvent(w, { category: 'environment', locationId: 'b_fishery', importance: 14, summary: '濃い霧の中、港で霧笛が鳴り響いた', cause: '視界が数十メートルまで落ちた', result: '漁船が出港を見合わせた' });
      return true;
    },
  },
  {
    key: 'flicker', p: 0.04, run: w => {
      if (!w.env.lightsOn) return false;
      logEvent(w, { category: 'sudden', importance: 12, summary: '一瞬、街灯が消えてまた点いた', cause: '送電の乱れ', result: '大きな問題はなかった' });
      return true;
    },
  },
];

// ---------------------------------------------------------------- hourly
export function hourly(w: WorldState): void {
  const h = Math.floor(hourOf(w.time));
  const day = dayOf(w.time);
  for (const b of Object.values(w.buildings)) {
    if (b.status === 'open' && b.hours && b.hours[0] === h && b.hours[0] > 0 && b.kind !== 'station') {
      const owner = active(w).find(c => c.workplaceId === b.id);
      if (owner) logEvent(w, { category: 'commerce', locationId: b.id, people: [owner.id], importance: 3, summary: `${b.name}が開店した`, cause: `${owner.name}が店を開けた`, result: '' });
    }
  }
  if (!chance(w, 0.5)) return;
  const s = pick(w, SUDDEN);
  if (chance(w, s.p) && once(w, `${s.key}:${day}`)) s.run(w);
}

// ---------------------------------------------------------------- daily
const SURNAMES = ['原', '岡田', '長谷川', '近藤', '藤井', '西村', '村上', '前田', '河野', '内田', '大野', '三浦'];
const GIVEN_F = ['彩花', '美優', '奈々', '陽菜', '凛', '沙耶', '千尋'];
const GIVEN_M = ['颯太', '拓海', '和也', '航', '慎吾', '陽介', '蒼'];
const NEW_JOBS: { occupation: string; work: string | null; shift: CSpec['shift'] }[] = [
  { occupation: '観光ガイド', work: 'b_aquarium', shift: 'day' },
  { occupation: 'カフェ店員', work: 'b_cafe', shift: 'shop' },
  { occupation: '倉庫作業員', work: 'b_warehouse', shift: 'day' },
  { occupation: '市場の売り手', work: 'b_market', shift: 'early' },
  { occupation: 'フリーランスのデザイナー', work: null, shift: 'none' },
  { occupation: '写真家', work: null, shift: 'none' },
  { occupation: '研究者（海洋調査）', work: 'b_office', shift: 'day' },
];

const NEW_BUSINESS: Record<string, { kind: BuildingKind; names: string[]; hours: [number, number]; h: number; job: string }[]> = {
  oldtown: [
    { kind: 'cafe', names: ['喫茶 あおぞら', 'カフェ・ノスタルジア'], hours: [8, 19], h: 4, job: 'カフェ店主' },
    { kind: 'bookstore', names: ['潮風文庫', '小さな本屋 ことり'], hours: [10, 18], h: 4, job: '書店員' },
    { kind: 'shop', names: ['雑貨店 つむぎ', '乾物 まるい'], hours: [9, 18], h: 4, job: '店員' },
  ],
  seaside: [
    { kind: 'cafe', names: ['海辺のベーカリー', 'カフェ・ソレイユ'], hours: [8, 18], h: 4, job: 'パン職人' },
    { kind: 'restaurant', names: ['シーフード ブルーホライズン'], hours: [11, 21], h: 5, job: '料理人' },
    { kind: 'tourist', names: ['灯台資料館'], hours: [10, 16], h: 5, job: '学芸員' },
  ],
  residential: [
    { kind: 'shop', names: ['まちの八百屋', '街角パン店'], hours: [9, 19], h: 4, job: '店主' },
    { kind: 'convenience', names: ['ベイマート 住宅街店'], hours: [6, 23], h: 4, job: 'コンビニ店員' },
  ],
  station: [
    { kind: 'restaurant', names: ['立ち食いそば 汽笛'], hours: [6, 21], h: 4, job: '料理人' },
    { kind: 'convenience', names: ['駅ナカ キヨスク'], hours: [5, 23], h: 3, job: '販売員' },
  ],
  harbor: [{ kind: 'shop', names: ['港の干物屋'], hours: [8, 17], h: 4, job: '店主' }],
};

export function daily(w: WorldState): void {
  const day = dayOf(w.time);
  const season = seasonOf(w.startDate, w.time);
  if (day > 0 && season !== w.env.season) {
    logEvent(w, { category: 'environment', importance: 60, historic: true, summary: `季節が${SEASON_LABEL[season]}に移った`, cause: '暦が進んだ', result: '街の空気が変わり始めた' });
  }
  w.env.season = season;

  // memory consolidation
  for (const c of active(w)) consolidateMemories(w, c);

  // construction completes
  for (const p of [...w.construction]) {
    if (w.time >= p.readyAt) completeConstruction(w, p.id);
  }
  // demolition of long-closed buildings
  for (const b of Object.values(w.buildings)) {
    if (b.status === 'closed' && b.closedAt !== undefined && w.time - b.closedAt > 7 * 1440) demolish(w, b);
  }

  // seasonal festivals (scheduled through the same validated pipeline)
  const d = dateOf(w.startDate, w.time);
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const fest: Record<number, [string, string, string]> = {
    405: ['b_park', 'お花見の宴', '公園の桜の下で、近所の人々が集う。'],
    810: ['b_beach', '海辺の花火大会', '夏の夜空に花火が上がる。'],
    1020: ['b_market', '秋の収穫祭', '市場に秋の味覚が並ぶ。'],
    1224: ['b_plaza', '駅前のイルミネーション', '広場に灯りがともる。'],
  };
  const f = fest[md];
  if (f && w.buildings[f[0]]) {
    scheduleFestival(w, f[0], f[1], f[2], 17 * 60, 180, 'sim');
  }

  if (day < 3) return;
  // new business on a free lot
  if (chance(w, 1 / 22)) autoDevelop(w);
  // closures
  if (day > 20 && chance(w, 1 / 70)) closeSomething(w);
  // population
  if (chance(w, 1 / 16)) immigrate(w);
  if (day > 14 && chance(w, 1 / 45)) emigrate(w);
}

function nameFor(w: WorldState, gender: 'f' | 'm'): string {
  const given = gender === 'f' ? GIVEN_F : GIVEN_M;
  const taken = new Set(Object.values(w.citizens).map(c => c.name));
  for (let i = 0; i < 20; i++) {
    const n = `${pick(w, SURNAMES)} ${pick(w, given)}`;
    if (!taken.has(n)) return n;
  }
  return `${pick(w, SURNAMES)} ${pick(w, given)}${w.counters.citizen}`;
}

export function homeCapacity(b: Building): number { return b.capacity ?? (b.kind === 'apartment' ? 7 : 5); }

function immigrate(w: WorldState): boolean {
  const pop = active(w);
  if (pop.length >= 38) return false;
  const homes = Object.values(w.buildings).filter(b => b.isHome && b.status === 'open' && b.kind === 'apartment');
  const free = homes.filter(h => pop.filter(c => c.homeId === h.id).length < homeCapacity(h));
  if (!free.length) return false;
  const home = pick(w, free);
  const gender = chance(w, 0.5) ? 'f' : 'm';
  const jobs = NEW_JOBS.filter(j => !j.work || w.buildings[j.work]?.status === 'open');
  const job = pick(w, jobs);
  const spec: CSpec = {
    name: nameFor(w, gender), age: randInt(w, 22, 48), gender, occupation: job.occupation,
    home: home.id, work: job.work, shift: job.shift,
  };
  const c = createCitizen(w, spec, w.counters.citizen++);
  c.id = `c_${String(w.counters.citizen).padStart(2, '0')}`;
  c.movedInAt = w.time;
  c.currentLocation = home.id; c.x = home.x; c.z = home.z;
  w.citizens[c.id] = c;
  seedRelationshipsFor(w, c, 2);
  const ev = logEvent(w, {
    category: 'relationship', locationId: home.id, people: [c.id], importance: 50, historic: true,
    summary: `${c.name}（${c.age}歳・${c.occupation}）が${home.name}に引っ越してきた`, cause: '新しい暮らしを求めて', result: '街の住人が増えた',
  });
  remember(w, c, { summary: `ルミエール・ベイに越してきた`, eventId: ev.id, locationId: home.id, importance: 70, impact: 40 });
  return true;
}

function emigrate(w: WorldState): boolean {
  const pop = active(w);
  if (pop.length <= 24) return false;
  // those with the fewest friends are likelier to leave
  const scored = pop.map(c => {
    const friends = Object.values(w.relationships).filter(r => (r.aId === c.id || r.bId === c.id) && (r.kind === 'friend' || r.kind === 'family')).length;
    return { c, s: 1 / (1 + friends) };
  });
  let r = rand(w) * scored.reduce((s, x) => s + x.s, 0), who = scored[0].c;
  for (const x of scored) { r -= x.s; if (r <= 0) { who = x.c; break; } }
  // keep families together: skip if a family member would be stranded alone with young children etc. (none modelled) — fine
  who.movedOutAt = w.time; who.plan = null; who.path = []; who.currentLocation = 'gone'; who.activity = 'home';
  const ev = logEvent(w, {
    category: 'relationship', locationId: who.homeId, people: [who.id], importance: 55, historic: true,
    summary: `${who.name}（${who.occupation}）が街を去った`, cause: '新しい場所での暮らしを選んだ', result: '住居が空いた',
  });
  for (const r2 of Object.values(w.relationships)) {
    const other = r2.aId === who.id ? r2.bId : r2.bId === who.id ? r2.aId : null;
    if (other && r2.friendship >= 35) {
      const o = w.citizens[other];
      if (o && o.movedOutAt === undefined) {
        remember(w, o, { summary: `${who.name}が街を去った`, eventId: ev.id, people: [who.id], importance: 40 + r2.friendship / 4, impact: -40 });
        o.needs.social = clamp(o.needs.social - 15);
      }
    }
  }
  return true;
}

function closeSomething(w: WorldState): void {
  const biz = Object.values(w.buildings).filter(b => b.status === 'open' && ['cafe', 'bookstore', 'restaurant', 'shop'].includes(b.kind) && !b.isHome);
  if (biz.length <= 6) return;
  const b = pick(w, biz);
  b.status = 'closed'; b.closedAt = w.time;
  const staff = active(w).filter(c => c.workplaceId === b.id);
  const ev = logEvent(w, {
    category: 'commerce', locationId: b.id, people: staff.map(c => c.id), importance: 65, historic: true,
    summary: `${b.name}が閉店した`, cause: '客足の変化と店主たちの事情', result: staff.length ? `${staff.map(c => c.name).join('、')}は新しい仕事を探すことになった` : '',
  });
  for (const c of staff) {
    c.workplaceId = null; c.occupation = `元${c.occupation}`;
    c.currentGoal = '新しい仕事を見つける'; c.goalId = 'master_craft';
    c.dailyRoutine = { ...c.dailyRoutine, workStart: 0, workEnd: 0 };
    remember(w, c, { summary: `${b.name}が閉店し、職を失った`, eventId: ev.id, locationId: b.id, people: [], importance: 80, impact: -60 });
  }
}

function demolish(w: WorldState, b: Building): void {
  b.status = 'demolished';
  w.lots.push({ id: `lot_${b.id}`, area: b.area, x: b.x, z: b.z, w: b.w, d: b.d, nodeId: b.nodeId, used: false });
  logEvent(w, { category: 'commerce', locationId: b.id, importance: 45, historic: true, summary: `${b.name}の建物が取り壊され、空き地になった`, cause: '閉店から一週間が過ぎた', result: '新しい店の候補地になる' });
}

function autoDevelop(w: WorldState): void {
  const lot = w.lots.find(l => !l.used && !w.construction.some(c => c.lotId === l.id));
  if (!lot) return;
  const opts = NEW_BUSINESS[lot.area] ?? NEW_BUSINESS.oldtown;
  const o = pick(w, opts);
  queueConstruction(w, lot.id, o.kind, 'sim');
}

/** Returns an error message, or null when queued. */
export function queueConstruction(w: WorldState, lotId: string, kind: BuildingKind, source: 'sim' | 'player'): string | null {
  const lot = w.lots.find(l => l.id === lotId);
  if (!lot || lot.used) return '空き地が見つかりません';
  if (w.construction.some(c => c.lotId === lotId)) return 'すでに建設計画があります';
  const opts = NEW_BUSINESS[lot.area] ?? NEW_BUSINESS.oldtown;
  const o = opts.find(x => x.kind === kind) ?? pick(w, opts);
  const name = pick(w, o.names);
  w.construction.push({ id: `k_${++w.counters.sched}`, kind: o.kind, name, lotId, readyAt: w.time + 3 * 1440 });
  logEvent(w, {
    category: 'commerce', locationId: null, importance: 28, source,
    summary: `${name}（${KIND(o.kind)}）の建設計画が持ち上がった`, cause: source === 'player' ? '観察者が候補地を示した' : '空き地の活用案が出た', result: '約3日後に開業予定',
  });
  return null;
}
const KIND = (k: BuildingKind) => ({ cafe: 'カフェ', bookstore: '書店', shop: '商店', restaurant: '飲食店', tourist: '観光施設', convenience: 'コンビニ' } as Record<string, string>)[k] ?? k;

function completeConstruction(w: WorldState, pid: string): void {
  const i = w.construction.findIndex(c => c.id === pid);
  if (i < 0) return;
  const p = w.construction[i];
  w.construction.splice(i, 1);
  const lot = w.lots.find(l => l.id === p.lotId);
  if (!lot || lot.used) return;
  const spec = (NEW_BUSINESS[lot.area] ?? NEW_BUSINESS.oldtown).find(x => x.kind === p.kind) ?? NEW_BUSINESS.oldtown[0];
  const id = `b_n${++w.counters.sched}`;
  const nodeXY = w.nodes[lot.nodeId];
  const b = makeBuilding({
    id, name: p.name, kind: p.kind, area: lot.area, x: lot.x, z: lot.z, w: Math.min(lot.w, 10), d: Math.min(lot.d, 8), h: spec.h,
    node: [nodeXY.x, nodeXY.z], hours: spec.hours,
  }, w.time);
  w.buildings[id] = b;
  lot.used = true;
  // hire jobless residents
  const jobless = active(w).filter(c => !c.workplaceId && c.occupation.startsWith('元'));
  const hires = jobless.slice(0, 2);
  for (const c of hires) {
    c.workplaceId = id; c.occupation = spec.job; c.currentGoal = '新しい職場に馴染む';
    c.dailyRoutine = { ...c.dailyRoutine, leaveHome: spec.hours[0] * 60 - 30, workStart: spec.hours[0] * 60, workEnd: spec.hours[1] * 60 };
  }
  const ev = logEvent(w, {
    category: 'commerce', locationId: id, people: hires.map(c => c.id), importance: 62, historic: true,
    summary: `${p.name}が開業した`, cause: '3日間の工事を終えた', result: hires.length ? `${hires.map(c => c.name).join('、')}が働き始めた` : '街に新しい店が増えた',
  });
  for (const c of hires) remember(w, c, { summary: `${p.name}で働き始めた`, eventId: ev.id, locationId: id, people: [], importance: 60, impact: 50 });
}

// ---------------------------------------------------------------- scheduled events
export function scheduleFestival(
  w: WorldState, locationId: string, title: string, detail: string, startMinOfDay: number, duration: number, source: 'sim' | 'player',
): ScheduledEvent | null {
  const startAt = w.time - minuteOfDay(w.time) + startMinOfDay + (minuteOfDay(w.time) >= startMinOfDay ? 1440 : 0);
  if (w.scheduled.some(s => s.type === 'festival' && !s.done && Math.abs(s.startAt - startAt) < 1440)) return null;
  const s = makeScheduled(w, { type: 'festival', startAt, endAt: startAt + duration, locationId, people: [], title, detail, source });
  w.scheduled.push(s);
  return s;
}

export function makeScheduled(
  w: WorldState, s: Pick<ScheduledEvent, 'type' | 'startAt' | 'endAt' | 'locationId' | 'people' | 'title' | 'detail' | 'source'> & { param?: string },
): ScheduledEvent {
  return { id: `s_${++w.counters.sched}`, done: false, invited: false, started: false, attendees: [], ...s };
}

const isBusy = (w: WorldState, c: Citizen) => {
  const mod = minuteOfDay(w.time);
  return inSleepWindow(c, mod) || (isWorkDay(w, c) && mod >= c.dailyRoutine.leaveHome && mod < c.dailyRoutine.workEnd);
};

export function processScheduled(w: WorldState): void {
  for (const s of w.scheduled) {
    if (s.done) continue;
    if (!s.invited && w.time >= s.startAt - 45) invite(w, s);
    if (s.invited && !s.started && w.time >= s.startAt) begin(w, s);
    if (w.time >= s.endAt) s.done = true;
  }
  if (w.scheduled.length > 60) w.scheduled = w.scheduled.filter(s => !s.done || w.time - s.endAt < 3 * 1440);
}

function invite(w: WorldState, s: ScheduledEvent): void {
  s.invited = true;
  const loc = s.locationId ? w.buildings[s.locationId] : null;
  if (s.type === 'rumor' || s.type === 'hobby') return;
  if (!loc || loc.status !== 'open') { s.done = true; return; }
  const candidates = s.type === 'festival' ? active(w) : s.people.map(id => w.citizens[id]).filter(Boolean);
  const going: Citizen[] = [];
  for (const c of candidates) {
    if (c.movedOutAt !== undefined || isBusy(w, c)) continue;
    const eager = s.type === 'meetup' ? 0.85 : (c.personality.sociability * 0.6 + c.personality.activity * 0.3) / 100 + 0.1;
    if (chance(w, eager)) going.push(c);
  }
  if (s.type === 'meetup' && going.length < s.people.length) {
    s.done = true;
    logEvent(w, {
      category: 'relationship', locationId: loc.id, people: s.people, importance: 20, source: s.source,
      summary: `${s.title}は都合がつかず流れてしまった`, cause: '予定が合わなかった', result: '次の機会に持ち越された',
    });
    return;
  }
  s.attendees = going.map(c => c.id);
  for (const c of going) {
    startPlan(w, c, { activity: s.type === 'festival' ? 'stroll' : 'talk', buildingId: loc.id, duration: 0, endAt: s.endAt, eventId: s.id });
  }
}

function begin(w: WorldState, s: ScheduledEvent): void {
  s.started = true;
  const loc = s.locationId ? w.buildings[s.locationId] : null;
  if (s.type === 'rumor') {
    const ppl = s.people.map(id => w.citizens[id]).filter(Boolean);
    const ev = logEvent(w, { category: 'daily', people: s.people, locationId: s.locationId, importance: 22, source: s.source, summary: s.title, cause: s.detail, result: '街の話題になっている' });
    for (const c of ppl) remember(w, c, { summary: s.title, eventId: ev.id, locationId: s.locationId, people: s.people, importance: 32, impact: 5 });
    return;
  }
  if (s.type === 'hobby') {
    const c = w.citizens[s.people[0]];
    if (c && s.param && !c.interests.includes(s.param) && c.interests.length < 6) {
      c.interests.push(s.param);
      const ev = logEvent(w, { category: 'daily', people: [c.id], importance: 30, source: s.source, summary: s.title, cause: s.detail, result: `「${s.param}」が新しい趣味になった` });
      remember(w, c, { summary: s.title, eventId: ev.id, people: [], importance: 35, impact: 30 });
    }
    return;
  }
  if (!loc) return;
  const here = s.attendees.map(id => w.citizens[id]).filter(c => c && c.currentLocation === loc.id && c.plan?.arrived);
  if (s.type === 'meetup') {
    if (here.length >= 2) {
      const [a, b] = here;
      const ev = converse(w, a, b, getRel(w, a.id, b.id), 'plan');
      ev.summary = `${s.title}（${loc.name}）`;
      ev.cause = s.detail; ev.source = s.source; ev.importance = Math.max(ev.importance, 38);
    } else if (here.length === 0) {
      /* nobody arrived in time */
    }
    return;
  }
  // festival
  const ev = logEvent(w, {
    category: 'sudden', locationId: loc.id, people: here.map(c => c.id), importance: 58, historic: true, source: s.source,
    summary: `${s.title}が${loc.name}で始まった`, cause: s.detail, result: `${here.length}人が集まった`,
  });
  for (const c of here) { boost(c, 25); remember(w, c, { summary: `${s.title}に参加した`, eventId: ev.id, locationId: loc.id, people: here.slice(0, 4).map(x => x.id), importance: 55, impact: 55 }); }
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
    if (!chance(w, 0.25)) continue;
    const r = getRel(w, here[i].id, here[j].id);
    r.familiarity = clamp(r.familiarity + 3); r.friendship = clamp(r.friendship + 1); r.meetings++;
  }
}
