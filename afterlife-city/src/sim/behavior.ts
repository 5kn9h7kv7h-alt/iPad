// Citizen behaviour: plain code (no AI calls). Priorities follow the spec:
// needs > personality > routine > location > relationships > environment > memories.
import { chance, clamp, rand, randInt } from './rng';
import { dateOf, dayOf, minuteOfDay } from './clock';
import { INTEREST_PLACES } from './world';
import { isOutdoor, routeTo } from './paths';
import { relKey } from './world';
import {
  ACTIVITY_LABEL, MINUTES_PER_DAY,
  type Activity, type Building, type BuildingKind, type Citizen, type Mood, type Plan, type WorldState,
} from './types';

export const WALK_SPEED = 22; // world units per sim minute

// ---------------------------------------------------------------- helpers
export function isOpenAt(b: Building, t: number, margin = 0): boolean {
  if (b.status !== 'open') return false;
  if (!b.hours) return true;
  const h = minuteOfDay(t) / 60;
  const [o, c] = b.hours;
  return h >= o && h + margin / 60 < c;
}

export const buildingOf = (w: WorldState, c: Citizen): Building | null => w.buildings[c.currentLocation] ?? null;

export function inSleepWindow(c: Citizen, mod: number): boolean {
  const bed = c.dailyRoutine.bed % MINUTES_PER_DAY, wake = c.dailyRoutine.wake;
  return bed > wake ? mod >= bed || mod < wake : mod >= bed && mod < wake;
}

export function mealSlot(h: number): 0 | 1 | 2 { return h < 10.5 ? 0 : h < 16 ? 1 : 2; }

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function weightedPick<T>(w: WorldState, items: { item: T; weight: number }[]): T | null {
  let total = 0;
  for (const i of items) total += Math.max(0, i.weight);
  if (total <= 0) return null;
  let r = rand(w) * total;
  for (const i of items) { r -= Math.max(0, i.weight); if (r <= 0) return i.item; }
  return items[items.length - 1].item;
}

export function propAppeal(w: WorldState, b: Building, night: boolean): number {
  let a = 1;
  for (const p of w.props) {
    if (p.buildingId !== b.id) continue;
    if (p.kind === 'bench') a += 0.18;
    else if (p.kind === 'plant') a += 0.06;
    else if (p.kind === 'streetlight') a += night ? 0.22 : 0.03;
    else if (p.kind === 'playground') a += 0.14;
  }
  return Math.min(a, 2.2);
}

function memoryBias(c: Citizen, buildingId: string): number {
  let s = 0;
  for (const m of c.memories) if (m.locationId === buildingId) s += m.emotionalImpact * (m.importance / 100);
  return clamp(s / 100, -0.6, 0.6);
}

/** Choose a destination among kinds; open, near, novel, liked, with props. */
export function chooseBuilding(
  w: WorldState, c: Citizen, kinds: BuildingKind[], margin = 30, exclude?: string,
): Building | null {
  const night = w.env.daylight < 0.25;
  const cands: { item: Building; weight: number }[] = [];
  const from = buildingOf(w, c);
  const fx = from ? from.x : c.x, fz = from ? from.z : c.z;
  for (const b of Object.values(w.buildings)) {
    if (!kinds.includes(b.kind) || b.id === exclude || !isOpenAt(b, w.time, margin)) continue;
    const d = dist(fx, fz, b.x, b.z);
    let wt = 1 / (1 + d / 45);
    const v = c.visits[b.id] ?? 0;
    wt *= 1 + (c.personality.curiosity / 100) * (v === 0 ? 0.8 : v < 3 ? 0.3 : 0);
    wt *= 1 + memoryBias(c, b.id);
    wt *= propAppeal(w, b, night);
    cands.push({ item: b, weight: wt });
  }
  return weightedPick(w, cands);
}

function weatherOutdoorFactor(w: WorldState): number {
  const e = w.env;
  let f = e.weather === 'clear' ? 1.25 : e.weather === 'cloudy' ? 1 : e.weather === 'fog' ? 0.8 : 0.3;
  if (e.temperature < 6) f *= 0.55;
  else if (e.temperature < 11) f *= 0.8;
  if (e.temperature > 30) f *= 0.7;
  if (e.daylight < 0.2) f *= 0.5;
  return f;
}

const clampDur = (n: number) => Math.max(10, Math.round(n));

// ---------------------------------------------------------------- planning
export function startPlan(w: WorldState, c: Citizen, plan: Omit<Plan, 'until' | 'arrived'>): void {
  const full: Plan = { ...plan, until: 0, arrived: false };
  c.plan = full;
  const dest = w.buildings[plan.buildingId];
  if (!dest) { c.plan = null; return; }
  if (c.currentLocation === dest.id) {
    arrive(w, c);
    return;
  }
  const from = buildingOf(w, c);
  c.path = routeTo(w, c.x, c.z, from, dest, rand(w), rand(w));
  c.activity = 'commute';
  c.currentLocation = 'street';
}

function arrive(w: WorldState, c: Citizen): void {
  const plan = c.plan!;
  const b = w.buildings[plan.buildingId];
  plan.arrived = true;
  plan.until = plan.endAt ?? w.time + plan.duration;
  c.currentLocation = b.id;
  c.activity = plan.activity;
  c.path = [];
  if (!isOutdoor(b)) { c.x = b.x; c.z = b.z; }
  c.visits[b.id] = (c.visits[b.id] ?? 0) + 1;
  if (plan.activity === 'eat') {
    const slot = mealSlot((minuteOfDay(w.time)) / 60);
    c.ateAt.push(dayOf(w.time) * 10 + slot);
    if (c.ateAt.length > 12) c.ateAt.shift();
  }
  if (plan.activity === 'work') c.worked = dayOf(w.time);
  note(c, w.time, actionText(plan.activity, b, c));
}

function actionText(a: Activity, b: Building, c: Citizen): string {
  const home = b.id === c.homeId;
  switch (a) {
    case 'sleep': return '眠りについた';
    case 'wake': return '起床した';
    case 'eat': return home ? '自宅で食事をした' : `${b.name}で食事をした`;
    case 'work': return `${b.name}で仕事を始めた`;
    case 'shop': return `${b.name}で買い物をした`;
    case 'stroll': return `${b.name}を散歩した`;
    case 'rest': return home ? '自宅で休憩した' : `${b.name}で一息ついた`;
    case 'hobby': return `${b.name}で趣味の時間を過ごした`;
    case 'talk': return `${b.name}で人と話そうと立ち寄った`;
    case 'home': return '帰宅した';
    default: return `${b.name}に到着した`;
  }
}

function note(c: Citizen, t: number, text: string): void {
  c.recentActions.unshift({ t, text });
  if (c.recentActions.length > 14) c.recentActions.length = 14;
}

function nextWakeAbs(w: WorldState, c: Citizen): number {
  const mod = minuteOfDay(w.time);
  const base = w.time - mod;
  return mod < c.dailyRoutine.wake ? base + c.dailyRoutine.wake : base + MINUTES_PER_DAY + c.dailyRoutine.wake;
}

export function isWorkDay(w: WorldState, c: Citizen): boolean {
  if (!c.workplaceId) return false;
  const b = w.buildings[c.workplaceId];
  if (!b || b.status !== 'open') return false;
  return !c.offDays.includes(dateOf(w.startDate, w.time).getUTCDay());
}

interface Cand { plan: Omit<Plan, 'until' | 'arrived'>; score: number }

export function decide(w: WorldState, c: Citizen): void {
  const t = w.time, mod = minuteOfDay(t), h = mod / 60, day = dayOf(t);
  const r = c.dailyRoutine, P = c.personality, N = c.needs;
  const home = w.buildings[c.homeId];

  // 1. sleep
  if (inSleepWindow(c, mod)) {
    startPlan(w, c, { activity: 'sleep', buildingId: home.id, duration: 0, endAt: nextWakeAbs(w, c) });
    return;
  }
  // 2. breakfast right after waking
  const slot = mealSlot(h);
  const ate = (s: number) => c.ateAt.includes(day * 10 + s);
  if (mod < r.wake + 120 && !ate(0) && c.currentLocation === home.id) {
    startPlan(w, c, { activity: 'eat', buildingId: home.id, duration: clampDur(20 + rand(w) * 10) });
    return;
  }
  // 3. work
  const working = isWorkDay(w, c) && mod >= r.leaveHome && mod < r.workEnd;
  const cands: Cand[] = [];
  if (working) {
    const wp = w.buildings[c.workplaceId!];
    const end = t - mod + r.workEnd;
    const hungryNoon = !ate(1) && h > 11.4 && h < 14.6 && N.hunger < 45;
    if (!hungryNoon || c.currentLocation !== wp.id) {
      startPlan(w, c, { activity: 'work', buildingId: wp.id, duration: 0, endAt: Math.min(end, t + 150) });
      return;
    }
    // lunch break near the workplace
    const place = chooseBuilding(w, c, ['restaurant', 'cafe', 'convenience', 'market'], 40);
    startPlan(w, c, { activity: 'eat', buildingId: (place ?? wp).id, duration: clampDur(30 + rand(w) * 15) });
    return;
  }

  // 4. free time candidates
  const outdoor = weatherOutdoorFactor(w);
  const night = w.env.daylight < 0.25;
  const social = P.sociability / 100;
  const goal = c.goalId;

  // eat
  {
    const inWin = (h >= 7 && h < 9.5) || (h >= 11.5 && h < 14) || (h >= 17.5 && h < 21);
    const already = ate(slot);
    const drive = 100 - N.hunger;
    const score = (already && N.hunger > 30 ? 0 : drive * (inWin ? 1.5 : 0.4)) * 1.1;
    if (score > 8) {
      const goOut = N.hunger > 25 && chance(w, 0.22 + social * 0.35 + (goal === 'family' ? -0.15 : 0));
      const place = goOut ? chooseBuilding(w, c, ['restaurant', 'cafe', 'convenience', 'market'], 40) : null;
      cands.push({ plan: { activity: 'eat', buildingId: (place ?? home).id, duration: clampDur(place ? 35 + rand(w) * 25 : 25 + rand(w) * 15) }, score });
    }
  }
  // shop
  if (h > 9 && h < 19.5) {
    const b = chooseBuilding(w, c, ['shop', 'market', 'convenience'], 25);
    if (b) cands.push({ plan: { activity: 'shop', buildingId: b.id, duration: clampDur(15 + rand(w) * 20) }, score: (10 + (N.hunger < 60 ? 10 : 0)) * (w.env.weather === 'rain' ? 0.7 : 1) });
  }
  // stroll
  {
    const b = chooseBuilding(w, c, ['plaza', 'park', 'beach', 'lookout'], 0);
    if (b) {
      let s = (P.activity * 0.3 + P.curiosity * 0.14 + (100 - N.fun) * 0.2 + (goal === 'explore' ? 12 : 0) + (goal === 'know_sea' && (b.kind === 'beach' || b.kind === 'lookout') ? 14 : 0)) * outdoor;
      if (b.kind === 'beach' && w.env.weather === 'clear') s *= 1.25;
      cands.push({ plan: { activity: 'stroll', buildingId: b.id, duration: clampDur(30 + rand(w) * 50) }, score: s });
    }
  }
  // rest
  {
    const toHome = chance(w, 0.35);
    const b = toHome ? home : chooseBuilding(w, c, ['cafe', 'park', 'plaza'], 25);
    if (b) cands.push({ plan: { activity: 'rest', buildingId: b.id, duration: clampDur(20 + rand(w) * 35) }, score: (100 - N.energy) * 0.45 + 8 });
  }
  // hobby
  {
    const interest = c.interests[randInt(w, 0, c.interests.length - 1)];
    const kinds = INTEREST_PLACES[interest] ?? ['plaza'];
    const b = chooseBuilding(w, c, kinds, 30);
    if (b) {
      let s = (100 - N.fun) * 0.55 + P.openness * 0.12 + (goal === 'own_work' ? 12 : 0);
      if (isOutdoor(b)) s *= outdoor;
      if (interest === '星空' && night && b.kind === 'lookout') s += 25;
      cands.push({ plan: { activity: 'hobby', buildingId: b.id, duration: clampDur(40 + rand(w) * 70) }, score: s });
    }
  }
  // socialise: go where someone I know is
  if (h > 9 && h < 22) {
    const target = findCompany(w, c);
    if (target) {
      const s = (100 - N.social) * 0.7 * (0.5 + social) + (goal === 'make_friends' ? 14 : 0) + target.weight * 10;
      cands.push({ plan: { activity: 'talk', buildingId: target.building.id, duration: clampDur(30 + rand(w) * 30) }, score: s });
    }
  }
  // go home
  {
    let s = 6 + (h >= 18 ? 24 : 0) + (h >= 20 ? 28 : 0) + (w.env.weather === 'rain' ? 10 : 0)
      + (w.env.temperature < 7 && h >= 16 ? 16 : 0) + (N.energy < 30 ? 22 : 0) + (goal === 'family' && h >= 17 ? 12 : 0);
    if (c.currentLocation === home.id) s += 10; // already there: cosy inertia
    cands.push({ plan: { activity: 'home', buildingId: home.id, duration: clampDur(45 + rand(w) * 50) }, score: s });
  }

  const picked = weightedPick(w, cands.map(x => ({ item: x, weight: Math.pow(Math.max(1, x.score) * (0.8 + rand(w) * 0.4), 1.6) })));
  if (!picked) {
    startPlan(w, c, { activity: 'home', buildingId: home.id, duration: 60 });
    return;
  }
  startPlan(w, c, picked.plan);
}

/** Find a building where a known person currently is. */
function findCompany(w: WorldState, c: Citizen): { building: Building; weight: number } | null {
  const scores = new Map<string, number>();
  for (const o of Object.values(w.citizens)) {
    if (o.id === c.id || o.movedOutAt !== undefined) continue;
    const b = w.buildings[o.currentLocation];
    if (!b || b.isHome || !o.plan?.arrived || o.activity === 'sleep' || o.activity === 'work') continue;
    if (!isOpenAt(b, w.time, 20)) continue;
    const rel = w.relationships[relKey(c.id, o.id)];
    if (!rel || rel.tension > 55) continue;
    const aff = (rel.familiarity * 0.4 + rel.friendship * 0.6) / 100;
    scores.set(b.id, (scores.get(b.id) ?? 0) + aff);
  }
  let best: Building | null = null, bw = 0;
  for (const [id, wt] of scores) if (wt > bw) { bw = wt; best = w.buildings[id]; }
  return best && bw > 0.15 ? { building: best, weight: Math.min(bw, 1.5) } : null;
}

// ---------------------------------------------------------------- per-minute step
export function stepCitizen(w: WorldState, c: Citizen): void {
  if (c.movedOutAt !== undefined) return;
  const t = w.time;
  updateNeeds(c);
  if (t % 10 === c.lifeEvents.length % 10) updateMood(w, c);

  if (c.plan && !c.plan.arrived) {
    move(w, c);
    return;
  }
  if (c.plan?.arrived) {
    const b = w.buildings[c.plan.buildingId];
    const closed = b && !b.isHome && c.plan.activity !== 'work' && c.plan.activity !== 'sleep' && (b.status !== 'open' || !isOpenAt(b, t));
    if (t >= c.plan.until || closed) c.plan = null;
    else return;
  }
  decide(w, c);
}

function move(w: WorldState, c: Citizen): void {
  let budget = WALK_SPEED * (w.env.weather === 'rain' ? 0.85 : 1) * (0.85 + c.personality.activity / 300);
  while (budget > 0 && c.path.length) {
    const p = c.path[0];
    const d = dist(c.x, c.z, p.x, p.z);
    if (d <= budget) { c.x = p.x; c.z = p.z; budget -= d; c.path.shift(); }
    else { c.x += ((p.x - c.x) / d) * budget; c.z += ((p.z - c.z) / d) * budget; budget = 0; }
  }
  if (!c.path.length) arrive(w, c);
}

function updateNeeds(c: Citizen): void {
  const n = c.needs;
  let dE = -0.06, dH = -0.13, dS = -0.04, dF = -0.04;
  switch (c.activity) {
    case 'sleep': dE = 0.3; dH = -0.04; dS = -0.01; dF = 0; break;
    case 'eat': dH = 2.4; dF += 0.12; dS += 0.05; break;
    case 'rest': dE = 0.16; dF += 0.05; break;
    case 'hobby': dF = 0.75; dE = -0.04; break;
    case 'stroll': dF = 0.3; dE = -0.1; break;
    case 'talk': dS = 0.7; dF += 0.2; break;
    case 'work': dE = -0.1; dF = -0.06; dS = 0.03; break;
    case 'shop': dF += 0.1; break;
    case 'home': dE = 0.05; dS += 0.03; break;
  }
  n.energy = clamp(n.energy + dE); n.hunger = clamp(n.hunger + dH);
  n.social = clamp(n.social + dS); n.fun = clamp(n.fun + dF);
}

export function updateMood(w: WorldState, c: Citizen): Mood {
  const n = c.needs;
  const mood: Mood =
    n.energy < 25 ? 'tired'
      : (c.irritatedUntil ?? 0) > w.time ? 'irritated'
        : n.social < 22 ? 'lonely'
          : (n.energy + n.hunger + n.social + n.fun) / 4 > 72 ? 'cheerful'
            : (n.energy + n.hunger + n.social + n.fun) / 4 > 54 ? 'content' : 'calm';
  c.currentMood = mood;
  return mood;
}

export function describeNow(w: WorldState, c: Citizen): string {
  const b = w.buildings[c.currentLocation];
  if (c.activity === 'commute') {
    const d = c.plan ? w.buildings[c.plan.buildingId] : null;
    return d ? `${d.name}へ向かっている` : '移動中';
  }
  return b ? `${b.name}で${ACTIVITY_LABEL[c.activity]}` : ACTIVITY_LABEL[c.activity];
}
