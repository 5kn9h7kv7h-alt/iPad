// Free-space checks used when placing terraces and street furniture, so nothing is pushed into a wall,
// onto the asphalt, or into the strip of sidewalk that pedestrians walk along.
import type { WorldState } from '../../sim/types';
import type { Part } from './batch';

/** Half-width of road + sidewalk (pedestrian lanes run at 2.5–3.1). */
export const STREET_HALF = 3.5;

export function onStreet(w: WorldState, x: number, z: number, r: number, half = STREET_HALF): boolean {
  for (const n of Object.values(w.nodes)) for (const l of n.links) {
    const m = w.nodes[l];
    if (x + r > Math.min(n.x, m.x) - half && x - r < Math.max(n.x, m.x) + half && z + r > Math.min(n.z, m.z) - half && z - r < Math.max(n.z, m.z) + half) return true;
  }
  return false;
}

export function inBuilding(w: WorldState, x: number, z: number, r: number, except?: string): boolean {
  for (const b of Object.values(w.buildings)) {
    if (b.status === 'demolished' || b.id === except || b.kind === 'park' || b.kind === 'plaza' || b.kind === 'beach') continue;
    const hw = b.kind === 'lookout' ? 3.7 : b.w / 2, hd = b.kind === 'lookout' ? 3.7 : b.d / 2;
    if (Math.abs(x - b.x) < hw + r && Math.abs(z - b.z) < hd + r) return true;
  }
  for (const l of w.lots) if (Math.abs(x - l.x) < l.w / 2 + r && Math.abs(z - l.z) < l.d / 2 + r) return true;
  return false;
}

export function hitsParts(parts: Part[], x: number, z: number, r: number, from = 0): boolean {
  for (let i = from; i < parts.length; i++) {
    const p = parts[i];
    if (p.max[1] - p.min[1] < 0.3 && p.min[1] < 0.3) continue; // flat ground plates
    if (x + r > p.min[0] && x - r < p.max[0] && z + r > p.min[2] && z - r < p.max[2]) return true;
  }
  return false;
}

/** Is a round object of radius r at (x, z) clear of streets, buildings and everything already built? */
export function clear(w: WorldState, parts: Part[], x: number, z: number, r: number, self?: string): boolean {
  return !onStreet(w, x, z, r) && !inBuilding(w, x, z, r, self) && !hitsParts(parts, x, z, r);
}
