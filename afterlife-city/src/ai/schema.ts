// Contract between the AI service and the simulation. AI output is *proposals only*.
import type { WorldState } from '../sim/types';

export type ProposalType = 'meetup' | 'festival' | 'rumor' | 'hobby';

export interface AiProposal {
  type: ProposalType;
  title: string;
  detail: string;
  cause?: string;
  locationId?: string | null;
  people?: string[];
  startInMinutes?: number;
  durationMinutes?: number;
  param?: string;
}

export interface WorldSnapshot {
  now: string;
  time: number;
  weather: string;
  season: string;
  temperature: number;
  buildings: { id: string; name: string; kind: string; open: boolean }[];
  citizens: { id: string; name: string; age: number; occupation: string; mood: string; goal: string; interests: string[]; location: string }[];
  relationships: { a: string; b: string; kind: string; familiarity: number; friendship: number; tension: number; sharedInterest: string | null }[];
  recentEvents: { time: number; summary: string }[];
  recentProposalKeys: string[];
}

export function buildSnapshot(w: WorldState, nowLabel: string): WorldSnapshot {
  const act = Object.values(w.citizens).filter(c => c.movedOutAt === undefined);
  return {
    now: nowLabel, time: w.time, weather: w.env.weather, season: w.env.season, temperature: w.env.temperature,
    buildings: Object.values(w.buildings).filter(b => b.status === 'open').map(b => ({ id: b.id, name: b.name, kind: b.kind, open: true })),
    citizens: act.map(c => ({
      id: c.id, name: c.name, age: c.age, occupation: c.occupation, mood: c.currentMood, goal: c.currentGoal,
      interests: c.interests, location: w.buildings[c.currentLocation]?.name ?? '路上',
    })),
    relationships: Object.values(w.relationships)
      .filter(r => r.familiarity >= 15)
      .sort((x, y) => y.familiarity - x.familiarity).slice(0, 40)
      .map(r => ({ a: r.aId, b: r.bId, kind: r.kind, familiarity: Math.round(r.familiarity), friendship: Math.round(r.friendship), tension: Math.round(r.tension), sharedInterest: r.sharedInterest })),
    recentEvents: w.events.filter(e => e.importance >= 20).slice(-12).map(e => ({ time: e.time, summary: e.summary })),
    recentProposalKeys: w.usedKeys.slice(-20),
  };
}

/** Defensive parse of whatever JSON the model returned. */
export function parseProposals(raw: unknown): AiProposal[] {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { proposals?: unknown }).proposals)) ? (raw as { proposals: unknown[] }).proposals : [];
  const out: AiProposal[] = [];
  for (const p of arr.slice(0, 6)) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.type !== 'string' || typeof o.title !== 'string' || typeof o.detail !== 'string') continue;
    out.push({
      type: o.type as ProposalType, title: o.title, detail: o.detail,
      cause: typeof o.cause === 'string' ? o.cause : undefined,
      locationId: typeof o.locationId === 'string' ? o.locationId : null,
      people: Array.isArray(o.people) ? o.people.filter((x): x is string => typeof x === 'string') : [],
      startInMinutes: typeof o.startInMinutes === 'number' ? o.startInMinutes : undefined,
      durationMinutes: typeof o.durationMinutes === 'number' ? o.durationMinutes : undefined,
      param: typeof o.param === 'string' ? o.param : undefined,
    });
  }
  return out;
}

export interface DialogueRequest { aId: string; bId: string; place: string; topic: string; tone: string; eventId: string }
