// Deterministic seeded RNG (mulberry32). State lives in WorldState so saves are reproducible.
import type { WorldState } from './types';

export function rand(w: Pick<WorldState, 'rngState'>): number {
  let t = (w.rngState = (w.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (w: Pick<WorldState, 'rngState'>, lo: number, hi: number) => lo + Math.floor(rand(w) * (hi - lo + 1));
export function pick<T>(w: Pick<WorldState, 'rngState'>, arr: readonly T[]): T { return arr[Math.floor(rand(w) * arr.length)]; }
export const chance = (w: Pick<WorldState, 'rngState'>, p: number) => rand(w) < p;
export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
