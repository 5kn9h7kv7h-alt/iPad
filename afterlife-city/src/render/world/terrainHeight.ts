// The landscape around Lumière Bay as one pure height function. The town itself (where residents live
// and walk) stays perfectly flat; hills rise behind it, headlands frame the bay, and the seabed drops away.
export const TOWN = { x0: -84, x1: 84, z0: -62, z1: 52 };

function hash(x: number, z: number): number { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Coastline z at a given x: straight along the town, curving out to sea on the two headlands. */
export function coastZ(x: number): number {
  if (x < -86) return 52 + Math.min(70, (-86 - x) * 0.95);
  if (x > 84) return 52 + Math.min(60, (x - 84) * 0.8);
  return 52;
}

/** Distance outside the town rectangle (0 inside). */
function outside(x: number, z: number): number {
  const dx = Math.max(TOWN.x0 - x, 0, x - TOWN.x1), dz = Math.max(TOWN.z0 - z, 0);
  return Math.hypot(dx, dz);
}

export function heightAt(x: number, z: number): number {
  const cz = coastZ(x);
  if (z > cz) return -2.5 - (z - cz) * 0.18;                        // seabed (under the water plane)
  const o = outside(x, z);
  if (o <= 0) return -0.05;                                          // the town: flat
  const n = fbm(x * 0.018, z * 0.018, 5);
  // hills behind the town, rising to a mountain range far back
  const north = sstep(TOWN.z0, TOWN.z0 - 60, z) * (16 + n * 18) + sstep(-150, -230, z) * (48 + fbm(x * 0.008, 3.1, 4) * 60);
  // flanks and headlands
  const side = sstep(84, 120, Math.abs(x)) * (12 + n * 16);
  let h = Math.max(north, side) * sstep(0, 14, o);
  // cliffs: land meets the sea abruptly on the headlands, gently along the town beach
  const inland = cz - z;
  if (Math.abs(x) > 86) h = Math.max(h, sstep(0, 5, inland) * (4 + n * 7)) * sstep(-1, 2.5, inland);
  // gentle terracing on the slopes behind the town (where the hillside houses stand)
  if (z < TOWN.z0 && z > -150 && Math.abs(x) < 150) h = h - (h % 3.2) * 0.35;
  return h + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 0.6 * sstep(0, 10, o) - 0.05;
}

/** Slope magnitude (for colouring rock vs grass). */
export function slopeAt(x: number, z: number): number {
  const e = 1.2;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}
