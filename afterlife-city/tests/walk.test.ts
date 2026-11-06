import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/engine';
import { obstacles } from '../src/sim/paths';

describe('pedestrians', () => {
  it('walk on sidewalks: almost never on the asphalt except when crossing at an intersection, never inside buildings', () => {
    const w = createWorld(11);
    const obs = obstacles(w);
    let walking = 0, onRoad = 0, inBuilding = 0;
    const where: string[] = [];
    for (let i = 0; i < 2 * 1440; i++) {
      step(w);
      for (const c of Object.values(w.citizens)) {
        if (c.activity !== 'commute' || !c.path.length) continue;
        walking++;
        for (const o of obs) if (c.x > o.x0 + 0.25 && c.x < o.x1 - 0.25 && c.z > o.z0 + 0.25 && c.z < o.z1 - 0.25) { inBuilding++; if (where.length < 10) where.push(`${c.id} in building @${c.x.toFixed(1)},${c.z.toFixed(1)}`); break; }
        // on asphalt of a segment, and not within the crossing zone of an intersection
        let road = false;
        for (const n of Object.values(w.nodes)) for (const l of n.links) {
          const m = w.nodes[l];
          const x0 = Math.min(n.x, m.x) - 2.2, x1 = Math.max(n.x, m.x) + 2.2, z0 = Math.min(n.z, m.z) - 2.2, z1 = Math.max(n.z, m.z) + 2.2;
          if (c.x > x0 && c.x < x1 && c.z > z0 && c.z < z1) road = true;
        }
        const nearNode = Object.values(w.nodes).some(n => Math.abs(c.x - n.x) < 4 && Math.abs(c.z - n.z) < 4);
        if (road && !nearNode) { onRoad++; if (where.length < 10) where.push(`${c.id} on road @${c.x.toFixed(1)},${c.z.toFixed(1)}`); }
      }
    }
    console.log({ walking, onRoad, inBuilding, share: (onRoad / walking).toFixed(4) }, where);
    expect(inBuilding).toBe(0);
    expect(onRoad / walking).toBeLessThan(0.01);
  });
});
