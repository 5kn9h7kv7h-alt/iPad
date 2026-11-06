// Placement of the visual-only background houses (residents never enter them). Pure and deterministic:
// computed from the original town layout, so they never jump around, and checked against every pedestrian route.
import { createWorld } from '../../sim/world';
import { obstacles, routeTo, laneOf, segHits, type Box } from '../../sim/paths';
import type { WorldState } from '../../sim/types';
import { coastZ, fbm, heightAt, slopeAt, TOWN } from './terrainHeight';
import { Batch } from '../buildings/batch';
import { designBuilding } from '../buildings/designs';

/** The church with its bell tower on the hill behind the town: the landmark of the bay. */
export const CHURCH = { x: -6, z: -84 };

export interface House { x: number; z: number; y: number; w: number; d: number; h: number; yaw: number; wall: number; roof: number; shutter: number; seed: number; kind: 'hill' | 'town' }

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function streetClear(w: WorldState, b: Box, margin: number): boolean {
  for (const n of Object.values(w.nodes)) for (const l of n.links) {
    const m = w.nodes[l];
    if (b.x1 > Math.min(n.x, m.x) - margin && b.x0 < Math.max(n.x, m.x) + margin && b.z1 > Math.min(n.z, m.z) - margin && b.z0 < Math.max(n.z, m.z) + margin) return false;
  }
  return true;
}
const overlaps = (a: Box, b: Box) => a.x1 > b.x0 && a.x0 < b.x1 && a.z1 > b.z0 && a.z0 < b.z1;
const grow = (b: Box, m: number): Box => ({ x0: b.x0 - m, x1: b.x1 + m, z0: b.z0 - m, z1: b.z1 + m });

/** Every pedestrian leg between every pair of places (several lanes and standing spots). */
function sampleLegs(w: WorldState): [number, number, number, number][] {
  const legs: [number, number, number, number][] = [];
  const places = Object.values(w.buildings);
  const spots: [number, number][] = [[0.2, 0.3], [0.8, 0.7], [0.5, 0.5], [0.05, 0.95], [0.95, 0.05]];
  for (const a of places) for (const b of places) {
    if (a === b) continue;
    for (const [i, id] of ['c_01', 'c_09', 'c_17', 'c_26'].entries()) {
      const pts = routeTo(w, a.x, a.z, a, b, spots[i][0], spots[i][1], laneOf(id));
      for (let k = 0; k < pts.length - 1; k++) legs.push([pts[k].x, pts[k].z, pts[k + 1].x, pts[k + 1].z]);
    }
  }
  return legs;
}

let cache: House[] | null = null;

export function backdropHouses(): House[] {
  if (cache) return cache;
  const w = createWorld();                       // the original layout (the same in every save)
  const r = rng(90210);
  const out: House[] = [];
  const taken: Box[] = [];
  // footprint of a (rotated) house including its roof overhang
  const foot = (x: number, z: number, wd: number, dp: number, yaw: number): Box => {
    const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    const hw = c * wd / 2 + sn * dp / 2 + 0.45, hd = sn * wd / 2 + c * dp / 2 + 0.45;
    return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
  };
  const add = (hse: House) => { out.push(hse); taken.push(grow(foot(hse.x, hse.z, hse.w, hse.d, hse.yaw), 0.6)); };
  const free = (b: Box) => !taken.some(t => overlaps(t, b));
  taken.push({ x0: CHURCH.x - 10, x1: CHURCH.x + 12, z0: CHURCH.z - 14, z1: CHURCH.z + 12 });   // the church grounds

  // ---- hillside and headland villages
  for (let z = -67; z > -165; z -= 5.6) for (let x = -200; x < 200; x += 6.6) {
    const jx = x + (r() - 0.5) * 3, jz = z + (r() - 0.5) * 2;
    if (jx > TOWN.x0 - 3 && jx < TOWN.x1 + 3 && jz > TOWN.z0 - 4) continue;
    if (jz > coastZ(jx) - 7) continue;
    // clustered villages, denser close to the town and around the middle of the bay
    const near = sstep(-175, -70, jz) * sstep(210, 60, Math.abs(jx));
    if (fbm(jx * 0.025 + 7, jz * 0.025, 3) * 0.9 + near * 0.6 < 0.6 || r() < 0.12) continue;
    if (slopeAt(jx, jz) > 1.0) continue;
    const wd = 5 + r() * 2.8, dp = 4.4 + r() * 1.8, floors = 2 + Math.floor(r() * 2.6);
    const ys = [heightAt(jx - wd / 2, jz - dp / 2), heightAt(jx + wd / 2, jz - dp / 2), heightAt(jx - wd / 2, jz + dp / 2), heightAt(jx + wd / 2, jz + dp / 2)];
    const y0 = Math.min(...ys) - 0.4, rise = Math.max(...ys) - Math.min(...ys);
    if (y0 > 52 || rise > 5) continue;
    const yaw = Math.atan2(-jx * 0.25, 80) + (r() - 0.5) * 0.25;   // face roughly towards the bay
    const box = foot(jx, jz, wd, dp, yaw);
    if (!free(box)) continue;
    add({ x: jx, z: jz, y: y0, w: wd, d: dp, h: floors * 3 + rise + 0.4, yaw, wall: r(), roof: r(), shutter: r(), seed: r(), kind: 'hill' });
  }

  // ---- infill inside the town blocks, only where nobody ever walks
  const obs = obstacles(w).map(o => grow(o, 2.5));
  const B = new Batch();
  for (const b of Object.values(w.buildings)) designBuilding(B, b, w);
  for (const p of B.parts) if (p.max[1] - p.min[1] > 0.3 || p.min[1] > 0.3) obs.push(grow({ x0: p.min[0], x1: p.max[0], z0: p.min[2], z1: p.max[2] }, 1.4));
  const lots = w.lots.map(l => grow({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z - l.d / 2, z1: l.z + l.d / 2 }, 4));
  // outdoor places plus the whole strip between them and the street they open onto (people cross it anywhere)
  const areas = Object.values(w.buildings).filter(b => b.kind === 'park' || b.kind === 'plaza' || b.kind === 'beach' || b.kind === 'lookout').map(b => {
    const n = w.nodes[b.nodeId];
    const box = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
    return grow({ x0: Math.min(box.x0, box.x1 > n.x && box.x0 < n.x ? box.x0 : Math.min(box.x0, n.x)), x1: Math.max(box.x1, n.x), z0: Math.min(box.z0, n.z), z1: Math.max(box.z1, n.z) }, 3);
  });
  const legs = sampleLegs(w);
  for (let z = TOWN.z0 + 5; z < 40; z += 2.5) for (let x = TOWN.x0 + 5; x < TOWN.x1 - 5; x += 2.5) {
    if (z > 30 && x < -17) continue;                      // harbour quay stays open
    const wd = 6 + r() * 3, dp = 5.5 + r() * 2, floors = 2 + Math.floor(r() * 2.4);
    const box = foot(x, z, wd, dp, 0);
    if (!streetClear(w, box, 4.6)) continue;
    if (obs.some(o => overlaps(o, box)) || lots.some(o => overlaps(o, box)) || areas.some(o => overlaps(o, box)) || !free(grow(box, 1.2))) continue;
    const g = grow(box, 0.9);
    if (legs.some(([ax, az, bx, bz]) => segHits(ax, az, bx, bz, g) >= 0)) continue;
    add({ x, z, y: -0.06, w: wd, d: dp, h: floors * 3 + 0.4, yaw: 0, wall: r(), roof: r(), shutter: r(), seed: r(), kind: 'town' });
  }
  cache = out;
  return out;
}

/** Footprints (for keeping trees, bushes and the audit tests clear of them). */
export function backdropBoxes(): Box[] {
  return backdropHouses().map(h => { const c = Math.abs(Math.cos(h.yaw)), s = Math.abs(Math.sin(h.yaw)); const hw = c * h.w / 2 + s * h.d / 2 + 0.45, hd = s * h.w / 2 + c * h.d / 2 + 0.45; return { x0: h.x - hw, x1: h.x + hw, z0: h.z - hd, z1: h.z + hd }; });
}

