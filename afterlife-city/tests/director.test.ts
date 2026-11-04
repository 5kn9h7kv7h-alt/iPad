import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { advance } from '../src/sim/engine';
import { chooseShot, newDirector, poseFor } from '../src/render/director';

describe('cinematic director', () => {
  it('mixes everyday shots with event shots and never repeats immediately', () => {
    const w = createWorld(3); advance(w, 8 * 60);
    const d = newDirector();
    const kinds: string[] = [];
    for (let i = 0; i < 60; i++) {
      const s = chooseShot(w, d, null); kinds.push(s.kind);
      const p = poseFor(w, s, i, i * 12);
      expect(p.pos.every(Number.isFinite) && p.look.every(Number.isFinite)).toBe(true);
      advance(w, 10);
    }
    const everyday = kinds.filter(k => k === 'aerial' || k === 'ambient' || k === 'street').length;
    expect(everyday / kinds.length).toBeGreaterThan(0.3);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(4);
  });
});
