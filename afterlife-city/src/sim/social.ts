// Relationship dynamics. Numbers change only through rules here — AI text never edits these values.
import { chance, clamp, rand } from './rng';
import { relKey } from './world';
import { chooseTopic, makeDialogue, type Topic } from './dialogue';
import { logEvent, remember } from './log';
import type { Citizen, Relationship, SimEvent, WorldState } from './types';

const TALKABLE = new Set(['eat', 'rest', 'hobby', 'talk', 'shop', 'stroll', 'work', 'home']);

export function getRel(w: WorldState, a: string, b: string): Relationship {
  const key = relKey(a, b);
  let r = w.relationships[key];
  if (!r) {
    const [aId, bId] = a < b ? [a, b] : [b, a];
    const A = w.citizens[aId], B = w.citizens[bId];
    r = w.relationships[key] = {
      aId, bId, kind: 'acquaintance', familiarity: 0, friendship: 0, trust: 5, affection: 0, tension: 0,
      lastMetAt: -1, meetings: 0, sharedInterest: A.interests.find(i => B.interests.includes(i)) ?? null,
    };
  }
  return r;
}

/** Called every few sim minutes: groups co-located citizens and rolls for conversations. */
export function socialize(w: WorldState): void {
  const groups = new Map<string, Citizen[]>();
  for (const c of Object.values(w.citizens)) {
    if (c.movedOutAt !== undefined || !c.plan?.arrived) continue;
    if (!TALKABLE.has(c.activity) || c.activity === 'sleep') continue;
    const arr = groups.get(c.currentLocation);
    if (arr) arr.push(c); else groups.set(c.currentLocation, [c]);
  }
  for (const [loc, list] of groups) {
    if (list.length < 2) continue;
    const b = w.buildings[loc];
    if (!b) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], o = list[j];
        if (w.time - a.lastTalkAt < 90 || w.time - o.lastTalkAt < 90) continue;
        const rel = getRel(w, a.id, o.id);
        // At home only family/neighbours chat; at work coworkers.
        const chatty = (a.personality.sociability + o.personality.sociability) / 200;
        let p = 0.045 + chatty * 0.09;
        if (a.activity === 'talk' || o.activity === 'talk') p += 0.22;
        if (a.activity === 'work' && o.activity === 'work') p *= 0.6;
        if (b.isHome) p *= 0.7;
        p *= 1 + rel.familiarity / 150;
        if (rel.tension > 60) p *= 0.5;
        if (chance(w, p)) converse(w, a, o, rel);
      }
    }
  }
  streetGreetings(w);
}

function streetGreetings(w: WorldState): void {
  const walkers = Object.values(w.citizens).filter(c => c.movedOutAt === undefined && c.activity === 'commute' && c.path.length);
  for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
    const a = walkers[i], b = walkers[j];
    if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 16) continue;
    if (!chance(w, 0.12)) continue;
    const rel = getRel(w, a.id, b.id);
    rel.familiarity = clamp(rel.familiarity + 0.6);
    rel.lastMetAt = w.time;
  }
}

export function converse(w: WorldState, a: Citizen, o: Citizen, rel: Relationship, forcedTopic?: Topic, placeNote?: string): SimEvent {
  const b = w.buildings[a.currentLocation];
  const place = b ? b.name : '街角';
  const prevKind = rel.kind;
  const firstMeeting = rel.meetings === 0 && rel.familiarity < 25;

  // tone: mood + tension + patience decide whether it goes badly
  const irritable = (a.currentMood === 'irritated' || o.currentMood === 'irritated' ? 0.12 : 0)
    + rel.tension / 300 + (100 - (a.personality.patience + o.personality.patience) / 2) / 900;
  const tone: 'warm' | 'neutral' | 'tense' = chance(w, irritable) ? 'tense' : rel.affection > 35 || rel.friendship > 40 ? 'warm' : 'neutral';
  const topic = forcedTopic ?? chooseTopic(w, a, o, rel);

  // rule-based outcome
  const decay = 1 - rel.familiarity / 140;
  const dFam = (firstMeeting ? 6 : 1.8) * decay + 0.5;
  let dFri = 0, dTrust = 0, dAff = 0, dTen = 0;
  if (tone === 'tense') {
    dTen = 4 + rand(w) * 4; dFri = -1.5; dTrust = -1.5; dAff = -1;
    a.irritatedUntil = w.time + 90; o.irritatedUntil = w.time + 90;
  } else {
    const synergy = topic === 'interest' ? 2.2 : topic === 'worry' ? 1.6 : 1;
    dFri = (0.8 + rand(w) * 1.2) * synergy * (tone === 'warm' ? 1.2 : 1) * (0.6 + (a.personality.openness + o.personality.openness) / 250);
    dTrust = topic === 'worry' ? 2.2 : 0.5;
    dAff = (rel.friendship > 30 ? 0.8 : 0.3) * (tone === 'warm' ? 1.5 : 1);
    dTen = -1.2;
  }
  rel.familiarity = clamp(rel.familiarity + dFam);
  rel.friendship = clamp(rel.friendship + dFri);
  rel.trust = clamp(rel.trust + dTrust);
  rel.affection = clamp(rel.affection + dAff);
  rel.tension = clamp(rel.tension + dTen);
  rel.meetings++; rel.lastMetAt = w.time;
  a.lastTalkAt = o.lastTalkAt = w.time;
  a.needs.social = clamp(a.needs.social + 18); o.needs.social = clamp(o.needs.social + 18);

  const sharedFound = topic === 'interest' && !!rel.sharedInterest;
  const dialogue = makeDialogue(w, a, o, rel, topic, place, tone);

  // relationship kind transitions — gated by thresholds, never by chance alone
  let milestone: string | null = null;
  if (rel.kind !== 'family' && rel.kind !== 'friend' && rel.friendship >= 50 && rel.familiarity >= 45 && rel.trust >= 30 && rel.tension < 30) {
    rel.kind = 'friend';
    milestone = `${a.name}と${o.name}は友人と呼べる間柄になった`;
  } else if (rel.kind !== 'family' && rel.kind !== 'rival' && rel.tension >= 55 && rel.friendship < 30) {
    rel.kind = 'rival';
    milestone = `${a.name}と${o.name}の間に溝ができた`;
  } else if (rel.kind === 'rival' && rel.tension < 25) {
    rel.kind = 'acquaintance';
    milestone = `${a.name}と${o.name}は気まずさを乗り越え、普通に話せるようになった`;
  }

  const summary = firstMeeting
    ? `${a.name}と${o.name}が${place}で初めて言葉を交わした`
    : tone === 'tense'
      ? `${a.name}と${o.name}が${place}で気まずいやりとりをした`
      : sharedFound
        ? `${a.name}と${o.name}が${place}で「${rel.sharedInterest}」の話で盛り上がった`
        : `${a.name}と${o.name}が${place}で立ち話をした`;
  const importance = milestone ? 55 : firstMeeting ? 32 : tone === 'tense' ? 34 : sharedFound ? 30 : 6;

  const ev = logEvent(w, {
    category: 'relationship', locationId: b?.id ?? null, people: [a.id, o.id], summary,
    cause: firstMeeting ? '互いに面識がなかった' : topic === 'interest' ? `共通の趣味「${rel.sharedInterest}」` : `${place}に居合わせた`,
    result: milestone ?? (tone === 'tense' ? '少し距離ができた' : '親しさが少し増した'),
    importance, dialogue,
  });
  if (milestone) {
    logEvent(w, {
      category: 'relationship', locationId: b?.id ?? null, people: [a.id, o.id], summary: milestone,
      cause: `これまでに${rel.meetings}回言葉を交わした`, result: `関係：${prevKind} → ${rel.kind}`, related: [ev.id],
      importance: 60, historic: true,
    });
  }
  const impactA = tone === 'tense' ? -35 : 25 + (milestone ? 25 : 0);
  for (const [me, other] of [[a, o], [o, a]] as const) {
    remember(w, me, {
      summary: milestone ?? summary, eventId: ev.id, locationId: b?.id ?? null, people: [other.id],
      importance: importance + (milestone ? 10 : 0), impact: impactA,
    });
  }
  void placeNote;
  return ev;
}

export function relationsOf(w: WorldState, id: string): Relationship[] {
  return Object.values(w.relationships).filter(r => r.aId === id || r.bId === id);
}

export function isActive(c: Citizen): boolean { return c.movedOutAt === undefined; }
