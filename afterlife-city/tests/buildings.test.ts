import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { advance } from '../src/sim/engine';
import { buildCity } from '../src/render/buildings/city';
import { windowLight } from '../src/render/buildings/Buildings';
import { proposeShop } from '../src/sim/interventions';

describe('building geometry (V2)', () => {
  const w = createWorld();
  const B = buildCity(w);
  it('every building has a range, finite geometry and plausible size', () => {
    const ids = new Set(B.ranges.map(r => r.id));
    for (const b of Object.values(w.buildings)) expect(ids.has(b.id), b.id).toBe(true);
    for (const buf of [B.solid, B.glass, B.sign]) {
      expect(buf.pos.every(Number.isFinite) && buf.nor.every(Number.isFinite)).toBe(true);
      expect(buf.pos.length).toBe(buf.col.length);
      expect(buf.uv.length / 2).toBe(buf.pos.length / 3);
    }
    const tris = B.solid.pos.length / 9 + B.glass.pos.length / 9 + B.sign.pos.length / 9;
    expect(tris).toBeGreaterThan(5000);
    expect(tris).toBeLessThan(120_000);  // mobile budget guard
  });
  it('ranges are contiguous and non-overlapping', () => {
    let prev = 0;
    for (const r of B.ranges) { expect(r.start).toBe(prev); expect(r.end).toBeGreaterThan(r.start); prev = r.end; }
  });
  it('geometry stays inside each building footprint (+ small overhang) so the layout is unchanged', () => {
    // solid vertices belonging to a range must be within footprint + 4 units (terraces/awnings/canopies)
    const P = B.solid.pos;
    for (const r of B.ranges) {
      const b = w.buildings[r.id]; if (!b) continue;
      for (let t = r.start * 3; t < r.end * 3; t++) {
        const x = P[t * 3], z = P[t * 3 + 2];
        expect(Math.abs(x - b.x), `${b.id} x`).toBeLessThan(b.w / 2 + 5);
        expect(Math.abs(z - b.z), `${b.id} z`).toBeLessThan(b.d / 2 + 5);
      }
    }
  });
  it('shops get sign cells with their names; closed shops lose them', () => {
    expect(B.cells.some(c => c.text === 'カフェ・ルナ')).toBe(true);
    const w2 = createWorld(); w2.buildings['b_cafe'].status = 'closed';
    expect(buildCity(w2).cells.some(c => c.text === 'カフェ・ルナ')).toBe(false);
  });
  it('terraces expose seat anchors for future resident behaviour', () => {
    expect(B.anchors.filter(a => a.kind === 'seat' && a.buildingId === 'b_cafe').length).toBeGreaterThanOrEqual(8);
    expect(B.anchors.filter(a => a.kind === 'door').length).toBeGreaterThan(15);
  });
  it('rebuilds after construction completes and adds the new building', () => {
    const w3 = createWorld(); proposeShop(w3, 'lot_old', 'cafe'); advance(w3, 4 * 1440);
    const n = buildCity(w3);
    expect(n.ranges.some(r => r.id.startsWith('b_n'))).toBe(true);
  });
  it('windows follow who is inside: lit when someone is home and awake, dark when asleep or closed', () => {
    const w = createWorld();
    const h = w.buildings['b_house4'];
    for (const c of Object.values(w.citizens)) if (c.homeId === h.id) { c.currentLocation = h.id; c.activity = 'home'; }
    expect(windowLight(w, h)).toBeGreaterThan(0.5);
    for (const c of Object.values(w.citizens)) if (c.homeId === h.id) c.activity = 'sleep';
    expect(windowLight(w, h)).toBeLessThan(0.1);
    const cafe = w.buildings['b_cafe']; w.time = Math.floor(w.time / 1440) * 1440 + 23 * 60;
    expect(windowLight(w, cafe)).toBeLessThan(0.1);
    w.time = Math.floor(w.time / 1440) * 1440 + 12 * 60;
    expect(windowLight(w, cafe)).toBeGreaterThan(0.9);
  });
});

import { migrateWorld, BUILDING_SPECS } from '../src/sim/world';
import { parseSave } from '../src/store/persist';
describe('save migration', () => {
  it('old saves get the new building heights; nothing else changes', () => {
    const w = createWorld();
    for (const b of Object.values(w.buildings)) b.h = 4;            // an old, low-rise save
    const before = JSON.stringify({ ...w, buildings: undefined });
    const rec = parseSave(JSON.stringify({ world: w, savedAtMs: 0, speed: 1, aiEnabled: true }))!;
    for (const s of BUILDING_SPECS) expect(rec.world.buildings[s.id].h).toBe(s.h);
    expect(JSON.stringify({ ...rec.world, buildings: undefined })).toBe(before);
    expect(migrateWorld(rec.world)).toBe(rec.world);
  });
});
