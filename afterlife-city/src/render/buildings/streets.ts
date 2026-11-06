// Roads, sidewalks, lamps and street furniture — written into the same shared buffers as the buildings.
// Furniture is deterministic (hash of ids), so the town looks the same every time, and every seat is an anchor.
import * as THREE from 'three';
import type { WorldState } from '../../sim/types';
import type { Batch } from './batch';
import { PAL } from './designs';
import { clear } from './space';
import { MAT } from './batch';

/** Old town streets (and the station square) are cobbled; the rest is asphalt. */
const cobbled = (x: number, z: number) => x < -15 && z < 25;
const COBBLE = '#c2b39b';

const ASPHALT = '#58534c', CURB = '#cdc2a8', PAINT = '#ece0b4';
const HALF = 2.2, WALK = 1.2;
const hash = (s: string) => { let h = 11; for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) % 100003; return h; };
const col = (h: string) => new THREE.Color(h);

function bench(B: Batch, x: number, z: number, yaw: number, parent: string, color = PAL.wood): void {
  B.frame(x, z, yaw, () => {
    B.block(0, 0.42, 0, 1.9, 0.1, 0.55, col(color));
    B.block(0, 0.75, -0.25, 1.9, 0.45, 0.08, col(color));
    for (const sx of [-0.8, 0.8]) B.block(sx, 0, 0, 0.1, 0.42, 0.5, col(PAL.slate));
    B.anchor('seat', -0.45, 0.05, 0, parent); B.anchor('seat', 0.45, 0.05, 0, parent);
  });
}
function bike(B: Batch, x: number, z: number, yaw: number): void {
  B.frame(x, z, yaw, () => {
    for (const dz of [-0.55, 0.55]) B.put('cyl', [0, 0.34, dz], [0.34, 0.05, 0.34], col('#2c2f33'), [0, 0, Math.PI / 2]);
    B.box(0, 0.62, 0, 0.06, 0.07, 1.2, col(PAL.teal));
    B.put('box', [0, 0.62, 0.15], [0.06, 0.07, 0.8], col(PAL.teal), [0.7, 0, 0]);
    B.box(0, 0.98, -0.5, 0.08, 0.08, 0.2, col('#2c2f33'));
    B.box(0, 0.88, 0.5, 0.5, 0.05, 0.05, col('#2c2f33'));
    B.put('box', [0, 0.65, 0.5], [0.05, 0.5, 0.05], col('#2c2f33'), [0.3, 0, 0]);
  });
}
function pot(B: Batch, x: number, z: number, flower: string): void {
  B.cyl(x, 0, z, 0.32, 0.5, col(PAL.terracotta));
  B.put('dome', [x, 0.5, z], [0.4, 0.45, 0.4], col(PAL.olive));
  for (let i = 0; i < 4; i++) B.box(x + Math.cos(i * 1.6) * 0.2, 0.85 + (i % 2) * 0.08, z + Math.sin(i * 1.6) * 0.2, 0.12, 0.12, 0.12, col(flower));
}
function bin(B: Batch, x: number, z: number): void { B.cyl(x, 0, z, 0.3, 0.8, col('#4f5b52')); B.cyl(x, 0.8, z, 0.33, 0.08, col('#3a423c')); }
function bollard(B: Batch, x: number, z: number): void { B.cyl(x, 0, z, 0.2, 0.55, col('#3c4046')); B.cyl(x, 0.55, z, 0.24, 0.1, col(PAL.golden)); }
function crate(B: Batch, x: number, z: number, s = 1, c = PAL.wood, ry = 0): void { B.box(x, 0.3 * s, z, 0.8 * s, 0.6 * s, 0.8 * s, col(c), ry); }
function barrel(B: Batch, x: number, z: number, c = PAL.blue): void { B.cyl(x, 0, z, 0.4, 0.9, col(c)); B.cyl(x, 0.45, z, 0.42, 0.06, col(PAL.slate)); }
/** Cast-iron lantern: stepped plinth, slim pole with collars, glazed lantern under a pyramid cap. */
function lampPost(B: Batch, x: number, z: number, tall = 4.6): void {
  const iron = col('#262b2c');
  const ring = (y0: number, r: number, h: number) => B.put('cyl8', [x, y0 + h / 2, z], [r, h, r], iron); // 8-sided: cheap
  ring(0, 0.22, 0.32); ring(0.32, 0.16, 0.34); ring(0.66, 0.11, 0.08);
  ring(0.74, 0.07, tall - 1.0);                                // pole
  ring(1.6, 0.1, 0.07); ring(tall - 0.4, 0.12, 0.1);           // collars
  ring(tall - 0.3, 0.17, 0.08);                                // lantern base
  B.lamp(x, tall + 0.03, z, 0.19, '#ffd9a0', 0.56);            // glass
  for (const [dx, dz] of [[0.17, 0], [-0.17, 0], [0, 0.17], [0, -0.17]]) B.block(x + dx, tall - 0.24, z + dz, 0.035, 0.56, 0.035, iron);
  B.hip(x, tall + 0.32, z, 0.5, 0.5, 0.26, iron);              // cap
  ring(tall + 0.56, 0.03, 0.16);                               // finial
  B.anchor('lamp', x, z, undefined, 'street');
}

/** Try candidate spots in order and build at the first one that is clear. */
function place(B: Batch, w: WorldState, r: number, spots: [number, number][], build: (x: number, z: number) => void, tag: string): boolean {
  for (const [x, z] of spots) if (clear(w, B.parts, x, z, r)) { B.tag = tag; build(x, z); B.tag = ''; return true; }
  return false;
}

export function designStreet(B: Batch, w: WorldState): void {
  B.begin('street', 0, 0, 0);
  const nodes = Object.values(w.nodes);
  const seen = new Set<string>();

  // ---- roads & sidewalks
  for (const n of nodes) {
    B.mat = cobbled(n.x, n.z) ? MAT.cobble : MAT.flat;
    B.block(n.x, 0.0, n.z, HALF * 2 + 0.4, 0.12, HALF * 2 + 0.4, col(cobbled(n.x, n.z) ? COBBLE : ASPHALT));
    B.mat = MAT.stone;
    const has = (dx: number, dz: number) => n.links.some(l => Math.sign(w.nodes[l].x - n.x) === dx && Math.sign(w.nodes[l].z - n.z) === dz);
    // pavement corners only where two roads meet at a right angle
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (has(sx, 0) && has(0, sz)) B.block(n.x + sx * (HALF + WALK / 2 + 0.1), 0, n.z + sz * (HALF + WALK / 2 + 0.1), WALK + 0.2, 0.16, WALK + 0.2, col(CURB));
  }
  for (const n of nodes) for (const lid of n.links) {
    const key = [n.id, lid].sort().join('|');
    if (seen.has(key)) continue; seen.add(key);
    const m = w.nodes[lid];
    const horiz = n.z === m.z;
    const len = Math.hypot(m.x - n.x, m.z - n.z);
    const cx = (n.x + m.x) / 2, cz = (n.z + m.z) / 2;
    const inner = len - (HALF * 2);                 // between intersections
    const cob = cobbled(cx, cz);
    const road = col(cob ? COBBLE : ASPHALT);
    if (horiz) {
      B.mat = cob ? MAT.cobble : MAT.flat; B.block(cx, 0, cz, len, 0.12, HALF * 2, road);
      B.mat = MAT.stone; for (const sz of [-1, 1]) B.block(cx, 0, cz + sz * (HALF + WALK / 2), inner, 0.16, WALK, col(CURB));
      B.mat = MAT.flat;
      const dashes = cob ? 0 : Math.floor(inner / 4.5);
      for (let i = 0; i < dashes; i++) B.block(cx - inner / 2 + (i + 0.5) * (inner / dashes), 0.12, cz, 1.6, 0.01, 0.16, col(PAINT));
    } else {
      B.mat = cob ? MAT.cobble : MAT.flat; B.block(cx, 0, cz, HALF * 2, 0.12, len, road);
      B.mat = MAT.stone; for (const sx of [-1, 1]) B.block(cx + sx * (HALF + WALK / 2), 0, cz, WALK, 0.16, inner, col(CURB));
      B.mat = MAT.flat;
      const dashes = cob ? 0 : Math.floor(inner / 4.5);
      for (let i = 0; i < dashes; i++) B.block(cx, 0.12, cz - inner / 2 + (i + 0.5) * (inner / dashes), 0.16, 0.01, 1.6, col(PAINT));
    }
    // zebra crossings near both ends
    B.mat = MAT.flat;
    for (const [e, other] of [[n, m], [m, n]] as const) {
      const dx = Math.sign(other.x - e.x), dz = Math.sign(other.z - e.z);
      // centred on the line pedestrians actually cross on (sidewalk centre, 2.5–3.1 from the node)
      const px = e.x + dx * (HALF + 0.65), pz = e.z + dz * (HALF + 0.65);
      for (let i = -3; i <= 3; i++) {
        if (horiz) B.block(px, 0.12, pz + i * 0.58, 1.05, 0.01, 0.3, col(PAINT));
        else B.block(px + i * 0.58, 0.12, pz, 0.3, 0.01, 1.05, col(PAINT));
      }
    }
    // mid-segment lamps on alternating sides
    const count = Math.floor(len / 22);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const x = n.x + (m.x - n.x) * t, z = n.z + (m.z - n.z) * t;
      const side = (i + hash(key)) % 2 ? 1 : -1, off = HALF + WALK + 0.45;
      const at = (sd: number): [number, number] => (horiz ? [x, z + sd * off] : [x + sd * off, z]);
      place(B, w, 0.25, [at(side), at(-side)], (lx, lz) => lampPost(B, lx, lz), 'lamp');
    }
  }
  const corner = HALF + WALK + 0.45;
  for (const n of nodes) place(B, w, 0.25, [[n.x + corner, n.z + corner], [n.x - corner, n.z + corner], [n.x + corner, n.z - corner], [n.x - corner, n.z - corner]], (x, z) => lampPost(B, x, z), 'lamp');

  B.mat = -1;
  // ---- per-building furniture (placed at each door anchor, mirrored into world space)
  const doors = B.anchors.filter(a => a.kind === 'door');
  for (const d of doors) {
    const b = w.buildings[d.buildingId]; if (!b || b.status !== 'open') continue;
    let nx = d.x - b.x, nz = d.z - b.z; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    const tx = -nz, tz = nx, h = hash(b.id);
    const at = (f: number, s: number): [number, number] => [d.x + nx * f + tx * s, d.z + nz * f + tz * s];
    const yawAlong = Math.atan2(tx, tz);
    const sides = h % 2 ? [1, -1] : [-1, 1];
    if (['house', 'apartment', 'cafe', 'shop', 'bookstore', 'convenience'].includes(b.kind) && h % 3 !== 0)
      place(B, w, 0.75, sides.flatMap(sd => [at(-0.3, sd * 2.2), at(-0.3, sd * 3.0)]), (x, z) => bike(B, x, z, yawAlong + (h % 5) * 0.1), 'bike');
    if (['house', 'cafe', 'shop', 'bookstore', 'restaurant', 'apartment'].includes(b.kind))
      place(B, w, 0.45, sides.flatMap(sd => [at(-0.5, -sd * 1.5), at(-0.5, -sd * 2.4)]), (x, z) => pot(B, x, z, [PAL.golden, '#c4607a', '#e9e2cf', PAL.terracotta][h % 4]), 'pot');
    if (['convenience', 'restaurant'].includes(b.kind) || b.id === 'b_station')
      place(B, w, 0.35, [at(-0.3, -2.4), at(-0.3, 2.4), at(-0.3, -3.2)], (x, z) => bin(B, x, z), 'bin');
    if (b.kind === 'convenience')
      place(B, w, 0.6, [at(-0.4, 2.6), at(-0.4, -2.8)], (x, z) => B.frame(x, z, Math.atan2(nx, nz), () => { B.block(0, 0, 0, 0.9, 1.9, 0.75, col('#b8402f')); B.lamp(0, 1.2, 0.4, 0.3, '#cfe8ff'); }), 'vending');
  }

  // ---- fixed public seating and plaza / park / lookout details
  const put = (id: string, pts: [number, number, number][]) => {
    const a = w.buildings[id];
    for (const [x, z, yaw] of pts) {
      const tries: [number, number][] = [[x, z]];
      if (a) for (let k = 1; k <= 4; k++) tries.push([x + (a.x - x) * 0.18 * k, z + (a.z - z) * 0.18 * k]);
      place(B, w, 1.0, tries, (bx, bz) => bench(B, bx, bz, yaw, id), 'bench');
    }
  };
  const b = w.buildings;
  if (b.b_park) put('b_park', [[b.b_park.x - 5, b.b_park.z + 1.4, 0], [b.b_park.x + 5, b.b_park.z + 1.4, 0], [b.b_park.x - 2, b.b_park.z - 1.8, Math.PI], [b.b_park.x + 3, b.b_park.z - 1.8, Math.PI]]);
  if (b.b_plaza) put('b_plaza', [[b.b_plaza.x - 4, b.b_plaza.z - 1.4, Math.PI], [b.b_plaza.x + 4, b.b_plaza.z - 1.4, Math.PI], [b.b_plaza.x, b.b_plaza.z + 1.4, 0]]);
  if (b.b_promenade) { const p = b.b_promenade; const pts: [number, number, number][] = []; for (let i = 0; i < 6; i++) pts.push([p.x - 15 + i * 6, p.z + 0.2, 0]); put('b_promenade', pts); for (let i = 0; i <= 8; i++) place(B, w, 0.25, [[p.x - 17 + i * 4.5, p.z + 1.6]], (x, z) => lampPost(B, x, z, 3.6), 'lamp'); }
  if (b.b_beach) put('b_beach', [[b.b_beach.x - 8, b.b_beach.z - 1.5, 0], [b.b_beach.x + 6, b.b_beach.z - 1.5, 0]]);
  if (b.b_lookout) put('b_lookout', [[b.b_lookout.x - 5, b.b_lookout.z + 2.2, 0], [b.b_lookout.x - 5, b.b_lookout.z - 2.2, 0]]);
  if (b.b_plaza) { // bus stop shelter at the east end of the station square, back from the curb
    const spots: [number, number][] = [[b.b_plaza.x + 12, b.b_plaza.z - 1.4], [b.b_plaza.x + 12, b.b_plaza.z - 3.0], [b.b_plaza.x - 12, b.b_plaza.z - 2.0]];
    place(B, w, 2.4, spots, (x, z) => {
      B.block(x, 2.5, z, 4.4, 0.15, 1.8, col(PAL.slate));
      for (const dx of [-2, 2]) B.block(x + dx, 0, z - 0.7, 0.12, 2.5, 0.12, col(PAL.slate));
      B.block(x, 0.8, z - 0.8, 4.2, 1.5, 0.06, col('#9fb6bd'));
      bench(B, x, z - 0.2, 0, 'b_plaza');
      B.cyl(x + 2.6, 0, z + 0.6, 0.07, 3.0, col('#2c3036')); B.box(x + 2.6, 3.1, z + 0.6, 0.7, 0.5, 0.06, col(PAL.blue));
    }, 'busstop');
  }

  // ---- seaside gazebo past the lighthouse (decorative; strollers by the lighthouse stay on its seaward ring)
  if (b.b_lookout) place(B, w, 3.0, [[b.b_lookout.x + 12, b.b_lookout.z + 4.5], [b.b_lookout.x + 12.5, b.b_lookout.z + 5.5]], (x, z) => {
    const white = col('#eee8da'), roof = col('#5f8b80'), R = 2.3;
    B.mat = MAT.stone; B.put('cyl8', [x, 0.15, z], [R + 0.35, 0.3, R + 0.35], col('#cbbfa8')); B.mat = -1;
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4, px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
      B.put('cyl8', [px, 1.6, pz], [0.08, 2.6, 0.08], white);
    }
    // railing between the posts, open towards the sea
    for (let k = 1; k < 8; k++) {
      const a0 = (k - 0.5) * Math.PI / 4, a1 = (k + 0.5) * Math.PI / 4;
      const mx = x + Math.sin((a0 + a1) / 2) * R * 0.924, mz = z + Math.cos((a0 + a1) / 2) * R * 0.924;
      B.box(mx, 0.95, mz, 2 * R * Math.sin(Math.PI / 8), 0.07, 0.07, white, (a0 + a1) / 2);
    }
    B.put('cyl8', [x, 2.95, z], [R + 0.25, 0.14, R + 0.25], white);                 // ring beam
    B.mat = MAT.roof; B.hip(x, 3.02, z, (R + 0.55) * 1.42, (R + 0.55) * 1.42, 1.5, roof);
    B.put('hip', [x, 3.02, z], [(R + 0.55) * 1.42, 1.5, (R + 0.55) * 1.42], roof, [0, Math.PI / 4, 0]); B.mat = -1;
    B.put('cyl8', [x, 4.75, z], [0.05, 0.5, 0.05], col('#3a3f3f'));
  }, 'gazebo');

  // ---- harbor: bollards, crates, barrels, drying racks, piers
  for (let x = -76; x <= -20; x += 5) bollard(B, x, 50.6);
  for (const px of [-70, -52, -34]) {
    B.block(px, 0.0, 56, 3.2, 0.5, 18, col('#7b6a58'));
    for (let k = 0; k < 6; k++) B.block(px, 0.5, 48.5 + k * 3.1, 3.2, 0.02, 0.12, col('#5a4b3c'));
    bollard(B, px - 1.3, 64.5); bollard(B, px + 1.3, 64.5); lampPost(B, px + 1.3, 53, 3.4);
  }
  if (b.b_warehouse) { const { x, z } = b.b_warehouse; for (let i = 0; i < 6; i++) crate(B, x - 9 + (i % 3) * 1.0, z + 7 + Math.floor(i / 3) * 1.0, 1, [PAL.wood, PAL.clay, PAL.wood][i % 3], i * 0.2); crate(B, x - 9, z + 7, 1, PAL.wood); crate(B, x - 8.4, z + 7.1, 0.8, PAL.clay); barrel(B, x + 9, z + 6, PAL.olive); barrel(B, x + 9.9, z + 6.4, PAL.blue); }
  if (b.b_fishery) { const { x, z } = b.b_fishery; for (let i = 0; i < 3; i++) { B.block(x + 8 + i * 1.8, 0, z + 5, 0.1, 2.2, 0.1, col(PAL.darkwood)); } B.block(x + 9.8, 2.0, z + 5, 4, 0.08, 0.08, col(PAL.darkwood)); for (let i = 0; i < 5; i++) B.block(x + 8.2 + i * 0.7, 1.0, z + 5, 0.12, 1.0, 0.04, col(PAL.sand)); }
  if (b.b_market) { const { x, z } = b.b_market; for (let i = 0; i < 4; i++) crate(B, x - 8 + i * 1.0, z + 6, 0.9, PAL.wood); barrel(B, x + 8, z + 6); }

  // ---- things the player has added (visual only; sim owns the data)
  for (const p0 of w.props) {
    const yaw = (hash(p0.id) % 8) * (Math.PI / 4);
    const area = w.buildings[p0.buildingId];
    let p = p0;
    const r = p0.kind === 'playground' ? 2.2 : p0.kind === 'bench' ? 1.0 : 0.5;
    if (!clear(w, B.parts, p0.x, p0.z, r) && area) {
      for (let k = 1; k <= 8; k++) {
        const a = k * 2.4, d = 0.8 + k * 0.5;
        const x = Math.max(area.x - area.w / 2 + r, Math.min(area.x + area.w / 2 - r, p0.x + Math.cos(a) * d)), z = Math.max(area.z - area.d / 2 + r, Math.min(area.z + area.d / 2 - r, p0.z + Math.sin(a) * d));
        if (clear(w, B.parts, x, z, r)) { p = { ...p0, x, z }; break; }
      }
    }
    B.tag = 'prop';
    if (p.kind === 'bench') bench(B, p.x, p.z, yaw, p.buildingId, PAL.golden);
    else if (p.kind === 'plant') { B.cyl(p.x, 0, p.z, 0.5, 0.5, col(PAL.terracotta)); B.put('dome', [p.x, 0.5, p.z], [0.7, 0.8, 0.7], col(PAL.olive)); }
    else if (p.kind === 'streetlight') lampPost(B, p.x, p.z, 4.8);
    else B.frame(p.x, p.z, yaw, () => { // playground: slide + swing frame
      B.put('box', [0, 1.0, 0.5], [0.9, 0.08, 2.4], col(PAL.red), [0.75, 0, 0]); B.block(0, 0, -0.7, 0.9, 2.0, 0.12, col(PAL.blue));
      for (const sx of [-1.4, 1.4]) B.block(sx + 2.4, 0, 0, 0.1, 2.4, 0.1, col(PAL.slate)); B.block(2.4, 2.4, 0, 3.0, 0.1, 0.1, col(PAL.slate));
      B.block(2.4, 0.7, 0, 0.5, 0.06, 0.3, col(PAL.wood));
    });
  }
  B.end();
}
