import { rand, randInt, pick, clamp } from './rng';
import { hm, seasonOf } from './clock';
import { initialEnvironment, updateEnvironment } from './environment';
import type {
  AreaId, Building, BuildingKind, Citizen, Lot, Personality, RoadNode, Routine, WorldState,
} from './types';

// ---------------------------------------------------------------- road graph
const COLS = [-60, -40, -20, 10, 35, 60];
const ROWS = [-30, 0, 30];
const nid = (x: number, z: number) => `n_${x}_${z}`;

export function buildRoads(): Record<string, RoadNode> {
  const nodes: Record<string, RoadNode> = {};
  for (const z of ROWS) {
    for (const x of COLS) {
      if (z === -30 && x === -60) continue; // north street starts at x=-40
      nodes[nid(x, z)] = { id: nid(x, z), x, z, links: [] };
    }
  }
  const link = (a: string, b: string) => {
    if (!nodes[a] || !nodes[b]) return;
    nodes[a].links.push(b); nodes[b].links.push(a);
  };
  for (const z of ROWS) for (let i = 0; i < COLS.length - 1; i++) link(nid(COLS[i], z), nid(COLS[i + 1], z));
  for (const x of COLS) for (let j = 0; j < ROWS.length - 1; j++) link(nid(x, ROWS[j]), nid(x, ROWS[j + 1]));
  return nodes;
}

// ---------------------------------------------------------------- buildings
interface BSpec {
  id: string; name: string; kind: BuildingKind; area: AreaId;
  x: number; z: number; w: number; d: number; h: number;
  node: [number, number]; hours: [number, number] | null;
}
const B = (
  id: string, name: string, kind: BuildingKind, area: AreaId,
  x: number, z: number, w: number, d: number, h: number,
  node: [number, number], hours: [number, number] | null = null,
): BSpec => ({ id, name, kind, area, x, z, w, d, h, node, hours });

export const BUILDING_SPECS: BSpec[] = [
  // STATION
  B('b_station', 'ルミエール・ベイ駅', 'station', 'station', -28, -46, 16, 10, 6, [-20, -30], [5, 24]),
  B('b_conv', 'ベイマート 駅前店', 'convenience', 'station', -50, -42, 8, 7, 4, [-40, -30], [0, 24]),
  B('b_eatery', '駅前食堂 みなと', 'restaurant', 'station', -4, -42, 10, 8, 5, [10, -30], [7, 21]),
  B('b_plaza', '駅前広場', 'plaza', 'station', -31, -35, 14, 5, 0.2, [-20, -30], null),
  // RESIDENTIAL
  B('b_house1', '佐藤邸', 'house', 'residential', 22, -48, 10, 9, 5, [10, -30]),
  B('b_house2', '田中邸', 'house', 'residential', 46, -52, 10, 9, 5, [35, -30]),
  B('b_house3', '鈴木邸', 'house', 'residential', 72, -44, 10, 9, 5, [60, -30]),
  B('b_house4', '高橋邸', 'house', 'residential', 22, -14, 10, 9, 5, [10, 0]),
  B('b_apt1', 'リバーサイド荘', 'apartment', 'residential', 48, -14, 12, 10, 12, [35, 0]),
  B('b_apt2', 'ハイツ・ミドリ', 'apartment', 'residential', 72, -14, 12, 10, 12, [60, 0]),
  B('b_park', 'なかよし公園', 'park', 'residential', 46, -37, 16, 8, 0.2, [35, -30], null),
  // OLD TOWN
  B('b_cafe', 'カフェ・ルナ', 'cafe', 'oldtown', -50, -9, 9, 7, 4, [-40, 0], [8, 19]),
  B('b_books', '渡辺古書店', 'bookstore', 'oldtown', -30, -9, 9, 7, 4, [-20, 0], [10, 18]),
  B('b_izakaya', '小料理 はる', 'restaurant', 'oldtown', -68, -9, 9, 7, 4, [-60, 0], [11, 22]),
  B('b_shop', '鈴木商店', 'shop', 'oldtown', -50, 9, 10, 7, 4, [-40, 0], [9, 18]),
  B('b_oldhouse', '渡辺邸', 'house', 'oldtown', -30, 9, 9, 7, 4, [-20, 0]),
  B('b_apt3', 'コーポ旧市街', 'apartment', 'oldtown', -69, 9, 10, 9, 10, [-60, 0]),
  // HARBOR
  B('b_fishery', 'ルミエール漁港', 'fishery', 'harbor', -66, 41, 12, 8, 4, [-60, 30], [4, 16]),
  B('b_warehouse', '第二倉庫', 'warehouse', 'harbor', -48, 42, 12, 9, 6, [-40, 30], [7, 18]),
  B('b_market', '朝市場', 'market', 'harbor', -30, 41, 12, 8, 4, [-20, 30], [5, 15]),
  B('b_office', '港湾事務所', 'office', 'harbor', -72, 20, 10, 8, 5, [-60, 30], [8, 17]),
  B('b_promenade', '海沿いの遊歩道', 'plaza', 'harbor', -42, 47, 36, 3, 0.2, [-40, 30], null),
  // SEASIDE
  B('b_seacafe', 'カフェ・マレ', 'cafe', 'seaside', 22, 40, 10, 8, 4, [10, 30], [9, 20]),
  B('b_beach', 'ルミエール海岸', 'beach', 'seaside', 38, 49, 40, 6, 0.2, [35, 30], null),
  B('b_lookout', '灯台の展望台', 'lookout', 'seaside', 67, 42, 8, 8, 9, [60, 30], null),
  B('b_aquarium', 'ベイ水族館', 'tourist', 'seaside', 49, 38, 14, 8, 6, [35, 30], [9, 17]),
];

export const LOT_SPECS: Lot[] = [
  { id: 'lot_old', area: 'oldtown', x: -30, z: 22, w: 10, d: 8, nodeId: nid(-20, 30), used: false },
  { id: 'lot_sea', area: 'seaside', x: 25, z: 16, w: 10, d: 8, nodeId: nid(10, 30), used: false },
  { id: 'lot_res', area: 'residential', x: 72, z: 14, w: 10, d: 8, nodeId: nid(60, 0), used: false },
  { id: 'lot_stn', area: 'station', x: -8, z: -20, w: 10, d: 8, nodeId: nid(-20, 0), used: false },
];

export function makeBuilding(s: BSpec, builtAt = 0): Building {
  return {
    id: s.id, name: s.name, kind: s.kind, area: s.area, x: s.x, z: s.z, w: s.w, d: s.d, h: s.h,
    isHome: s.kind === 'house' || s.kind === 'apartment', hours: s.hours, status: 'open', builtAt,
    nodeId: nid(s.node[0], s.node[1]), tint: ((s.x * 7 + s.z * 13) % 10 + 10) % 10 / 10,
  };
}

// ---------------------------------------------------------------- citizens
export const INTERESTS = [
  '読書', '釣り', '写真', '散歩', '音楽', '料理', '絵', '海', 'カフェ巡り', '園芸', '将棋', '映画', 'ランニング', '星空',
] as const;

/** Which places each interest draws a person to. */
export const INTEREST_PLACES: Record<string, BuildingKind[]> = {
  読書: ['bookstore', 'cafe', 'park'], 釣り: ['fishery', 'plaza', 'beach'], 写真: ['lookout', 'beach', 'plaza'],
  散歩: ['plaza', 'park', 'beach'], 音楽: ['plaza', 'park', 'cafe'], 料理: ['market', 'shop', 'restaurant'],
  絵: ['lookout', 'beach', 'park'], 海: ['beach', 'lookout', 'plaza'], カフェ巡り: ['cafe', 'cafe', 'restaurant'],
  園芸: ['park', 'shop', 'park'], 将棋: ['plaza', 'bookstore', 'cafe'], 映画: ['tourist', 'cafe', 'plaza'],
  ランニング: ['plaza', 'beach', 'park'], 星空: ['lookout', 'beach', 'lookout'],
};

export const GOALS: { id: string; text: string }[] = [
  { id: 'make_friends', text: '新しい友人をつくる' },
  { id: 'master_craft', text: '仕事の腕を磨く' },
  { id: 'explore', text: '街の知らない場所を訪ねる' },
  { id: 'family', text: '家族との時間を大切にする' },
  { id: 'quiet_life', text: '穏やかな毎日を守る' },
  { id: 'own_work', text: '自分の作品を完成させる' },
  { id: 'know_sea', text: '海のことをもっと知る' },
];

type Shift = 'day' | 'early' | 'late' | 'shop' | 'none';
export interface CSpec {
  name: string; age: number; gender: 'f' | 'm' | 'x'; occupation: string;
  home: string; work: string | null; shift: Shift; goal?: string; likes?: string[];
}
const C = (
  name: string, age: number, gender: 'f' | 'm' | 'x', occupation: string, home: string,
  work: string | null, shift: Shift, goal?: string, likes?: string[],
): CSpec => ({ name, age, gender, occupation, home, work, shift, goal, likes });

export const CITIZEN_SPECS: CSpec[] = [
  C('佐藤 健一', 52, 'm', '港湾職員', 'b_house1', 'b_office', 'day', 'master_craft', ['釣り', '将棋']),
  C('佐藤 美和', 49, 'f', 'カフェ店主', 'b_house1', 'b_cafe', 'shop', 'family', ['カフェ巡り', '園芸']),
  C('佐藤 蓮', 24, 'm', '漁師', 'b_house1', 'b_fishery', 'early', 'know_sea', ['釣り', '海']),
  C('佐藤 葵', 21, 'f', '水族館飼育員', 'b_house1', 'b_aquarium', 'day', 'make_friends', ['海', '写真']),
  C('田中 誠', 45, 'm', '料理人', 'b_house2', 'b_izakaya', 'late', 'master_craft', ['料理', '釣り']),
  C('田中 由紀', 43, 'f', '市場の売り手', 'b_house2', 'b_market', 'early', 'family', ['料理', '園芸']),
  C('田中 大地', 19, 'm', 'コンビニ店員', 'b_house2', 'b_conv', 'late', 'explore', ['音楽', 'ランニング']),
  C('鈴木 浩', 58, 'm', '漁師', 'b_house3', 'b_fishery', 'early', 'quiet_life', ['釣り', '将棋']),
  C('鈴木 恵子', 55, 'f', '商店主', 'b_house3', 'b_shop', 'shop', 'quiet_life', ['園芸', '読書']),
  C('鈴木 海斗', 27, 'm', '倉庫作業員', 'b_house3', 'b_warehouse', 'day', 'make_friends', ['ランニング', '映画']),
  C('高橋 理沙', 34, 'f', '作家', 'b_house4', null, 'none', 'own_work', ['読書', 'カフェ巡り']),
  C('高橋 拓也', 36, 'm', '駅員', 'b_house4', 'b_station', 'early', 'family', ['映画', '星空']),
  C('渡辺 源蔵', 74, 'm', '古書店主', 'b_oldhouse', 'b_books', 'shop', 'quiet_life', ['読書', '将棋']),
  C('渡辺 ハル', 71, 'f', '退職者', 'b_oldhouse', null, 'none', 'family', ['園芸', '散歩']),
  C('小林 優', 28, 'f', '食堂の料理人', 'b_apt1', 'b_eatery', 'early', 'master_craft', ['料理', '音楽']),
  C('加藤 翔', 31, 'm', '倉庫作業員', 'b_apt1', 'b_warehouse', 'day', 'explore', ['ランニング', '写真']),
  C('吉田 彩', 26, 'f', 'コンビニ店員', 'b_apt1', 'b_conv', 'early', 'make_friends', ['映画', 'カフェ巡り']),
  C('山本 隆', 40, 'm', '駅員', 'b_apt1', 'b_station', 'late', 'quiet_life', ['将棋', '釣り']),
  C('中村 沙織', 29, 'f', '画家', 'b_apt1', null, 'none', 'own_work', ['絵', '海']),
  C('井上 剛', 47, 'm', '市場の売り手', 'b_apt1', 'b_market', 'early', 'master_craft', ['料理', '釣り']),
  C('木村 真央', 23, 'f', 'カフェ店員', 'b_apt2', 'b_seacafe', 'shop', 'make_friends', ['カフェ巡り', '音楽']),
  C('林 悠斗', 25, 'm', 'カフェ店員', 'b_apt2', 'b_seacafe', 'late', 'explore', ['音楽', '星空']),
  C('清水 玲奈', 33, 'f', '港湾職員', 'b_apt2', 'b_office', 'day', 'master_craft', ['読書', 'ランニング']),
  C('森 圭', 38, 'm', '観光ガイド', 'b_apt2', 'b_aquarium', 'day', 'know_sea', ['海', '写真']),
  C('斎藤 美咲', 30, 'f', '翻訳家', 'b_apt2', null, 'none', 'own_work', ['読書', '映画']),
  C('山口 悟', 62, 'm', '漁師', 'b_apt3', 'b_fishery', 'early', 'quiet_life', ['釣り', '海']),
  C('松本 千夏', 22, 'f', '食堂のホール係', 'b_apt3', 'b_eatery', 'late', 'make_friends', ['音楽', '映画']),
  C('福田 洋平', 35, 'm', '倉庫作業員', 'b_apt3', 'b_warehouse', 'day', 'family', ['ランニング', '料理']),
  C('石川 あかり', 27, 'f', '古書店アルバイト', 'b_apt3', 'b_books', 'shop', 'explore', ['読書', '絵']),
  C('橋本 陸', 41, 'm', '写真家', 'b_apt3', null, 'none', 'own_work', ['写真', '星空']),
];

function routineFor(shift: Shift, w: { rngState: number }, age: number): Routine {
  const jitter = () => randInt(w, -15, 15);
  switch (shift) {
    case 'early': return { wake: hm(4, 30) + jitter(), leaveHome: hm(5, 15) + jitter(), workStart: hm(6), workEnd: hm(14), bed: hm(21, 30) + jitter() };
    case 'late': return { wake: hm(9, 30) + jitter(), leaveHome: hm(12, 15) + jitter(), workStart: hm(13), workEnd: hm(21), bed: hm(24, 0) + jitter() };
    case 'shop': return { wake: hm(7) + jitter(), leaveHome: hm(8, 10) + jitter(), workStart: hm(9), workEnd: hm(17, 30), bed: hm(22, 30) + jitter() };
    case 'day': return { wake: hm(6, 30) + jitter(), leaveHome: hm(7, 30) + jitter(), workStart: hm(8, 30), workEnd: hm(17), bed: hm(23) + jitter() };
    default: return age > 65
      ? { wake: hm(6) + jitter(), leaveHome: hm(9), workStart: 0, workEnd: 0, bed: hm(21, 30) + jitter() }
      : { wake: hm(8, 30) + jitter(), leaveHome: hm(10), workStart: 0, workEnd: 0, bed: hm(24, 30) + jitter() };
  }
}

function personalityFor(w: { rngState: number }, spec: CSpec): Personality {
  const base = () => randInt(w, 20, 85);
  const p: Personality = { sociability: base(), curiosity: base(), patience: base(), activity: base(), openness: base() };
  if (/店主|カフェ|ホール|ガイド|売り手|コンビニ/.test(spec.occupation)) p.sociability = clamp(p.sociability + 12);
  if (/作家|画家|翻訳|写真/.test(spec.occupation)) { p.curiosity = clamp(p.curiosity + 14); p.sociability = clamp(p.sociability - 10); }
  if (spec.age > 60) { p.activity = clamp(p.activity - 15); p.patience = clamp(p.patience + 15); }
  if (spec.age < 28) p.openness = clamp(p.openness + 10);
  return p;
}

function bioFor(spec: CSpec, p: Personality): string {
  const traits: string[] = [];
  if (p.sociability > 68) traits.push('人づきあいが好きで');
  else if (p.sociability < 38) traits.push('一人の時間を大事にしていて');
  if (p.curiosity > 68) traits.push('好奇心が強く');
  if (p.patience > 68) traits.push('辛抱強く');
  if (p.activity > 68) traits.push('じっとしていられない性分で');
  if (!traits.length) traits.push('これといって目立たないが芯があり');
  return `${spec.age}歳。${spec.occupation}。${traits.join('、')}、${spec.likes?.[0] ?? '散歩'}が好き。`;
}

export function createCitizen(w: WorldState, spec: CSpec, index: number): Citizen {
  const personality = personalityFor(w, spec);
  const goal = GOALS.find(g => g.id === spec.goal) ?? pick(w, GOALS);
  const home = w.buildings[spec.home];
  const interests = [...(spec.likes ?? [])];
  while (interests.length < 3) { const i = pick(w, INTERESTS); if (!interests.includes(i)) interests.push(i); }
  const c: Citizen = {
    id: `c_${String(index + 1).padStart(2, '0')}`,
    name: spec.name, age: spec.age, gender: spec.gender, occupation: spec.occupation,
    homeId: spec.home, workplaceId: spec.work,
    personality, interests, dailyRoutine: routineFor(spec.shift, w, spec.age),
    currentMood: 'calm', currentLocation: spec.home, currentGoal: goal.text, goalId: goal.id,
    needs: { energy: randInt(w, 60, 95), hunger: randInt(w, 50, 90), social: randInt(w, 40, 80), fun: randInt(w, 40, 80) },
    look: { skin: randInt(w, 0, 3), hair: randInt(w, 0, 5), top: randInt(w, 0, 9), bottom: randInt(w, 0, 4), height: 0.92 + rand(w) * 0.16 },
    bio: bioFor(spec, personality),
    movedInAt: 0,
    x: home.x, z: home.z, plan: null, path: [], activity: 'sleep', lastTalkAt: -9999,
    recentActions: [], ateAt: [], worked: -1, offDays: spec.shift === 'day' ? [0, 6] : [(index * 3) % 7, (index * 3 + 1) % 7], visits: {}, memories: [], lifeEvents: [],
  };
  return c;
}

export const relKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function mkRel(w: WorldState, a: Citizen, b: Citizen, kind: 'family' | 'coworker' | 'neighbor' | 'acquaintance'): void {
  const key = relKey(a.id, b.id);
  if (w.relationships[key]) return;
  const [aId, bId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const base = kind === 'family' ? 60 : kind === 'coworker' ? 35 : kind === 'neighbor' ? 25 : 12;
  const shared = a.interests.find(i => b.interests.includes(i)) ?? null;
  w.relationships[key] = {
    aId, bId, kind,
    familiarity: base + randInt(w, 0, 15),
    friendship: kind === 'family' ? 55 + randInt(w, 0, 15) : Math.max(0, base - 12) + randInt(w, 0, 10),
    trust: kind === 'family' ? 60 : Math.max(5, base - 5),
    affection: kind === 'family' ? 55 : Math.max(0, base - 20),
    tension: kind === 'family' ? randInt(w, 0, 12) : randInt(w, 0, 6),
    lastMetAt: 0, meetings: 0, sharedInterest: shared,
  };
}

/** Initial ties for one citizen toward everybody else already in town. */
export function seedRelationshipsFor(w: WorldState, c: Citizen, randomCount = 3): void {
  const others = Object.values(w.citizens).filter(o => o.id !== c.id && o.movedOutAt === undefined);
  for (const o of others) {
    if (o.homeId === c.homeId && o.name.split(' ')[0] === c.name.split(' ')[0]) mkRel(w, c, o, 'family');
    else if (c.workplaceId && c.workplaceId === o.workplaceId) mkRel(w, c, o, 'coworker');
    else if (o.homeId === c.homeId) mkRel(w, c, o, 'neighbor');
  }
  for (let i = 0; i < randomCount && others.length; i++) mkRel(w, c, pick(w, others), 'acquaintance');
}

export function createWorld(seed = 20260401, startDate = '2026-04-01'): WorldState {
  const w: WorldState = {
    version: 1, seed, rngState: seed >>> 0, time: hm(5, 30), startDate,
    buildings: {}, nodes: buildRoads(), lots: LOT_SPECS.map(l => ({ ...l })), props: [],
    citizens: {}, relationships: {}, events: [], scheduled: [], construction: [],
    env: initialEnvironment(startDate, hm(5, 30)),
    counters: { event: 0, memory: 0, prop: 0, sched: 0, citizen: 0 }, usedKeys: [],
  };
  for (const s of BUILDING_SPECS) w.buildings[s.id] = makeBuilding(s, 0);
  CITIZEN_SPECS.forEach((spec, i) => { const c = createCitizen(w, spec, i); w.citizens[c.id] = c; w.counters.citizen++; });
  for (const c of Object.values(w.citizens)) seedRelationshipsFor(w, c, 3);
  w.env.season = seasonOf(startDate, w.time);
  updateEnvironment(w);
  w.env.weather = 'clear';
  return w;
}
