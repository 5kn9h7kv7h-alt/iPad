import { describe, expect, it } from 'vitest';
import { backdropHouses, backdropBoxes } from '../src/render/world/backdrop';
import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/engine';
import { routeAudit } from './audit';

describe('background houses (visual only)', () => {
  const houses = backdropHouses();
  it('adds a dense townscape: hundreds on the hills, some infill in town', () => {
    const hill = houses.filter(h => h.kind === 'hill').length, town = houses.filter(h => h.kind === 'town').length;
    console.log({ hill, town });
    expect(hill).toBeGreaterThan(120);
    expect(town).toBeGreaterThan(8);
  });
  it('no pedestrian route crosses an infill house', () => {
    const boxes = backdropBoxes();
    const { issues } = routeAudit(createWorld(), boxes);
    expect(issues).toEqual([]);
  });
  it('two days of real walking never enter an infill house', () => {
    const w = createWorld(23);
    const boxes = backdropHouses().filter(h => h.kind === 'town').map(h => ({ x0: h.x - h.w / 2 + 0.2, x1: h.x + h.w / 2 - 0.2, z0: h.z - h.d / 2 + 0.2, z1: h.z + h.d / 2 - 0.2 }));
    let hits = 0;
    for (let i = 0; i < 2 * 1440; i++) { step(w); for (const c of Object.values(w.citizens)) if (boxes.some(b => c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1)) hits++; }
    expect(hits).toBe(0);
  });
});
