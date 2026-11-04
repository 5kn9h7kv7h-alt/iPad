import { describe, expect, it } from 'vitest';
import { computeAtmosphere, createAtmosphere, sunElevation, WEATHER_TARGET } from '../src/render/environment/atmosphere';

const at = (h: number, wx = 'clear', season = 'spring' as const) => computeAtmosphere(createAtmosphere(), h, season, WEATHER_TARGET[wx]);
const lum = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('atmosphere (time-of-day art direction)', () => {
  it('sun is up by day and down at night', () => {
    expect(sunElevation(12.5, 'spring').e).toBeGreaterThan(0.6);
    expect(sunElevation(1, 'spring').e).toBeLessThan(0);
  });
  it('is continuous across the whole day (no popping)', () => {
    let prev = at(0);
    let prevI = prev.sunIntensity, prevH = lum(prev.skyHorizon);
    for (let h = 0.1; h <= 24; h += 0.1) {
      const a = at(h);
      expect(Math.abs(a.sunIntensity - prevI)).toBeLessThan(0.3);
      expect(Math.abs(lum(a.skyHorizon) - prevH)).toBeLessThan(0.1);
      prevI = a.sunIntensity; prevH = lum(a.skyHorizon);
    }
  });
  it('evening is warmer than noon; morning is paler/yellower than evening', () => {
    const noon = at(12.5), eve = at(17.8), morn = at(6.4);
    expect(eve.sunColor.r - eve.sunColor.b).toBeGreaterThan(noon.sunColor.r - noon.sunColor.b + 0.2);
    expect(eve.skyHorizon.r / eve.skyHorizon.b).toBeGreaterThan(noon.skyHorizon.r / noon.skyHorizon.b);
    expect(lum(morn.skyHorizon)).toBeGreaterThan(lum(eve.skyHorizon) * 0.9);
    expect(eve.sunDir.y).toBeLessThan(0.35); // low sun = long shadows
  });
  it('golden hour is bright and warm, not dim', () => {
    const g = at(17.5);
    expect(g.sunIntensity).toBeGreaterThan(1.2);
    expect(g.exposure).toBeGreaterThan(1.0);
    expect(g.hemiIntensity).toBeGreaterThan(0.6);
  });
  it('night is dark with a moon and stars, and exposure stays sane', () => {
    const n = at(23);
    expect(n.night).toBeGreaterThan(0.9);
    expect(n.sunIntensity).toBe(0);
    expect(n.moonIntensity).toBeGreaterThan(0.2);
    for (let h = 0; h < 24; h += 0.5) { const a = at(h); expect(a.exposure).toBeGreaterThan(0.7); expect(a.exposure).toBeLessThan(1.3); }
  });
  it('overcast and fog dim the sun and thicken the haze', () => {
    expect(at(12.5, 'rain').sunIntensity).toBeLessThan(at(12.5).sunIntensity * 0.6);
    expect(at(8, 'fog').fogDensity).toBeGreaterThan(at(8).fogDensity * 4);
  });
  it('never over-saturates (no harsh orange filter)', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const c = at(h).skyHorizon; const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
      expect(hsl.s).toBeLessThan(0.95);
    }
  });
});
