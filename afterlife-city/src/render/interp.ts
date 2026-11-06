// Smooth motion between simulation steps. The sim advances in whole minutes; the renderer draws
// prev + (cur - prev) * frac, so residents glide at a constant pace instead of hopping each step.
import type { WorldState } from '../sim/types';

export const interp: { frac: number; prev: Map<string, { x: number; z: number }> } = { frac: 0, prev: new Map() };

/** Call right before each sim step. */
export function snapshot(w: WorldState): void {
  for (const id in w.citizens) {
    const c = w.citizens[id];
    const p = interp.prev.get(id);
    if (p) { p.x = c.x; p.z = c.z; } else interp.prev.set(id, { x: c.x, z: c.z });
  }
}
/** After a jump in time (load, catch-up): no interpolation from stale positions. */
export function resetInterp(w: WorldState): void { interp.prev.clear(); snapshot(w); interp.frac = 0; }
