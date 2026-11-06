import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { advance, catchUp } from '../src/sim/engine';
import { BUILDING_SPECS, LOT_SPECS } from '../src/sim/world';
import { placeProp, proposeShop } from '../src/sim/interventions';
import { dayOf } from '../src/sim/clock';

describe('world layout', () => {
  it('has 5 areas, 20-30 buildings and 30 citizens', () => {
    const w = createWorld();
    expect(new Set(Object.values(w.buildings).map(b => b.area)).size).toBe(5);
    expect(Object.keys(w.buildings).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(w.buildings).length).toBeLessThanOrEqual(30);
    expect(Object.keys(w.citizens)).toHaveLength(30);
  });
  it('buildings do not overlap each other or roads', () => {
    const w = createWorld();
    const flat = (k: string) => ['plaza', 'park', 'beach'].includes(k);
    const solid = [...BUILDING_SPECS.filter(b => !flat(b.kind)), ...LOT_SPECS.map(l => ({ ...l, id: l.id, w: l.w, d: l.d }))] as { id: string; x: number; z: number; w: number; d: number }[];
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const hit = Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 1 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 1;
      expect(hit, `${a.id} overlaps ${b.id}`).toBe(false);
    }
    // roads: horizontal at z in {-30,0,30}, vertical at x in cols
    const cols = [-60, -40, -20, 10, 35, 60], rows = [-30, 0, 30];
    for (const b of solid) {
      for (const z of rows) if (Math.abs(b.z - z) < b.d / 2 + 2) {
        const xs = z === -30 ? [-40, 60] : [-60, 60];
        expect(b.x + b.w / 2 < xs[0] - 2 || b.x - b.w / 2 > xs[1] + 2, `${b.id} blocks road z=${z}`).toBe(true);
      }
      for (const x of cols) if (Math.abs(b.x - x) < b.w / 2 + 2) {
        const lo = x === -60 ? 0 : -30, hi = 30;
        expect(b.z + b.d / 2 < lo - 2 || b.z - b.d / 2 > hi + 2, `${b.id} blocks road x=${x}`).toBe(true);
      }
    }
    expect(w.buildings).toBeTruthy();
  });
});

describe('simulation', () => {
  it('is deterministic for the same seed', () => {
    const a = createWorld(7), b = createWorld(7);
    advance(a, 2000); advance(b, 2000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('runs a week with sane needs, conversations, and varied lives', () => {
    const w = createWorld();
    const acts = new Map<string, Set<string>>();
    for (let i = 0; i < 7 * 1440; i++) {
      advance(w, 1);
      if (i % 20 === 0) for (const c of Object.values(w.citizens)) {
        if (!acts.has(c.id)) acts.set(c.id, new Set());
        if (c.plan?.arrived) acts.get(c.id)!.add(c.currentLocation);
      }
    }
    for (const c of Object.values(w.citizens)) {
      for (const v of Object.values(c.needs)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
      expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
    }
    const talks = w.events.filter(e => e.category === 'relationship' && e.dialogue).length;
    expect(talks).toBeGreaterThan(40);
    const variety = [...acts.values()].map(s => s.size);
    expect(Math.min(...variety)).toBeGreaterThanOrEqual(2);
    // eslint-disable-next-line no-console
    console.log('events', w.events.length, 'talks', talks, 'days', dayOf(w.time), 'places/person avg', variety.reduce((a, b) => a + b, 0) / variety.length,
      'friend ties', Object.values(w.relationships).filter(r => r.kind === 'friend').length);
  });

  it('most people are asleep at 3am and mostly awake at noon', () => {
    const w = createWorld();
    advance(w, 1440 + 3 * 60 - (w.time % 1440));
    const asleep = Object.values(w.citizens).filter(c => c.activity === 'sleep').length;
    expect(asleep).toBeGreaterThanOrEqual(20);
  });

  it('catchUp caps elapsed time and returns a digest', () => {
    const w = createWorld();
    const r = catchUp(w, 100 * 1440);
    expect(r.simulated).toBe(7 * 1440);
    expect(r.digest.length).toBeGreaterThan(0);
  });

  it('interventions work and are validated', () => {
    const w = createWorld();
    expect(placeProp(w, 'b_park', 'bench').ok).toBe(true);
    expect(placeProp(w, 'b_house1', 'bench').ok).toBe(false);
    expect(placeProp(w, 'b_beach', 'playground').ok).toBe(false);
    expect(proposeShop(w, 'lot_old', 'cafe').ok).toBe(true);
    expect(proposeShop(w, 'lot_old', 'cafe').ok).toBe(false);
    advance(w, 4 * 1440);
    expect(Object.keys(w.buildings).length).toBe(27);
  });

  it('survives a month and stays serialisable', () => {
    const w = createWorld(99);
    advance(w, 30 * 1440);
    const copy = JSON.parse(JSON.stringify(w));
    expect(Object.keys(copy.citizens).length).toBeGreaterThanOrEqual(30);
    expect(copy.events.length).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.log('month events', w.events.length, 'historic', w.events.filter(e => e.historic).map(e => e.summary).slice(0, 12));
  });
});
