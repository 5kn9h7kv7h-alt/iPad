// Pedestrian routing: door -> sidewalk -> street corners (crossing at intersections) -> sidewalk -> door.
// Every leg is checked against building footprints and detours around them.
import type { Building, RoadNode, WorldState } from './types';
import { doorPoint, frontYaw } from './doors';

/** Walking speed in world units (≈ metres) per sim minute. At 1× (1 s = 1 min) this reads as a brisk human walk. */
export const WALK_SPEED = 1.7;
/** Distance of the sidewalk centre line from the road centre line. */
export const SIDEWALK = 2.8;

const cache = new Map<string, string[]>();

function bfs(nodes: Record<string, RoadNode>, from: string, to: string): string[] {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of nodes[cur].links) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(to)) return [from, to];
  const out: string[] = [];
  for (let c: string | undefined = to; c; c = prev.get(c)) out.push(c);
  return out.reverse();
}

export function nodePath(w: WorldState, from: string, to: string): string[] {
  const key = from + '>' + to;
  let p = cache.get(key);
  if (!p) { p = bfs(w.nodes, from, to); cache.set(key, p); }
  return p;
}

export function nearestNode(w: WorldState, x: number, z: number): RoadNode {
  let best: RoadNode | null = null, bd = Infinity;
  for (const n of Object.values(w.nodes)) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
  return best!;
}

export const OUTDOOR_KINDS = new Set(['plaza', 'park', 'beach', 'lookout']);
export const isOutdoor = (b: Building) => OUTDOOR_KINDS.has(b.kind);

/** A place to stand. Outdoor areas: somewhere inside, clear of the fountain / around the lighthouse. Indoors: the door. */
export function spotFor(b: Building, jx: number, jz: number, w?: WorldState): { x: number; z: number } {
  if (b.kind === 'lookout') {
    const ang = (jx - 0.5) * Math.PI * 0.9, r = 5.6 + jz * 0.9;      // on the seaward side of the tower
    return { x: b.x + Math.sin(ang) * r, z: b.z + Math.cos(ang) * r };
  }
  if (!isOutdoor(b)) return w ? doorPoint(b, w) : { x: b.x, z: b.z };
  let x = b.x + (jx - 0.5) * (b.w - 2), z = b.z + (jz - 0.5) * (b.d - 1.4);
  if (b.kind === 'park') { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); if (d < 2.2) { const k = 2.2 / Math.max(d, 0.01); x = b.x + dx * k; z = b.z + (dz || 0.5) * k; } }
  // never stand inside (or right against) a neighbouring building: step out along the shallowest side
  if (w) for (const o of obstacles(w)) {
    if (!(x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1)) continue;
    const opts = [
      { d: x - o.x0, x: o.x0 - 0.2, z }, { d: o.x1 - x, x: o.x1 + 0.2, z },
      { d: z - o.z0, x, z: o.z0 - 0.2 }, { d: o.z1 - z, x, z: o.z1 + 0.2 },
    ].filter(q => q.x > b.x - b.w / 2 && q.x < b.x + b.w / 2 && q.z > b.z - b.d / 2 && q.z < b.z + b.d / 2).sort((a, c) => a.d - c.d);
    if (opts[0]) { x = opts[0].x; z = opts[0].z; }
  }
  return { x, z };
}

// ---------------------------------------------------------------- obstacles
export interface Box { x0: number; x1: number; z0: number; z1: number }
const PAD = 0.6;
export function obstacles(w: WorldState): Box[] {
  const out: Box[] = [];
  for (const b of Object.values(w.buildings)) {
    if (b.status === 'demolished' || b.kind === 'park' || b.kind === 'plaza' || b.kind === 'beach') continue;
    const hw = b.kind === 'lookout' ? 3.7 : b.w / 2, hd = b.kind === 'lookout' ? 3.7 : b.d / 2;
    out.push({ x0: b.x - hw - PAD, x1: b.x + hw + PAD, z0: b.z - hd - PAD, z1: b.z + hd + PAD });
  }
  for (const l of w.lots) if (w.construction.some(k => k.lotId === l.id)) out.push({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z - l.d / 2, z1: l.z + l.d / 2 });
  return out;
}

/** Does segment a-b pass through box (Liang–Barsky)? Returns entry parameter or -1. */
export function segHits(ax: number, az: number, bx: number, bz: number, o: Box): number {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (clip(-dx, ax - o.x0) && clip(dx, o.x1 - ax) && clip(-dz, az - o.z0) && clip(dz, o.z1 - az) && t1 - t0 > 1e-4) return t0;
  return -1;
}
const inside = (x: number, z: number, o: Box) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1;

type P = { x: number; z: number };
/** Leg from a to b that walks around any footprint in the way (via its corners). */
function detour(a: P, b: P, obs: Box[], depth = 0): P[] {
  let first: Box | null = null, ft = 2;
  for (const o of obs) {
    if (inside(a.x, a.z, o) || inside(b.x, b.z, o)) continue; // starting/ending at a wall: let it be
    const t = segHits(a.x, a.z, b.x, b.z, o);
    if (t >= 0 && t < ft) { ft = t; first = o; }
  }
  if (!first || depth > 4) return [b];
  const e = 0.15;
  const corners: P[] = [
    { x: first.x0 - e, z: first.z0 - e }, { x: first.x1 + e, z: first.z0 - e }, { x: first.x1 + e, z: first.z1 + e }, { x: first.x0 - e, z: first.z1 + e },
  ];
  let best: P[] | null = null, bl = Infinity;
  for (const c of corners) {
    for (const c2 of [c, ...corners.filter(k => k !== c)]) {
      // one or two corners of the same box, whichever is clear of it
      const legs = c2 === c ? [a, c, b] : [a, c, c2, b];
      let ok = true;
      for (let i = 0; i < legs.length - 1 && ok; i++) if (segHits(legs[i].x, legs[i].z, legs[i + 1].x, legs[i + 1].z, first) >= 0) ok = false;
      if (!ok) continue;
      let len = 0; for (let i = 0; i < legs.length - 1; i++) len += Math.hypot(legs[i + 1].x - legs[i].x, legs[i + 1].z - legs[i].z);
      if (len < bl) { bl = len; best = legs.slice(1); }
    }
  }
  if (!best) return [b];
  const out: P[] = [];
  let cur = a;
  for (const p of best) { out.push(...detour(cur, p, obs, depth + 1)); cur = p; }
  return out;
}

const sgn = (v: number) => (v >= 0 ? 1 : -1);

/** Curb point and building-side corner where a place meets its street. */
function frontage(w: WorldState, b: Building, p: P, C: number): { curb: P; corner: P; node: RoadNode } {
  const n = w.nodes[b.nodeId];
  const yaw = frontYaw(b, w);
  if (Math.abs(Math.sin(yaw)) < 0.5) { // street runs along x, building north (yaw 0) or south (π)
    const sz = yaw === 0 ? -1 : 1;
    const curb = { x: p.x, z: n.z + sz * C };
    return { curb, corner: { x: n.x + sgn(p.x - n.x) * C, z: n.z + sz * C }, node: n };
  }
  const sx = yaw > 0 ? -1 : 1;
  const curb = { x: n.x + sx * C, z: p.z };
  return { curb, corner: { x: n.x + sx * C, z: n.z + sgn(p.z - n.z) * C }, node: n };
}

/** Walk between two corners of the same intersection (cross one street, or two via the third corner). */
function cross(p: P, q: P, out: P[]): void {
  if (Math.abs(p.x - q.x) > 0.01 && Math.abs(p.z - q.z) > 0.01) out.push({ x: p.x, z: q.z });
  out.push(q);
}

/**
 * Waypoints from the citizen's position to the destination. `lane` (−0.3..0.3) spreads people across the sidewalk.
 * The first point is the start itself (callers drop it), the last is the door / standing spot.
 */
export function routeTo(
  w: WorldState, fromX: number, fromZ: number, fromBuilding: Building | null, to: Building, jx: number, jz: number, lane = 0,
): P[] {
  const C = SIDEWALK + lane;
  const start: P = fromBuilding && !isOutdoor(fromBuilding) ? doorPoint(fromBuilding, w) : { x: fromX, z: fromZ };
  const goal = spotFor(to, jx, jz, w);
  const raw: P[] = [start];
  let cur: P;
  let startNode: RoadNode;
  if (fromBuilding) {
    const f = frontage(w, fromBuilding, start, C);
    raw.push(f.curb, f.corner); cur = f.corner; startNode = f.node;
  } else {
    startNode = nearestNode(w, start.x, start.z);
    cur = { x: startNode.x + sgn(start.x - startNode.x) * C, z: startNode.z + sgn(start.z - startNode.z) * C };
    raw.push(cur);
  }
  const dest = frontage(w, to, goal, C);
  const ids = nodePath(w, startNode.id, dest.node.id);
  for (let i = 0; i < ids.length - 1; i++) {
    const a = w.nodes[ids[i]], b = w.nodes[ids[i + 1]];
    let s: P, e: P;
    if (a.z === b.z) { const dx = sgn(b.x - a.x), sz = sgn(cur.z - a.z); s = { x: a.x + dx * C, z: a.z + sz * C }; e = { x: b.x - dx * C, z: b.z + sz * C }; }
    else { const dz = sgn(b.z - a.z), sx = sgn(cur.x - a.x); s = { x: a.x + sx * C, z: a.z + dz * C }; e = { x: b.x + sx * C, z: b.z - dz * C }; }
    cross(cur, s, raw); raw.push(e); cur = e;
  }
  cross(cur, dest.corner, raw);
  raw.push(dest.curb, goal);
  // drop duplicates, then route every leg around buildings
  const pts: P[] = [raw[0]];
  for (const p of raw.slice(1)) { const q = pts[pts.length - 1]; if (Math.hypot(p.x - q.x, p.z - q.z) > 0.05) pts.push(p); }
  const obs = obstacles(w);
  const out: P[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) out.push(...detour(pts[i], pts[i + 1], obs));
  return out;
}

export function routeLength(pts: P[]): number { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); return s; }
export const laneOf = (id: string) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return ((h % 61) / 60 - 0.5) * 0.6; };
