import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { advance } from '../src/sim/engine';
import { buildCity } from '../src/render/buildings/city';
import { litFractions } from '../src/render/buildings/Buildings';
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
  it('windows light up in the evening, not at noon', () => {
    expect(litFractions(12).home).toBe(0);
    expect(litFractions(21).home).toBeGreaterThan(0.5);
    expect(litFractions(3).home).toBeLessThan(0.15);
    expect(litFractions(14).shop).toBeGreaterThan(litFractions(3).shop);
  });
});
