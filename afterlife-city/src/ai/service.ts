// Orchestrates AI features around the (plain) simulation. All results are validated before use.
import { formatStamp } from '../sim/clock';
import { relKey } from '../sim/world';
import type { SimEvent, WorldState } from '../sim/types';
import { callAi } from './client';
import { buildSnapshot, parseProposals } from './schema';
import { applyProposals, sanitizeDialogue } from './validate';
import { documentaryFallback, type Documentary } from './documentary';

export interface AiLogEntry { at: number; kind: string; ok: boolean; text: string }

export async function requestEventProposals(w: WorldState): Promise<AiLogEntry[]> {
  const raw = await callAi('events', buildSnapshot(w, formatStamp(w.startDate, w.time)));
  if (raw === null) return [{ at: w.time, kind: 'events', ok: false, text: 'AIから応答がありませんでした（シミュレーションは通常どおり継続）' }];
  const results = applyProposals(w, parseProposals(raw));
  if (!results.length) return [{ at: w.time, kind: 'events', ok: false, text: '有効な提案がありませんでした' }];
  return results.map(r => ({
    at: w.time, kind: 'events', ok: r.ok,
    text: r.ok ? `採用: ${r.proposal.title}` : `却下: ${r.proposal.title}（${r.reason}）`,
  }));
}

/** Replace the template dialogue of an already-logged conversation with an AI rewrite (cosmetic only). */
export async function enrichDialogue(w: WorldState, ev: SimEvent): Promise<boolean> {
  if (ev.people.length !== 2 || !ev.dialogue) return false;
  const [a, b] = ev.people.map(id => w.citizens[id]);
  if (!a || !b) return false;
  const rel = w.relationships[relKey(a.id, b.id)];
  const raw = await callAi('dialogue', {
    aId: a.id, bId: b.id,
    a: { name: a.name, occupation: a.occupation, mood: a.currentMood, personality: a.personality, interests: a.interests },
    b: { name: b.name, occupation: b.occupation, mood: b.currentMood, personality: b.personality, interests: b.interests },
    relationship: rel ? { kind: rel.kind, familiarity: Math.round(rel.familiarity), friendship: Math.round(rel.friendship), tension: Math.round(rel.tension), sharedInterest: rel.sharedInterest } : null,
    situation: ev.summary, weather: w.env.weather, memories: [...a.memories, ...b.memories].slice(-3).map(m => m.summary),
  });
  const lines = sanitizeDialogue(raw, a.id, b.id);
  if (!lines) return false;
  ev.dialogue = lines;
  return true;
}

export async function requestDocumentary(w: WorldState, citizenId: string): Promise<Documentary> {
  const c = w.citizens[citizenId];
  const fallback = documentaryFallback(w, citizenId);
  if (!c) return fallback;
  const raw = await callAi('documentary', {
    name: c.name, age: c.age, occupation: c.occupation, goal: c.currentGoal, interests: c.interests,
    lifeEvents: fallback.facts,
  });
  const o = raw as { title?: unknown; paragraphs?: unknown } | null;
  if (o && typeof o.title === 'string' && Array.isArray(o.paragraphs) && o.paragraphs.every(p => typeof p === 'string') && o.paragraphs.length >= 2) {
    return { ...fallback, title: o.title.slice(0, 60), paragraphs: (o.paragraphs as string[]).slice(0, 7).map(p => p.slice(0, 300)), source: 'ai' };
  }
  return fallback;
}
