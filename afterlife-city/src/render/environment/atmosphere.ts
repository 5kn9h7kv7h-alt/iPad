// Time-of-day art direction. Pure function: (hour, season, smoothed weather) -> colours & light levels.
// Palette is deliberately muted: Sand Beige, Warm Cream, Terracotta, Golden Yellow, Muted Coastal Blue, Olive Green.
import * as THREE from 'three';
import { SUNRISE, SUNSET } from '../../sim/environment';
import type { Season } from '../../sim/types';

export interface WeatherLook { grey: number; cover: number; fog: number }

export interface Atmosphere {
  elevation: number;           // sin(sun altitude); <0 = below horizon
  evening: boolean;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  moonIntensity: number;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  exposure: number;
  night: number;               // 0..1
  sunGlow: number;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  cover: number;
  seaDeep: THREE.Color;
  seaShallow: THREE.Color;
}

const C = (h: string) => new THREE.Color(h);
const NIGHT_TOP = C('#0a1429'), NIGHT_HOR = C('#1d2b4a');
const DAY_TOP = C('#6b9fc4'), DAY_HOR = C('#d3e2e0');
const MORN_HOR = C('#f1e2b8');        // soft pale yellow
const EVE_HOR = C('#f0a24f'), EVE_TOP = C('#7a8fb0'); // warm golden hour
const DUSK_HOR = C('#c98a7a');        // after the sun is gone: dusty rose into blue
const OVC_TOP = C('#8e9aa1'), OVC_HOR = C('#b7bcb8');
const SUN_HIGH = C('#fff3dc'), SUN_MORN = C('#ffe7b0'), SUN_EVE = C('#ffad5c');
const MOON = C('#8fa6d8');
const SEA_DEEP_DAY = C('#2b6279'), SEA_SHALLOW_DAY = C('#5e9a9c'), SEA_NIGHT = C('#0a1a2e');

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const MAX_ELEV: Record<Season, number> = { spring: 0.78, summer: 0.93, autumn: 0.68, winter: 0.5 };

export function sunElevation(hour: number, season: Season): { e: number; azimuthT: number } {
  const rise = SUNRISE[season], set = SUNSET[season];
  if (hour >= rise && hour <= set) {
    const t = (hour - rise) / (set - rise);
    return { e: Math.sin(Math.PI * t) * MAX_ELEV[season], azimuthT: t };
  }
  const nightLen = 24 - (set - rise);
  const u = ((hour - set + 24) % 24) / nightLen;
  return { e: -Math.sin(Math.PI * u) * 0.45, azimuthT: u };
}

export function createAtmosphere(): Atmosphere {
  return {
    elevation: 1, evening: false, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunIntensity: 0, moonIntensity: 0,
    skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
    fogColor: new THREE.Color(), fogDensity: 0.003, exposure: 1, night: 0, sunGlow: 1, cloudLit: new THREE.Color(), cloudShade: new THREE.Color(),
    cover: 0.3, seaDeep: new THREE.Color(), seaShallow: new THREE.Color(),
  };
}

const tmp = new THREE.Color();

/** Fills `a` in place (no allocation per frame). */
export function computeAtmosphere(a: Atmosphere, hour: number, season: Season, wx: WeatherLook): Atmosphere {
  const { e, azimuthT } = sunElevation(hour, season);
  const evening = hour >= 12;
  const dayAmt = sstep(-0.12, 0.2, e);
  const low = 1 - sstep(0.0, 0.5, e);              // 1 at horizon .. 0 high sun
  const golden = low * dayAmt;
  a.elevation = e; a.evening = evening;
  a.night = 1 - sstep(-0.22, 0.04, e);

  // sun direction: east (+x) at sunrise -> west (-x) at sunset, slightly south (+z)
  if (e >= 0) a.sunDir.set(Math.cos(Math.PI * azimuthT), Math.max(e, 0.02), 0.38).normalize();
  else a.sunDir.set(-Math.cos(Math.PI * azimuthT), 0.02, 0.38).normalize();

  // sky
  a.skyTop.copy(NIGHT_TOP).lerp(DAY_TOP, dayAmt);
  a.skyHorizon.copy(NIGHT_HOR).lerp(DAY_HOR, dayAmt);
  if (evening) {
    a.skyHorizon.lerp(EVE_HOR, golden * 1.0);
    a.skyTop.lerp(EVE_TOP, golden * 0.55);
    // short dusk afterglow just below the horizon
    const dusk = sstep(-0.22, -0.02, e) * (1 - dayAmt);
    a.skyHorizon.lerp(DUSK_HOR, dusk * 0.7);
  } else {
    a.skyHorizon.lerp(MORN_HOR, golden * 0.8);
    a.skyTop.lerp(C('#8db3c8'), golden * 0.35);
  }
  // overcast: pull towards grey, keep the luminance of the time of day
  const lum = 0.25 + 0.75 * dayAmt;
  a.skyTop.lerp(tmp.copy(OVC_TOP).multiplyScalar(lum), wx.grey);
  a.skyHorizon.lerp(tmp.copy(OVC_HOR).multiplyScalar(lum), wx.grey);

  // sun / moon
  a.sunColor.copy(SUN_HIGH).lerp(evening ? SUN_EVE : SUN_MORN, low);
  const clear = 1 - wx.grey * 0.65;
  a.sunIntensity = 2.5 * sstep(-0.08, 0.14, e) * (0.78 + 0.22 * sstep(0.04, 0.5, e)) * clear;
  a.moonIntensity = 0.5 * a.night * (1 - wx.grey * 0.6);
  a.sunGlow = sstep(-0.05, 0.1, e) * (1 - wx.grey * 0.7);

  // ambient: sky-coloured above, warm olive-sand bounce below
  a.hemiSky.copy(a.skyTop).lerp(a.skyHorizon, 0.5).lerp(MOON, a.night * 0.35);
  a.hemiGround.copy(C('#6e6a45')).lerp(C('#e0a45f'), golden * 0.35).multiplyScalar(0.45 + 0.55 * dayAmt);
  a.hemiIntensity = 0.42 + 0.42 * dayAmt + golden * 0.2;

  // fog follows the horizon so distance dissolves into the sky
  a.fogColor.copy(a.skyHorizon);
  a.fogDensity = 0.0024 + wx.fog * 0.015 + wx.grey * 0.0018 + golden * 0.0008;

  // exposure: slightly lower at night, slightly warmer-brighter at golden hour
  a.exposure = 0.78 + 0.3 * dayAmt + golden * 0.2;

  a.cover = wx.cover;
  a.cloudLit.copy(C('#f6f0e2')).lerp(evening ? C('#ffc486') : C('#fff0c8'), golden).lerp(C('#3b4a6b'), a.night * 0.85);
  a.cloudShade.copy(a.skyHorizon).multiplyScalar(0.62).lerp(a.skyTop, 0.3);

  a.seaDeep.copy(SEA_NIGHT).lerp(SEA_DEEP_DAY, dayAmt).lerp(tmp.copy(C('#4e6670')).multiplyScalar(lum), wx.grey * 0.6);
  a.seaShallow.copy(SEA_NIGHT).lerp(SEA_SHALLOW_DAY, dayAmt).lerp(tmp.copy(C('#7d9a98')).multiplyScalar(lum), wx.grey * 0.6);
  return a;
}

export const WEATHER_TARGET: Record<string, WeatherLook> = {
  clear: { grey: 0, cover: 0.3, fog: 0 },
  cloudy: { grey: 0.5, cover: 0.68, fog: 0 },
  rain: { grey: 0.85, cover: 0.9, fog: 0.15 },
  fog: { grey: 0.75, cover: 0.55, fog: 1 },
};
