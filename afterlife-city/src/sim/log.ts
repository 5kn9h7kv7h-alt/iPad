import { clamp } from './rng';
import type { Citizen, EventCategory, Memory, SimEvent, WorldState } from './types';

export interface EventInput {
  category: EventCategory;
  locationId?: string | null;
  people?: string[];
  summary: string;
  cause?: string;
  result?: string;
  related?: string[];
  historic?: boolean;
  source?: SimEvent['source'];
  importance?: number;
  dialogue?: SimEvent['dialogue'];
}

export function logEvent(w: WorldState, e: EventInput): SimEvent {
  const ev: SimEvent = {
    id: `e_${++w.counters.event}`,
    time: w.time,
    category: e.category,
    locationId: e.locationId ?? null,
    people: e.people ?? [],
    summary: e.summary,
    cause: e.cause ?? '',
    result: e.result ?? '',
    related: e.related ?? [],
    historic: e.historic ?? false,
    source: e.source ?? 'sim',
    importance: e.importance ?? 5,
    dialogue: e.dialogue,
  };
  w.events.push(ev);
  if (ev.importance >= 25 || ev.historic) {
    for (const id of ev.people) w.citizens[id]?.lifeEvents.push(ev.id);
  }
  trimEvents(w);
  return ev;
}

const MAX_EVENTS = 4000;
function trimEvents(w: WorldState): void {
  if (w.events.length <= MAX_EVENTS) return;
  // drop oldest unimportant events first; keep historic / important ones
  const keep: SimEvent[] = [];
  let toDrop = w.events.length - Math.floor(MAX_EVENTS * 0.85);
  for (const ev of w.events) {
    if (toDrop > 0 && !ev.historic && ev.importance < 25) { toDrop--; continue; }
    keep.push(ev);
  }
  w.events = keep;
}

/** Only meaningful events become long-term memories (importance >= 30). */
export const MEMORY_THRESHOLD = 30;

export function remember(
  w: WorldState, owner: Citizen,
  m: { summary: string; eventId?: string | null; locationId?: string | null; people?: string[]; importance: number; impact: number },
): Memory | null {
  if (m.importance < MEMORY_THRESHOLD) return null;
  const mem: Memory = {
    memoryId: `m_${++w.counters.memory}`, ownerId: owner.id, eventId: m.eventId ?? null,
    locationId: m.locationId ?? null, summary: m.summary, involvedPeople: m.people ?? [],
    importance: clamp(m.importance), emotionalImpact: clamp(m.impact, -100, 100), createdAt: w.time,
  };
  owner.memories.push(mem);
  return mem;
}

/** Merge old, low-importance memories into a single summary memory. Rule based; AI may rewrite text later. */
export function consolidateMemories(w: WorldState, c: Citizen, limit = 24): boolean {
  if (c.memories.length <= limit) return false;
  const old = c.memories.filter(m => !m.summarized && m.importance < 60).sort((a, b) => a.createdAt - b.createdAt).slice(0, 10);
  if (old.length < 5) return false;
  const people = new Map<string, number>();
  for (const m of old) for (const p of m.involvedPeople) if (p !== c.id) people.set(p, (people.get(p) ?? 0) + 1);
  const top = [...people.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => w.citizens[id]?.name).filter(Boolean);
  const impact = Math.round(old.reduce((s, m) => s + m.emotionalImpact, 0) / old.length);
  const tone = impact > 10 ? '穏やかで楽しい' : impact < -10 ? '少し重たい' : '何気ない';
  const summary = `${tone}出来事が続いた時期。${top.length ? top.join('、') + 'との' : ''}やりとりが記憶に残っている（${old.length}件を要約）。`;
  const ids = new Set(old.map(m => m.memoryId));
  c.memories = c.memories.filter(m => !ids.has(m.memoryId));
  c.memories.push({
    memoryId: `m_${++w.counters.memory}`, ownerId: c.id, eventId: null, summary,
    involvedPeople: [...people.keys()].slice(0, 4), importance: Math.round(old.reduce((s, m) => s + m.importance, 0) / old.length),
    emotionalImpact: impact, createdAt: Math.min(...old.map(m => m.createdAt)), summarized: true,
  });
  c.memories.sort((a, b) => a.createdAt - b.createdAt);
  return true;
}
