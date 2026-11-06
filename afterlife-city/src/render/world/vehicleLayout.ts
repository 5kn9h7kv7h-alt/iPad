// Where the decorative vehicles go. Pure data so the overlap audits can check it.
import type { WorldState } from '../../sim/types';

export type VName = 'car_a' | 'car_b' | 'car_c' | 'taxi' | 'bus' | 'sailboat' | 'sailship';
export const ROAD_Y = 0.12;

/** Parked cars: mid-block, against the kerb, on streets the bus never uses. */
const PARKED: { seg: [string, string]; t: number; side: 1 | -1; model: VName }[] = [
  { seg: ['n_10_-30', 'n_10_0'], t: 0.4, side: 1, model: 'car_a' }, { seg: ['n_10_0', 'n_10_30'], t: 0.55, side: -1, model: 'car_b' },
  { seg: ['n_35_-30', 'n_35_0'], t: 0.62, side: -1, model: 'car_c' }, { seg: ['n_35_0', 'n_35_30'], t: 0.36, side: 1, model: 'car_a' },
  { seg: ['n_-20_0', 'n_10_0'], t: 0.42, side: 1, model: 'car_b' }, { seg: ['n_10_0', 'n_35_0'], t: 0.6, side: -1, model: 'car_c' },
  { seg: ['n_35_0', 'n_60_0'], t: 0.5, side: 1, model: 'car_a' }, { seg: ['n_-20_-30', 'n_-20_0'], t: 0.36, side: -1, model: 'taxi' },
];
/** Streets are narrow (asphalt half-width 2.2, then the pavement): small European cars. */
export const CAR_HALF = { w: 0.8, l: 1.75 };
const KERB = 1.4; // car centre from the road centre line

export function parkedCars(w: WorldState): { x: number; z: number; yaw: number; model: VName }[] {
  return PARKED.flatMap(p => {
    const a = w.nodes[p.seg[0]], b = w.nodes[p.seg[1]];
    if (!a || !b) return [];
    const len = Math.hypot(b.x - a.x, b.z - a.z), fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    const rx = -fz, rz = fx; // right of travel
    // parked facing the direction of travel on its side of the road
    const yaw = Math.atan2(fx, fz) + (p.side < 0 ? Math.PI : 0);
    return [{ x: a.x + (b.x - a.x) * p.t + rx * KERB * p.side, z: a.z + (b.z - a.z) * p.t + rz * KERB * p.side, yaw, model: p.model }];
  });
}

/** Axis-aligned footprint (cars are parked along axis-aligned streets). */
export function carBox(c: { x: number; z: number; yaw: number }) {
  const along = Math.abs(Math.sin(c.yaw)) > 0.5 ? 'x' : 'z';
  const hx = along === 'x' ? CAR_HALF.l : CAR_HALF.w, hz = along === 'x' ? CAR_HALF.w : CAR_HALF.l;
  return { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz };
}

// ---------------------------------------------------------------- the town bus: a loop on existing roads, keeping right
export const BUS = { loop: ['n_60_-30', 'n_-40_-30', 'n_-40_0', 'n_-60_0', 'n_-60_30', 'n_60_30'], lane: 1.1, speed: 9, stopX: -12.5, len: 7.6, width: 2.1 };

export interface BusPath { pts: { x: number; z: number }[]; acc: number[]; total: number; stopS: number }
export function busPath(w: WorldState): BusPath {
  const P = BUS.loop.map(id => w.nodes[id]);
  const pts: { x: number; z: number }[] = [];
  const cut = 2.4, STEPS = 8; // corners are quadratic arcs, so the heading turns smoothly
  const leg = (i: number) => {
    const a = P[i], b = P[(i + 1) % P.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z), fx = (b.x - a.x) / len, fz = (b.z - a.z) / len, rx = -fz, rz = fx;
    return { a: { x: a.x + rx * BUS.lane, z: a.z + rz * BUS.lane }, b: { x: b.x + rx * BUS.lane, z: b.z + rz * BUS.lane }, fx, fz };
  };
  for (let i = 0; i < P.length; i++) {
    const L = leg(i), N = leg((i + 1) % P.length);
    if (i === 0) pts.push({ x: L.a.x + L.fx * cut, z: L.a.z + L.fz * cut }); // later legs begin where the previous arc ended
    const node = P[(i + 1) % P.length], p0 = { x: L.b.x - L.fx * cut, z: L.b.z - L.fz * cut }, c = { x: L.b.x + N.a.x - node.x, z: L.b.z + N.a.z - node.z }, p1 = { x: N.a.x + N.fx * cut, z: N.a.z + N.fz * cut };
    for (let k = 0; k < (i === P.length - 1 ? STEPS : STEPS + 1); k++) { // the last arc ends at pts[0]
      const t = k / STEPS, u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z });
    }
  }
  const acc = [0];
  for (let i = 1; i <= pts.length; i++) { const p = pts[i - 1], q = pts[i % pts.length]; acc.push(acc[i - 1] + Math.hypot(q.x - p.x, q.z - p.z)); }
  // distance (along the loop from pts[0]) at which the bus is beside the shelter on the first leg
  let stopS = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].x <= BUS.stopX) { stopS = acc[i - 1] + Math.abs(pts[i - 1].x - BUS.stopX); break; }
  return { pts, acc, total: acc[acc.length - 1], stopS };
}

export function alongBus(path: BusPath, s: number): { x: number; z: number; yaw: number } {
  s = ((s % path.total) + path.total) % path.total;
  let i = 0; while (i < path.pts.length - 1 && path.acc[i + 1] < s) i++;
  const a = path.pts[i], b = path.pts[(i + 1) % path.pts.length];
  const t = (s - path.acc[i]) / Math.max(1e-6, path.acc[i + 1] - path.acc[i]);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** Timetable: the bus leaves the station stop on the hour from 6:00 to 22:00 and runs one loop back to it.
 *  Returns how far along the loop (from the stop) it should be at this minute of the day. */
export const BUS_FIRST = 6, BUS_LAST = 22;
export function busScheduled(minuteOfDay: number, total: number): number {
  const h = Math.floor(minuteOfDay / 60);
  if (h < BUS_FIRST || h > BUS_LAST) return 0;
  return Math.min(total, (minuteOfDay - h * 60) * BUS.speed);
}
