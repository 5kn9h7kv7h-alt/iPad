// CINEMATIC OBSERVER: decides what the camera films. Pure logic, no three.js — easy to test.
import { hourOf } from '../sim/clock';
import { rand } from '../sim/rng';
import { isOutdoor } from '../sim/paths';
import type { WorldState } from '../sim/types';

export type ShotKind = 'aerial' | 'street' | 'follow' | 'event' | 'ambient';
export type V3 = [number, number, number];

export interface Shot {
  kind: ShotKind;
  label: string;
  ttl: number;               // real seconds
  citizenId?: string;
  locationId?: string;
  fixedPos?: V3;
  look?: V3;
  style?: 'sea' | 'harbor' | 'lamp' | 'rain' | 'lookout' | 'rooftops' | 'bay' | 'terrace' | 'promenade';
}

export interface DirectorState { current: Shot | null; startedAt: number; history: ShotKind[]; shownEvents: Set<string> }
export const newDirector = (): DirectorState => ({ current: null, startedAt: -999, history: [], shownEvents: new Set() });

const LABEL: Record<ShotKind, string> = {
  aerial: 'Aerial Shot', street: 'Street Shot', follow: 'Character Follow', event: 'Event Shot', ambient: 'Ambient Shot',
};

function pickWeighted<T>(w: WorldState, items: [T, number][]): T {
  const total = items.reduce((s, [, x]) => s + Math.max(0, x), 0);
  let r = rand(w) * total;
  for (const [t, x] of items) { r -= Math.max(0, x); if (r <= 0) return t; }
  return items[0][0];
}

export function interestingCitizen(w: WorldState, exclude?: string): string | null {
  const recent = w.events.filter(e => e.time > w.time - 180);
  const score = new Map<string, number>();
  for (const c of Object.values(w.citizens)) {
    if (c.movedOutAt !== undefined || c.activity === 'sleep' || c.id === exclude) continue;
    let s = 1 + rand(w) * 2;
    const b = w.buildings[c.currentLocation];
    if (!b || isOutdoor(b)) s += 2.5; // people we can actually see make better pictures
    if (c.activity === 'commute') s += 1.5;
    if (c.activity === 'talk') s += 2.5;
    if (c.activity === 'hobby' || c.activity === 'stroll') s += 1;
    score.set(c.id, s);
  }
  for (const e of recent) for (const p of e.people) if (score.has(p)) score.set(p, score.get(p)! + e.importance / 15);
  const items = [...score.entries()] as [string, number][];
  return items.length ? pickWeighted(w, items) : null;
}

export function chooseShot(w: WorldState, d: DirectorState, spotlight: string | null): Shot {
  const h = hourOf(w.time);
  const night = w.env.daylight < 0.2;
  const golden = (h > 5.5 && h < 9) || (h > 15.5 && h < 19);
  const moving = Object.values(w.citizens).filter(c => c.movedOutAt === undefined && c.activity === 'commute' && c.path.length > 0);
  const awake = Object.values(w.citizens).filter(c => c.movedOutAt === undefined && c.activity !== 'sleep');
  const freshEvent = [...w.events].reverse().find(e => e.time > w.time - 45 && e.importance >= 30 && e.locationId && w.buildings[e.locationId] && !d.shownEvents.has(e.id));

  const last = d.history[d.history.length - 1];
  const pen = (k: ShotKind) => (k === last ? 0.12 : d.history.slice(-3).includes(k) ? 0.6 : 1);
  const ambientBias = (w.env.weather === 'rain' || w.env.weather === 'fog' ? 1.6 : 0) + (night ? 1 : 0) + (golden ? 0.6 : 0);
  const kind = pickWeighted<ShotKind>(w, [
    ['aerial', (1 + (golden ? 2.2 : 0)) * pen('aerial')],
    ['street', (moving.length >= 2 ? 2.6 : 0.3) * pen('street')],
    ['follow', (awake.length ? (spotlight ? 3.2 : 2.2) : 0) * pen('follow')],
    ['event', (freshEvent ? 6 : 0) * pen('event')],
    ['ambient', (1.4 + ambientBias) * pen('ambient')],
  ]);

  let shot: Shot;
  switch (kind) {
    case 'event': {
      shot = { kind, label: LABEL.event, ttl: 12, locationId: freshEvent!.locationId!, citizenId: freshEvent!.people[0] };
      d.shownEvents.add(freshEvent!.id);
      break;
    }
    case 'follow': {
      const id = spotlight && w.citizens[spotlight]?.activity !== 'sleep' ? spotlight : interestingCitizen(w);
      shot = { kind, label: LABEL.follow, ttl: 18, citizenId: id ?? undefined };
      break;
    }
    case 'street': {
      const c = moving[Math.floor(rand(w) * moving.length)];
      shot = { kind, label: LABEL.street, ttl: 12, citizenId: c.id, fixedPos: freeSpot(w, c.x, c.z) };
      break;
    }
    case 'ambient': {
      const styles: Shot['style'][] = ['sea', 'harbor', 'lookout', 'rooftops', 'bay', 'terrace', 'promenade'];
      if (golden) styles.push('rooftops', 'bay', 'terrace', 'promenade', 'promenade');           // postcard views: over the roofs to the sea, and back from the bay
      if (night) styles.push('lamp', 'lamp', 'bay');
      if (w.env.weather === 'rain') styles.push('rain', 'rain', 'rain');
      const style = styles[Math.floor(rand(w) * styles.length)]!;
      const poses: Record<NonNullable<Shot['style']>, { p: V3; l: V3 }> = {
        sea: { p: [30, 2.4, 44], l: [50, 2, 90] },
        harbor: { p: [-52, 5, 34], l: [-60, 1, 70] },
        lookout: { p: [62, 10, 36], l: [20, 0, 80] },
        lamp: { p: [-18, 2.2, 8], l: [-18, 4.5, -6] },
        rain: { p: [-10, 3, 6], l: [-40, 2, -4] },
        rooftops: { p: [-36, 38, -98], l: [4, 0, 58] },
        bay: { p: [72, 26, 142], l: [-14, 6, -18] },
        terrace: { p: [-37.8, 3.0, -3.5], l: [-47, 1.8, -9.5] },
        promenade: { p: [-14, 2.8, 43], l: [-48, 2.4, 48] },
      };
      shot = { kind, label: LABEL.ambient, ttl: style === 'rooftops' || style === 'bay' || style === 'terrace' || style === 'promenade' ? 16 : 10, style, fixedPos: poses[style].p, look: poses[style].l };
      break;
    }
    default:
      shot = { kind: 'aerial', label: LABEL.aerial, ttl: 15 };
  }
  d.history.push(shot.kind);
  if (d.history.length > 8) d.history.shift();
  return shot;
}

/** A low camera spot near (x,z) that is not inside any building. */
export function freeSpot(w: WorldState, x: number, z: number): V3 {
  const offsets: [number, number][] = [[7, 9], [-7, 9], [7, -9], [-7, -9], [0, 13], [13, 0], [-13, 0]];
  const solid = Object.values(w.buildings).filter(b => b.status !== 'demolished' && !isOutdoor(b));
  for (const [dx, dz] of offsets) {
    const px = x + dx, pz = z + dz;
    if (!solid.some(b => Math.abs(b.x - px) < b.w / 2 + 1.5 && Math.abs(b.z - pz) < b.d / 2 + 1.5)) return [px, 2.6, pz];
  }
  return [x + 7, 14, z + 9];
}

export interface Pose { pos: V3; look: V3 }

/** Where the camera should be right now for a shot. `t` is seconds since the shot began. */
export const FOV: Record<ShotKind, number> = { aerial: 42, street: 56, follow: 50, event: 46, ambient: 36 };

/** Where the camera should be right now for a shot. `ctx.sunAz` lets aerials favour the sun-lit side of town. */
export function poseFor(w: WorldState, shot: Shot, t: number, clock: number, ctx: { sunAz: number; posOf?: (id: string) => { x: number; z: number } | undefined } = { sunAz: 0 }): Pose {
  const at = (id: string) => { const c = w.citizens[id]; const r = ctx.posOf?.(id); return c ? { ...c, x: r?.x ?? c.x, z: r?.z ?? c.z } : undefined; };
  switch (shot.kind) {
    case 'aerial': {
      const a = ctx.sunAz + 1.9 + Math.sin(clock * 0.03) * 0.45;   // side-lit: long shadows, glints on the water
      const low = w.env.daylight < 0.9;
      const R = low ? 112 : 128;
      return { pos: [Math.sin(a) * R * 0.95, low ? 48 + Math.sin(clock * 0.05) * 6 : 82, 12 + Math.cos(a) * R * 0.7], look: [0, 2, 0] };
    }
    case 'follow': {
      const c = shot.citizenId ? at(shot.citizenId) : undefined;
      if (!c) return { pos: [0, 60, 80], look: [0, 0, 0] };
      const a = 0.9 + t * 0.06;
      const b = w.buildings[c.currentLocation];
      if (b && !isOutdoor(b) && c.plan?.arrived) {
        // indoors: frame the whole building from outside instead of pressing against a wall
        const dist = Math.max(b.w, b.d) + 14;
        return { pos: [b.x + Math.sin(a) * dist, b.h + 9, b.z + Math.cos(a) * dist], look: [b.x, b.h * 0.45, b.z] };
      }
      return { pos: [c.x + Math.sin(a) * 11, 5.2, c.z + Math.cos(a) * 11], look: [c.x, 1.2, c.z] };
    }
    case 'street': {
      const c = shot.citizenId ? at(shot.citizenId) : undefined;
      const p = shot.fixedPos ?? [0, 3, 10];
      const k = Math.min(t, 14) * 0.22;   // slow push-in
      return { pos: [p[0] - (p[0] - (c?.x ?? p[0])) * k * 0.05, p[1] + k * 0.05, p[2] - (p[2] - (c?.z ?? p[2])) * k * 0.05], look: c ? [c.x, 1.4, c.z] : [p[0], 1.3, p[2] - 10] };
    }
    case 'event': {
      const b = w.buildings[shot.locationId!];
      return { pos: [b.x + 17 + Math.sin(t * 0.1) * 3, 10 + Math.min(t, 12) * 0.35, b.z + 20], look: [b.x, 1.5, b.z] };
    }
    default: {
      const p = shot.fixedPos!, l = shot.look!;
      if (shot.style === 'rooftops' || shot.style === 'bay' || shot.style === 'terrace' || shot.style === 'promenade') { // a slow, wide crane move across the view
        const k = Math.min(t, 16) / 16, side = shot.style === 'bay' ? -1 : 1;
        return { pos: [p[0] + side * (k - 0.5) * 22, p[1] - k * 4, p[2]], look: [l[0] + side * (k - 0.5) * 10, l[1], l[2]] };
      }
      return { pos: [p[0] + Math.sin(t * 0.15) * 2, p[1], p[2]], look: l };
    }
  }
}
