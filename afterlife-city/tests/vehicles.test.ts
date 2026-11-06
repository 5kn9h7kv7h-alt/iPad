import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { alongBus, BUS, busPath, busScheduled, carBox, parkedCars } from '../src/render/world/vehicleLayout';
import { audit, overlap, routeAudit } from './audit';
import type { Part } from '../src/render/buildings/batch';

const w = createWorld();
const roadOf = (x: number, z: number, half: number) => {
  for (const n of Object.values(w.nodes)) for (const l of n.links) {
    const m = w.nodes[l];
    if (x >= Math.min(n.x, m.x) - half && x <= Math.max(n.x, m.x) + half && z >= Math.min(n.z, m.z) - half && z <= Math.max(n.z, m.z) + half) return true;
  }
  return false;
};

describe('decorative vehicles stay on the road and out of everyone\'s way', () => {
  const cars = parkedCars(w);
  const { B } = audit(w);
  const solid = B.parts.filter(p => p.max[1] - p.min[1] > 0.3 || p.min[1] > 0.3);

  it('parked cars sit on the asphalt, mid-block, touching nothing', () => {
    expect(cars.length).toBeGreaterThanOrEqual(6);
    for (const c of cars) {
      const b = carBox(c);
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) expect(roadOf(x, z, 2.21) ? null : `${x},${z}`).toBeNull();
      const near = Math.min(...Object.values(w.nodes).map(n => Math.hypot(n.x - c.x, n.z - c.z)));
      expect(near).toBeGreaterThan(8);
      const cp: Part = { id: 'car', tag: 'car', min: [b.x0, 0.1, b.z0], max: [b.x1, 1.6, b.z1] };
      const hit = solid.find(p => p.id !== 'street' || p.tag ? overlap(cp, p) : false);
      expect(hit ? `${hit.id}:${hit.tag}` : null).toBeNull();
    }
  });

  it('pedestrian routes never pass through a parked car', () => {
    const { issues } = routeAudit(w, cars.map(carBox));
    expect([...new Set(issues)].slice(0, 10)).toEqual([]);
  });

  it('the bus loop stays on the asphalt, clear of parked cars and of everything built', () => {
    const p = busPath(w);
    expect(p.total).toBeGreaterThan(200);
    for (let s = 0; s < p.total; s += 1) {
      const q = alongBus(p, s);
      const inCrossing = Object.values(w.nodes).some(n => Math.abs(n.x - q.x) <= 2.41 - BUS.width / 2 && Math.abs(n.z - q.z) <= 2.41 - BUS.width / 2);
      expect(inCrossing || roadOf(q.x, q.z, 2.21 - BUS.width / 2) ? null : `${q.x.toFixed(2)},${q.z.toFixed(2)} @${s}`).toBeNull();
      for (const c of cars) { const b = carBox(c); expect(q.x > b.x0 - 1.1 && q.x < b.x1 + 1.1 && q.z > b.z0 - 1.1 && q.z < b.z1 + 1.1).toBe(false); }
      const bp: Part = { id: 'bus', tag: 'bus', min: [q.x - 1.05, 0.3, q.z - 1.05], max: [q.x + 1.05, 3.0, q.z + 1.05] };
      const hit = solid.find(x => overlap(bp, x));
      expect(hit ? `${hit.id}:${hit.tag} @${s}` : null).toBeNull();
    }
  });

  it('runs to a timetable: on the hour from 6:00, one loop, back at the stop', () => {
    const p = busPath(w);
    expect(busScheduled(5 * 60 + 30, p.total)).toBe(0);
    expect(busScheduled(8 * 60, p.total)).toBe(0);
    expect(busScheduled(8 * 60 + 10, p.total)).toBeCloseTo(10 * BUS.speed);
    expect(busScheduled(8 * 60 + 59, p.total)).toBe(p.total);
    expect(p.total / BUS.speed).toBeLessThan(50);
  });
});
