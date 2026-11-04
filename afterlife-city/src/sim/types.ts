// AFTERLIFE CITY — core data model. All entities are linked by unique IDs (never by name).

export type AreaId = 'harbor' | 'oldtown' | 'residential' | 'station' | 'seaside';
export const AREA_LABEL: Record<AreaId, string> = {
  harbor: 'HARBOR 港湾地区',
  oldtown: 'OLD TOWN 旧市街',
  residential: 'RESIDENTIAL 住宅地区',
  station: 'STATION 駅前地区',
  seaside: 'SEASIDE 海岸地区',
};

export type BuildingKind =
  | 'house' | 'apartment' | 'cafe' | 'bookstore' | 'restaurant' | 'shop' | 'market'
  | 'warehouse' | 'fishery' | 'station' | 'convenience' | 'park' | 'lookout' | 'beach'
  | 'plaza' | 'tourist' | 'office';

export const KIND_LABEL: Record<BuildingKind, string> = {
  house: '一軒家', apartment: '集合住宅', cafe: 'カフェ', bookstore: '古書店', restaurant: '飲食店',
  shop: '商店', market: '市場', warehouse: '倉庫', fishery: '漁港', station: '駅',
  convenience: 'コンビニ', park: '公園', lookout: '展望台', beach: '海岸', plaza: '広場',
  tourist: '観光施設', office: '事務所',
};

export type BuildingStatus = 'open' | 'closed' | 'planned' | 'demolished';

export interface Building {
  id: string;
  name: string;
  kind: BuildingKind;
  area: AreaId;
  x: number; z: number;       // center (world units ≈ metres)
  w: number; d: number; h: number;
  isHome: boolean;
  /** opening hours [openHour, closeHour) — null means always accessible (outdoor / home) */
  hours: [number, number] | null;
  status: BuildingStatus;
  builtAt: number;            // sim minute
  closedAt?: number;
  nodeId: string;             // road-graph node the entrance connects to
  capacity?: number;          // homes only
  tint: number;               // visual variation 0..1
}

export interface RoadNode { id: string; x: number; z: number; links: string[] }

export interface Prop {
  id: string;
  kind: 'bench' | 'plant' | 'streetlight' | 'playground';
  buildingId: string;         // the place it was added to
  x: number; z: number;
  placedAt: number;
}

export interface Personality {
  sociability: number; curiosity: number; patience: number; activity: number; openness: number;
}

export type Activity =
  | 'sleep' | 'wake' | 'eat' | 'commute' | 'work' | 'shop' | 'stroll'
  | 'rest' | 'hobby' | 'talk' | 'home';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  sleep: '睡眠', wake: '起床', eat: '食事', commute: '移動中', work: '仕事', shop: '買い物',
  stroll: '散歩', rest: '休憩', hobby: '趣味', talk: '会話', home: '帰宅',
};

export interface Routine {
  wake: number;        // minute of day
  leaveHome: number;
  workStart: number;
  workEnd: number;
  bed: number;
}

export interface Needs { energy: number; hunger: number; social: number; fun: number } // 0..100, higher = more satisfied

export type Mood = 'cheerful' | 'content' | 'calm' | 'tired' | 'lonely' | 'irritated';
export const MOOD_LABEL: Record<Mood, string> = {
  cheerful: '上機嫌', content: '満足', calm: '穏やか', tired: '疲れ気味', lonely: '寂しい', irritated: '苛立ち',
};

export interface Look { skin: number; hair: number; top: number; bottom: number; height: number }

export interface Plan {
  activity: Activity;
  buildingId: string;
  /** minutes to stay once arrived (ignored when endAt is set) */
  duration: number;
  /** absolute minute at which the activity should end (e.g. sleep until wake, work until shift end) */
  endAt?: number;
  /** set on arrival: absolute minute when the activity ends */
  until: number;
  arrived: boolean;
  /** set when the plan was caused by a scheduled event / agreed meetup */
  eventId?: string;
}

export interface Citizen {
  id: string;
  name: string;
  age: number;
  occupation: string;
  gender: 'f' | 'm' | 'x';
  homeId: string;
  workplaceId: string | null;
  personality: Personality;
  interests: string[];
  dailyRoutine: Routine;
  currentMood: Mood;
  currentLocation: string;     // building id, or 'street'
  currentGoal: string;
  goalId: string;
  needs: Needs;
  look: Look;
  bio: string;
  movedInAt: number;
  movedOutAt?: number;
  // runtime
  x: number; z: number;
  plan: Plan | null;
  path: { x: number; z: number }[];
  activity: Activity;
  lastTalkAt: number;
  recentActions: { t: number; text: string }[];
  /** per-day marker so meals / work happen once */
  ateAt: number[];
  worked: number;              // last day index worked
  irritatedUntil?: number;
  offDays: number[];           // weekday numbers (0=Sun) when not working
  visits: Record<string, number>; // building id -> visit count (novelty)
  memories: Memory[];
  lifeEvents: string[];        // event ids
}

export interface Relationship {
  aId: string; bId: string;    // aId < bId
  kind: 'family' | 'coworker' | 'neighbor' | 'acquaintance' | 'friend' | 'rival';
  familiarity: number; friendship: number; trust: number; affection: number; tension: number;
  lastMetAt: number;
  meetings: number;
  sharedInterest: string | null;
}

export interface Memory {
  memoryId: string;
  ownerId: string;
  eventId: string | null;
  summary: string;
  locationId?: string | null;
  involvedPeople: string[];
  importance: number;          // 0..100
  emotionalImpact: number;     // -100..100
  createdAt: number;
  summarized?: boolean;
}

export type EventCategory = 'daily' | 'relationship' | 'work' | 'commerce' | 'environment' | 'sudden';
export const CATEGORY_LABEL: Record<EventCategory, string> = {
  daily: '日常', relationship: '人間関係', work: '仕事', commerce: '商業', environment: '環境', sudden: '突発イベント',
};

export interface SimEvent {
  id: string;
  time: number;
  category: EventCategory;
  locationId: string | null;
  people: string[];
  summary: string;
  cause: string;
  result: string;
  related: string[];
  /** significant enough for the city HISTORY screen */
  historic: boolean;
  source: 'sim' | 'ai' | 'player';
  importance: number;
  dialogue?: { speakerId: string; text: string }[];
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog';
export const WEATHER_LABEL: Record<Weather, string> = { clear: '晴れ', cloudy: '曇り', rain: '雨', fog: '霧' };
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export interface Environment {
  weather: Weather;
  nextWeatherAt: number;
  temperature: number;
  wind: number;        // 0..1
  sea: number;         // 0..1 wave height
  season: Season;
  daylight: number;    // 0..1
  lightsOn: boolean;
}

/** An agreed future happening validated by the AI-validation layer, executed by the engine. */
export interface ScheduledEvent {
  id: string;
  type: 'meetup' | 'festival' | 'rumor' | 'hobby';
  startAt: number;
  endAt: number;
  locationId: string | null;
  people: string[];
  title: string;
  detail: string;
  source: 'sim' | 'ai' | 'player';
  done: boolean;
  invited: boolean;
  started: boolean;
  attendees: string[];
  param?: string;
}

export interface PendingConstruction {
  id: string;
  kind: BuildingKind;
  name: string;
  lotId: string;
  readyAt: number;
}

export interface Lot { id: string; area: AreaId; x: number; z: number; w: number; d: number; nodeId: string; used: boolean }

export interface WorldState {
  version: number;
  seed: number;
  rngState: number;
  time: number;               // absolute sim minutes since epoch (epoch = day 0, 00:00)
  startDate: string;          // ISO date for display (calendar of day 0)
  buildings: Record<string, Building>;
  nodes: Record<string, RoadNode>;
  lots: Lot[];
  props: Prop[];
  citizens: Record<string, Citizen>;
  relationships: Record<string, Relationship>;
  events: SimEvent[];
  scheduled: ScheduledEvent[];
  construction: PendingConstruction[];
  env: Environment;
  counters: { event: number; memory: number; prop: number; sched: number; citizen: number };
  /** subjects the AI/sim already used, to avoid repeating the same story */
  usedKeys: string[];
}

export const MINUTES_PER_DAY = 1440;
