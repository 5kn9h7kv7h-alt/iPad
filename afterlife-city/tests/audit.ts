// Overlap audit helpers (shared by tests). Pure.
import { createWorld } from '../src/sim/world';
import { buildCity } from '../src/render/buildings/city';
import type { Part } from '../src/render/buildings/batch';
import { makeBushesFor, makeTreesFor } from '../src/render/world/Vegetation';
import type { WorldState } from '../src/sim/types';

export const ROWS = [-30, 0, 30];
export const COLS = [-60, -40, -20, 10, 35, 60];

export function overlap(a: Part, b: Part, pad = 0): boolean {
  for (let k = 0; k < 3; k++) if (a.max[k] <= b.min[k] + pad || b.max[k] <= a.min[k] + pad) return false;
  return true;
}
/** Is a footprint (x0..x1, z0..z1) on the asphalt of any road? */
export function onAsphalt(w: WorldState, x0: number, x1: number, z0: number, z1: number, half = 2.2): string | null {
  for (const n of Object.values(w.nodes)) for (const l of n.links) {
    const m = w.nodes[l];
    const ax0 = Math.min(n.x, m.x) - half, ax1 = Math.max(n.x, m.x) + half, az0 = Math.min(n.z, m.z) - half, az1 = Math.max(n.z, m.z) + half;
    if (x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1) return `${n.id}-${m.id}`;
  }
  return null;
}
export function audit(w = createWorld()) {
  const B = buildCity(w);
  const issues: string[] = [];
  const flatKinds = new Set(['park', 'plaza', 'beach']);
  const solid = (p: Part) => p.max[1] - p.min[1] > 0.3 || p.min[1] > 0.3; // ignore ground plates/roads
  const parts = B.parts.filter(solid);
  const isBuilding = (id: string) => (!!w.buildings[id] && !flatKinds.has(w.buildings[id].kind)) || id.startsWith('bg:') || id === 'church';
  // 1. different buildings must not intersect
  const byB = parts.filter(p => isBuilding(p.id));
  for (let i = 0; i < byB.length; i++) for (let j = i + 1; j < byB.length; j++) if (byB[i].id !== byB[j].id && overlap(byB[i], byB[j], 0.05)) issues.push(`building ${byB[i].id} x ${byB[j].id}`);
  // 2. street furniture must not be inside buildings
  const street = parts.filter(p => p.id === 'street');
  for (const s of street) for (const b of byB) if (overlap(s, b, 0.05)) { issues.push(`street:${s.tag} in ${b.id} @${s.min[0].toFixed(1)},${s.min[2].toFixed(1)}`); break; }
  // 3. nothing tall stands on the asphalt (lamps, benches, buildings...)
  for (const p of parts) { const r = onAsphalt(w, p.min[0], p.max[0], p.min[2], p.max[2]); if (r) issues.push(`${p.id}:${p.tag || 'body'} on road ${r} @${p.min[0].toFixed(1)},${p.min[2].toFixed(1)}`); }
  // 4. trees vs buildings / furniture / roads
  for (const t of makeTreesFor(w)) {
    const r = 1.2 * t.s; // crown footprint
    const y = t.y ?? 0;
    const tp: Part = { id: 'tree', tag: 'tree', min: [t.x - 0.4, y, t.z - 0.4], max: [t.x + 0.4, y + 2, t.z + 0.4] };
    const crown: Part = { id: 'tree', tag: 'crown', min: [t.x - r, y + 2, t.z - r], max: [t.x + r, y + 6 * t.s, t.z + r] };
    for (const p of parts) if (overlap(tp, p) || (isBuilding(p.id) && overlap(crown, p))) { issues.push(`tree @${t.x.toFixed(1)},${t.z.toFixed(1)} x ${p.id}:${p.tag || 'body'}`); break; }
  }
  // 5. hedges / bushes
  for (const h of makeBushesFor(w)) {
    const bp: Part = { id: 'bush', tag: 'bush', min: [h.x - 0.75 * h.s, 0, h.z - 0.75 * h.s], max: [h.x + 0.75 * h.s, 1, h.z + 0.75 * h.s] };
    for (const p of parts) if (overlap(bp, p)) { issues.push(`bush @${h.x.toFixed(1)},${h.z.toFixed(1)} x ${p.id}:${p.tag || 'body'}`); break; }
    if (onAsphalt(w, bp.min[0], bp.max[0], bp.min[2], bp.max[2], 3.4)) issues.push(`bush @${h.x.toFixed(1)},${h.z.toFixed(1)} on street`);
  }
  return { issues, B };
}

import { obstacles, routeTo, segHits, laneOf, isOutdoor } from '../src/sim/paths';
/** Every route between every pair of places, for a few lanes: no leg may pass through a building, and no leg may run along the asphalt. */
export function routeAudit(w = createWorld(), extra: { x0: number; x1: number; z0: number; z1: number }[] = []) {
  const issues: string[] = [];
  const obs = [...obstacles(w), ...extra];
  const places = Object.values(w.buildings);
  const lanes = ['c_01', 'c_07', 'c_13', 'c_22'].map(laneOf);
  let legs = 0;
  for (const a of places) for (const b of places) {
    if (a.id === b.id) continue;
    for (const [li, lane] of lanes.entries()) {
      const [jx, jz] = [[0.3, 0.7], [0.95, 0.9], [0.05, 0.1], [0.6, 0.98]][li];
      const pts = routeTo(w, a.x, a.z, a, b, jx, jz, lane);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1]; legs++;
        for (const o of obs) {
          const insideP = p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1, insideQ = q.x > o.x0 && q.x < o.x1 && q.z > o.z0 && q.z < o.z1;
          if (insideP || insideQ) { if (!(isOutdoor(a) || isOutdoor(b))) issues.push(`${a.id}->${b.id} point inside obstacle @${(insideP ? p : q).x.toFixed(1)},${(insideP ? p : q).z.toFixed(1)}`); continue; }
          if (segHits(p.x, p.z, q.x, q.z, o) >= 0) { issues.push(`${a.id}->${b.id} leg ${i} crosses a building`); break; }
        }
        // walking *along* a road on the asphalt (crossings are short and perpendicular, those are fine)
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        if (len > 7) {
          const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
          const r = onAsphalt(w, mx - 0.1, mx + 0.1, mz - 0.1, mz + 0.1, 2.0);
          if (r) issues.push(`${a.id}->${b.id} leg ${i} walks on road ${r}`);
        }
      }
    }
  }
  return { issues, legs };
}
