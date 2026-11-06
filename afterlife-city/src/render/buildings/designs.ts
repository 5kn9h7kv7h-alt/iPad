// Per-kind architecture. All designs are drawn in a local frame: centre at origin, front facing +z, y up.
// Palette: Sand Beige, Warm Cream, Terracotta, Golden Yellow, Muted Coastal Blue, Olive Green (+ wood/slate neutrals).
import * as THREE from 'three';
import type { Building, WorldState } from '../../sim/types';
import { Batch } from './batch';
import { clear } from './space';
import { DOOR_X, frontYaw } from '../../sim/doors';

export const PAL = {
  sand: '#d8c7a3', cream: '#efe3c8', terracotta: '#b8613f', golden: '#d9a441', blue: '#5f8a9a', olive: '#7a8250',
  wood: '#7a5a3c', darkwood: '#4a3a2c', slate: '#5a6068', white: '#f4efe4', red: '#a8412f', navy: '#2f4a5c', stone: '#a9a597',
  clay: '#c98a5e', sage: '#9aa583', dust: '#b9c4c4', teal: '#4f7c80',
};

const WALLS = [PAL.cream, PAL.sand, PAL.dust, PAL.clay, PAL.sage];
const ROOFS = [PAL.terracotta, PAL.slate, PAL.red, PAL.teal];
const pickBy = <T,>(arr: T[], t: number, salt = 0): T => arr[Math.floor(((t * 97 + salt * 0.37) % 1) * arr.length) % arr.length];
const grey = (c: string) => new THREE.Color(c).lerp(new THREE.Color('#8d8a84'), 0.75);

export { frontYaw };

function seedOf(b: Building): number { let h = 7; for (const ch of b.id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; }

export function designBuilding(B: Batch, b: Building, w: WorldState): void {
  const yaw = frontYaw(b, w);
  const swap = Math.abs(Math.sin(yaw)) > 0.5; // footprint stays the same in world space
  const W = swap ? b.d : b.w, D = swap ? b.w : b.d, H = b.h;
  B.begin(b.id, b.x, b.z, yaw);
  const seed = seedOf(b);
  const closed = b.status === 'closed';
  const c = (hex: string) => (closed ? grey(hex) : new THREE.Color(hex));
  const wall = c(pickBy(WALLS, b.tint, seed)), roof = c(pickBy(ROOFS, b.tint, seed + 3));
  const ctx: Ctx = { w, B, b, W, D, H, seed, wall, roof, closed, c };
  switch (b.kind) {
    case 'house': house(ctx); break;
    case 'apartment': apartment(ctx); break;
    case 'cafe': cafe(ctx); break;
    case 'bookstore': bookstore(ctx); break;
    case 'restaurant': restaurant(ctx); break;
    case 'shop': shop(ctx); break;
    case 'market': market(ctx); break;
    case 'warehouse': warehouse(ctx); break;
    case 'fishery': fishery(ctx); break;
    case 'station': station(ctx); break;
    case 'convenience': convenience(ctx); break;
    case 'office': office(ctx); break;
    case 'lookout': lighthouse(ctx); break;
    case 'tourist': aquarium(ctx); break;
    case 'park': park(ctx); break;
    case 'plaza': plaza(ctx); break;
    case 'beach': beach(ctx); break;
    default: B.block(0, 0, 0, W, H, D, wall);
  }
  B.end();
}

interface Ctx { w: WorldState; B: Batch; b: Building; W: number; D: number; H: number; seed: number; wall: THREE.Color; roof: THREE.Color; closed: boolean; c: (hex: string) => THREE.Color }

const foundation = ({ B, W, D, c }: Ctx) => B.block(0, 0, 0, W + 0.3, 0.35, D + 0.3, c(PAL.stone));
const door = ({ B, D, c, closed }: Ctx, x: number, w = 1.1, h = 2.1, col: string = PAL.darkwood) => {
  B.block(x, 0.35, D / 2 + 0.04, w, h, 0.1, c(col));
  B.anchor('door', x, D / 2 + 1.2);
  if (closed) B.block(x, 0.35, D / 2 + 0.1, w + 0.3, h * 0.8, 0.06, c('#6d5a45'));
};
const shop = (ctx: Ctx) => {
  const { B, W, D, H, wall, roof, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, wall);
  B.block(0, H, 0, W + 0.5, 0.35, D + 0.5, roof);                     // flat cornice roof
  B.block(0, H + 0.35, D / 2 + 0.1, W + 0.5, 0.5, 0.25, c(PAL.cream)); // parapet front
  B.block(-W * 0.18, 0.35, D / 2 + 0.04, W * 0.55, 2.1, 0.08, c('#51666b')); // display window recess
  door(ctx, W * DOOR_X.shop!, 1.0, 2.1, PAL.darkwood);
  B.windows(0, W, D, { floors: 1, cols: 2, y0: 0.5, floorH: 3, w: W * 0.2, h: 1.5, shop: 1, seed, skip: (_r, col) => col === 1 });
  awning(ctx, W, D, 2.8, PAL.blue);
  if (!closed) B.signBoard(b.name, '#e9dcc0', '#3a2f26', 0, H - 0.2, D / 2 + 0.35, Math.min(W * 0.8, 6), 0.8);
  B.windows(2, W, D, { floors: 1, cols: 1, y0: 0.6, floorH: 3, seed: seed + 1, shop: 0 });
  rooftopBits(ctx);
};
const awning = ({ B, c }: Ctx, W: number, D: number, y: number, col: string, stripe = PAL.cream) => {
  const n = Math.max(4, Math.round(W / 1.1));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * (W * 0.92) - W * 0.46;
    B.put('box', [x, y, D / 2 + 0.75], [W * 0.92 / n, 0.1, 1.5], c(i % 2 ? col : stripe), [0.38, 0, 0]);
  }
};
const rooftopBits = ({ B, W, D, H, c, seed }: Ctx) => {
  if (seed % 3 === 0) B.block(W * 0.25, H + 0.35, -D * 0.2, 0.9, 1.1, 0.9, c(PAL.stone));          // chimney / vent
  if (seed % 3 === 1) B.cyl(-W * 0.25, H + 0.35, -D * 0.1, 0.5, 1.0, c(PAL.slate));               // water tank
};

function house(ctx: Ctx) {
  const { B, W, D, H, wall, roof, c, closed, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, wall);
  const rise = Math.min(W, D) * 0.42;
  B.gable(0, H, 0, W + 0.9, D + 0.9, rise, roof, false);
  B.block(W * 0.22, H + rise * 0.4, -D * 0.12, 0.8, rise * 0.9, 0.8, c(PAL.stone)); // chimney
  door(ctx, W * DOOR_X.house!, 1.0, 2.1, seed % 2 ? PAL.blue : PAL.terracotta);
  B.block(-W * 0.2, 0.35, D / 2 + 0.7, 2.0, 0.15, 1.4, c(PAL.stone));                  // step
  B.windows(0, W, D, { floors: 1, cols: 3, y0: 0.5, floorH: 3, seed, skip: (_r, col) => col === 0 });
  B.windows(1, W, D, { floors: 1, cols: 3, y0: 0.5, floorH: 3, seed: seed + 2 });
  B.windows(2, W, D, { floors: 1, cols: 2, y0: 0.5, floorH: 3, seed: seed + 5 });
  B.windows(3, W, D, { floors: 1, cols: 2, y0: 0.5, floorH: 3, seed: seed + 9 });
  // small attic window in the gable
  B.window(0, W, D, 0, H + rise * 0.35, 0.8, 0.8, ((seed * 13) % 100) / 100, 0);
  // planter boxes + porch lamp
  B.block(W * 0.25, 0.9, D / 2 + 0.35, 1.6, 0.35, 0.4, c(PAL.wood));
  B.block(W * 0.25, 1.25, D / 2 + 0.35, 1.5, 0.3, 0.35, c(PAL.olive));
  if (!closed) B.lamp(-W * 0.2 + 0.9, 2.4, D / 2 + 0.2, 0.14);
}

function apartment(ctx: Ctx) {
  const { B, W, D, H, wall, roof, c, seed } = ctx;
  foundation(ctx);
  const floors = Math.max(2, Math.round(H / 3));
  const fh = (H - 0.35) / floors;
  B.block(0, 0.35, 0, W, H - 0.35, D, wall);
  B.block(0, H, 0, W + 0.4, 0.5, D + 0.4, roof);
  B.block(0, H + 0.5, D / 2 - 0.1, W + 0.4, 0.5, 0.3, c(PAL.cream));
  B.windows(0, W, D, { floors, cols: 3, y0: 0.55 + 0.0, floorH: fh, w: 1.1, h: 1.3, seed, skip: (r, col) => r === 0 && col === 1 });
  B.windows(1, W, D, { floors, cols: 3, y0: 0.55, floorH: fh, seed: seed + 4, w: 1.1, h: 1.3 });
  B.windows(2, W, D, { floors, cols: 2, y0: 0.55, floorH: fh, seed: seed + 6 });
  door(ctx, 0, 1.6, 2.2, PAL.navy);
  B.block(0, 2.7, D / 2 + 0.5, 2.6, 0.12, 1.0, c(PAL.golden));                              // entrance canopy
  // balconies on upper floors (railing + slab), alternating colours
  for (let f = 1; f < floors; f++) for (const x of [-W * 0.3, W * 0.3]) {
    const y = 0.35 + f * fh;
    B.block(x, y, D / 2 + 0.55, 2.3, 0.14, 1.1, c(PAL.stone));
    B.block(x, y + 0.14, D / 2 + 1.05, 2.3, 0.85, 0.07, c((f + seed) % 2 ? PAL.blue : PAL.sand));
    B.block(x - 1.12, y + 0.14, D / 2 + 0.55, 0.07, 0.85, 1.1, c(PAL.blue));
    B.block(x + 1.12, y + 0.14, D / 2 + 0.55, 0.07, 0.85, 1.1, c(PAL.blue));
  }
  B.cyl(W * 0.25, H + 0.5, -D * 0.2, 0.9, 1.5, c(PAL.slate));                               // rooftop water tank
  B.block(-W * 0.25, H + 0.5, -D * 0.2, 1.3, 1.0, 1.3, c(PAL.stone));
}

function cafe(ctx: Ctx) {
  const { B, W, D, H, wall, roof, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, wall);
  B.gable(0, H, 0, W + 0.7, D + 0.7, 1.7, roof, true);
  B.block(-W * 0.12, 0.35, D / 2 + 0.04, W * 0.6, 2.2, 0.08, c('#46605f'));
  B.windows(0, W, D, { floors: 1, cols: 3, y0: 0.45, floorH: 3, w: 1.2, h: 1.7, shop: 1, seed, skip: (_r, col) => col === 2 });
  door(ctx, W * DOOR_X.cafe!, 1.0, 2.1, PAL.teal);
  awning(ctx, W, D, 2.9, PAL.terracotta);
  if (!closed) {
    B.signBoard(b.name, '#3f2f25', '#f3e3c0', -W * 0.1, H - 0.25, D / 2 + 0.45, Math.min(W * 0.7, 5.5), 0.75, '#2a2019');
    // hanging lamp
    B.lamp(W * 0.34 + 1.0, 2.5, D / 2 + 0.3, 0.16);
    terrace(ctx);
  }
  B.windows(2, W, D, { floors: 1, cols: 1, y0: 0.6, floorH: 3, shop: 1, seed: seed + 3 });
}
/** Outdoor seating: also exported as 'seat' anchors so residents can later be tied to them. */
function terrace({ w, B, b, W, D, c }: Ctx) {
  // try the front, then either side, then the back: use the first spot that is off the street and clear of buildings
  const options: [number, number][][] = [
    [[-W * 0.28, D / 2 + 2.4], [W * 0.12, D / 2 + 2.6]],
    [[W / 2 + 2.1, -D * 0.22], [W / 2 + 2.1, D * 0.25]],
    [[-W / 2 - 2.1, -D * 0.22], [-W / 2 - 2.1, D * 0.25]],
    [[-W * 0.22, -D / 2 - 2.2], [W * 0.22, -D / 2 - 2.2]],
  ];
  const tables = options.find(opt => opt.every(([x, z]) => { const [wx, wz] = B.toWorld(x, z); return clear(w, [], wx, wz, 1.35, b.id) && !inSelf(b, wx, wz, 1.35); }));
  if (!tables) return;
  for (const [x, z] of tables) {
    B.tag = 'terrace';
    B.cyl(x, 0.0, z, 0.06, 0.8, c(PAL.slate));
    B.put('cyl', [x, 0.82, z], [0.45, 0.06, 0.45], c(PAL.cream));
    for (const [dx, dz] of [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]]) {
      B.block(x + dx, 0.0, z + dz, 0.4, 0.45, 0.4, c(PAL.wood));
      B.block(x + dx, 0.45, z + dz, 0.4, 0.08, 0.4, c(PAL.golden));
      B.anchor('seat', x + dx, z + dz, Math.atan2(-dx, -dz));
    }
    B.cyl(x, 0.8, z, 0.04, 1.5, c(PAL.white));
    B.put('hip', [x, 2.3, z], [2.3, 0.45, 2.3], c(PAL.terracotta));
    B.tag = '';
  }
}
const inSelf = (b: Building, x: number, z: number, r: number) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r;

function bookstore(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, c('#8a6a48'));
  B.block(0, 0.35, D / 2 + 0.03, W, 2.6, 0.08, c(PAL.wood));
  B.gable(0, H, 0, W + 0.6, D + 0.6, 2.0, c(PAL.slate), false);
  B.windows(0, W, D, { floors: 1, cols: 2, y0: 0.5, floorH: 3, w: 1.6, h: 1.5, shop: 1, seed, skip: (_r, col) => col === 1, frame: PAL.golden });
  door(ctx, W * DOOR_X.bookstore!, 1.1, 2.2, PAL.olive);
  B.block(-W * 0.2, 0.35, D / 2 + 0.55, 2.4, 0.9, 0.5, c(PAL.wood));                      // book cart
  B.block(-W * 0.2, 1.25, D / 2 + 0.55, 2.2, 0.35, 0.4, c(PAL.golden));
  if (!closed) {
    B.signBoard(b.name, '#2f4a3a', '#f0e2b8', 0, H - 0.1, D / 2 + 0.4, Math.min(W * 0.85, 6), 0.8, '#1f1a15');
    B.put('box', [W * 0.45, 2.6, D / 2 + 0.7], [0.08, 0.7, 0.9], c(PAL.golden));         // projecting blade sign
    B.lamp(W * 0.28 + 1.0, 2.4, D / 2 + 0.2, 0.14);
  }
  B.windows(2, W, D, { floors: 1, cols: 1, y0: 0.7, floorH: 3, seed: seed + 1 });
  B.block(W * 0.25, H + 1.0, -D * 0.2, 0.9, 1.6, 0.9, c(PAL.stone));
}

function restaurant(ctx: Ctx) {
  const { B, W, D, H, wall, roof, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, wall);
  B.hip(0, H, 0, W + 1.0, D + 1.0, 1.5, roof);
  B.windows(0, W, D, { floors: 1, cols: 3, y0: 0.6, floorH: 3, w: 0.9, h: 1.2, shop: 1, seed, skip: (_r, col) => col === 1 });
  door(ctx, 0, 1.4, 2.1, PAL.darkwood);
  if (!closed) {
    // noren curtain + paper lanterns
    for (const dx of [-0.5, 0, 0.5]) B.block(dx * 0.9, 1.6, D / 2 + 0.12, 0.5, 0.7, 0.04, c(PAL.red));
    B.signBoard(b.name, '#f1e6cc', '#7a1f17', 0, H - 0.1, D / 2 + 0.4, Math.min(W * 0.7, 5), 0.8, '#3a2a20');
    for (const x of [-W * 0.38, W * 0.38]) B.lamp(x, 2.3, D / 2 + 0.4, 0.28, '#ffb064');
  }
  B.windows(2, W, D, { floors: 1, cols: 1, y0: 0.6, floorH: 3, seed: seed + 2, shop: 1 });
  B.windows(1, W, D, { floors: 1, cols: 2, y0: 0.6, floorH: 3, seed: seed + 8 });
  rooftopBits(ctx);
}

function convenience(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, c(PAL.white));
  B.block(0, H, 0, W + 0.4, 0.3, D + 0.4, c(PAL.slate));
  B.block(0, H - 1.0, D / 2 + 0.06, W, 0.9, 0.1, c(PAL.teal));          // brand band
  B.block(0, 0.35, D / 2 + 0.05, W * 0.85, 2.3, 0.08, c('#46605f'));    // big glass front
  B.windows(0, W, D, { floors: 1, cols: 2, y0: 0.45, floorH: 3, w: W * 0.34, h: 1.9, shop: 1, seed, frame: PAL.white });
  B.block(W * 0.35, 0.35, D / 2 + 0.1, 1.2, 2.1, 0.08, c(PAL.navy));
  B.anchor('door', W * 0.35, D / 2 + 1.2);
  if (!closed) {
    B.signBoard(b.name, '#2f7a6e', '#ffffff', 0, H - 0.55, D / 2 + 0.16, Math.min(W * 0.8, 6), 0.6, '#1b4f46');
    B.lamp(0, H + 0.55, D / 2, 0.22, '#c8f0e6');
  }
  B.block(-W * 0.35, 0.35, D / 2 + 1.0, 1.0, 1.0, 0.9, c(PAL.stone));  // ice freezer outside
  B.windows(2, W, D, { floors: 1, cols: 1, y0: 0.9, floorH: 3, seed: seed + 3, shop: 1 });
}

function market(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  B.block(0, 0, 0, W + 0.4, 0.25, D + 0.4, c(PAL.stone));
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) B.block(x, 0.25, z, 0.35, H - 0.25, 0.35, c(PAL.darkwood));
  B.gable(0, H, 0, W + 0.8, D + 0.8, 1.8, c(PAL.blue), true);
  B.block(0, 0.25, -D / 2 + 0.4, W - 0.8, 2.4, 0.4, c(PAL.wood));       // back wall
  // stalls: striped canopies over crates
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * (W - 1.5) - (W - 1.5) / 2;
    B.block(x, 0.25, D * 0.1, 2.3, 0.8, 1.0, c(PAL.wood));
    B.block(x, 1.05, D * 0.1, 2.1, 0.12, 0.9, c(i % 2 ? PAL.dust : PAL.cream));
    for (let k = 0; k < 3; k++) B.block(x - 0.7 + k * 0.7, 1.17, D * 0.1, 0.5, 0.25, 0.5, c([PAL.terracotta, PAL.golden, PAL.olive][(k + i) % 3]));
    B.put('box', [x, 2.7, D * 0.1 + 0.4], [2.3, 0.08, 1.4], c(i % 2 ? PAL.terracotta : PAL.cream), [0.25, 0, 0]);
    B.anchor('seat', x, D * 0.1 + 1.4);
  }
  if (!closed) B.signBoard(b.name, '#f1e6cc', '#2f4a5c', 0, H - 0.3, D / 2 + 0.5, 4.5, 0.75, '#2f3e44');
  void seed;
}

function warehouse(ctx: Ctx) {
  const { B, W, D, H, c, seed } = ctx;
  B.block(0, 0, 0, W, H - 1.5, D, c(PAL.stone));
  B.block(0, 0, 0, W + 0.1, 0.6, D + 0.1, c(PAL.slate));
  B.gable(0, H - 1.5, 0, W + 0.5, D + 0.5, 2.6, c('#7c8085'), true);
  B.block(0, 0.1, D / 2 + 0.06, 4.4, 4.0, 0.12, c(PAL.olive));          // roller door
  for (let i = 0; i < 6; i++) B.block(0, 0.6 + i * 0.6, D / 2 + 0.14, 4.4, 0.05, 0.04, c('#5d6446'));
  B.anchor('door', 0, D / 2 + 1.5);
  B.windows(0, W, D, { floors: 1, cols: 3, y0: 2.6, floorH: 3, w: 1.2, h: 0.7, seed, skip: (_r, col) => col === 1 });
  B.windows(2, W, D, { floors: 1, cols: 3, y0: 2.6, floorH: 3, w: 1.2, h: 0.7, seed: seed + 3 });
  for (let i = 0; i < 4; i++) B.block(-W / 2 - 0.9, 0, -D / 3 + i * 1.7, 1.2, 1.1, 1.2, c([PAL.golden, PAL.blue, PAL.terracotta, PAL.olive][i]));
  B.cyl(W / 2 + 1.0, 0, 0, 0.9, 2.8, c(PAL.slate));
}

function fishery(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  B.block(0, 0, 0, W, H, D, c(PAL.blue));
  B.hip(0, H, 0, W + 0.9, D + 0.9, 1.4, c(PAL.navy));
  B.block(0, 0.05, D / 2 + 0.05, 3.4, 3.0, 0.1, c(PAL.cream));
  B.anchor('door', 0, D / 2 + 1.4);
  B.windows(0, W, D, { floors: 1, cols: 2, y0: 1.2, floorH: 3, w: 1.2, h: 1.0, seed, skip: () => false });
  // ice boxes, nets drums, crane post
  for (let i = 0; i < 3; i++) B.block(-W / 2 + 1.2 + i * 1.6, 0, D / 2 + 1.4, 1.3, 0.9, 0.9, c([PAL.white, PAL.golden, PAL.white][i]));
  B.cyl(W / 2 + 1.2, 0, D / 2 + 1.0, 0.55, 1.1, c(PAL.navy));
  B.block(W / 2 + 0.8, 0, -D / 2 + 0.8, 0.3, 6.0, 0.3, c(PAL.darkwood));
  B.put('box', [W / 2 - 0.9, 5.8, -D / 2 + 0.8], [3.4, 0.25, 0.25], c(PAL.darkwood));
  B.block(W / 2 - 2.4, 3.6, -D / 2 + 0.8, 0.04, 2.2, 0.04, c(PAL.slate));
  if (!closed) { B.signBoard(b.name, '#f1ebdd', '#1f4a66', 0, H + 0.0, D / 2 + 0.3, 5.0, 0.8, '#223a4a'); B.lamp(W / 2 - 0.3, H + 0.3, D / 2 + 0.3, 0.2); }
}

function station(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, c(PAL.cream));
  B.gable(0, H, 0, W + 1.0, D + 1.0, 2.2, c(PAL.teal), true);
  B.block(0, 0.35, D / 2 + 0.04, W * 0.9, 0.9, 0.06, c(PAL.sand));
  B.windows(0, W, D, { floors: 1, cols: 5, y0: 1.0, floorH: 3, w: 1.4, h: 2.0, shop: 1, seed, skip: (_r, col) => col === 2 });
  B.block(0, 0.35, D / 2 + 0.1, 2.4, 2.6, 0.1, c(PAL.navy));
  B.anchor('door', 0, D / 2 + 1.6);
  // clock tower
  B.block(0, H, 0, 3.0, 4.2, 3.0, c(PAL.cream));
  B.hip(0, H + 4.2, 0, 3.6, 3.6, 1.8, c(PAL.terracotta));
  B.put('cyl', [0, H + 2.8, 1.55], [0.9, 0.12, 0.9], c(PAL.white), [Math.PI / 2, 0, 0]);
  B.lamp(0, H + 2.8, 1.66, 0.7, '#fff2cc');
  // platform canopy
  B.block(0, 3.2, -D / 2 - 2.0, W * 0.9, 0.2, 4.0, c(PAL.slate));
  for (const x of [-W * 0.4, 0, W * 0.4]) B.block(x, 0.35, -D / 2 - 3.4, 0.25, 2.9, 0.25, c(PAL.darkwood));
  if (!closed) B.signBoard(b.name, '#2f4a5c', '#f4efe4', 0, 3.4, D / 2 + 0.3, Math.min(W * 0.6, 8), 0.8, '#1b2c37');
}

function office(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, c(PAL.dust));
  B.block(0, H, 0, W + 0.4, 0.4, D + 0.4, c(PAL.slate));
  B.windows(0, W, D, { floors: 2, cols: 4, y0: 0.6, floorH: 2.2, w: 1.0, h: 1.1, seed, shop: 1, skip: (r, col) => r === 0 && col === 3 });
  B.windows(1, W, D, { floors: 2, cols: 4, y0: 0.6, floorH: 2.2, w: 1.0, h: 1.1, seed: seed + 5 });
  B.windows(2, W, D, { floors: 2, cols: 3, y0: 0.6, floorH: 2.2, w: 1.0, h: 1.1, seed: seed + 8 });
  door(ctx, W * DOOR_X.office!, 1.2, 2.1, PAL.navy);
  B.block(0, H + 0.4, 0, 0.1, 3.0, 0.1, c(PAL.slate));                     // flagpole
  B.block(0.55, H + 2.6, 0, 1.0, 0.6, 0.04, c(PAL.golden));
  if (!closed) B.signBoard(b.name, '#e9e2cf', '#2f4a5c', -W * 0.1, 3.2, D / 2 + 0.3, Math.min(W * 0.6, 5.5), 0.6, '#38454d');
}

function lighthouse(ctx: Ctx) {
  const { B, H, c, closed } = ctx;
  B.cyl(0, 0, 0, 3.6, 1.0, c(PAL.stone));
  B.put('cyl', [0, H * 0.28 + 0.5, 0], [2.6, H * 0.56, 2.6], c(PAL.white));
  B.put('cyl', [0, H * 0.58 + 0.5, 0], [2.3, H * 0.12, 2.3], c(PAL.red));
  B.put('cyl', [0, H * 0.74 + 0.5, 0], [2.0, H * 0.2, 2.0], c(PAL.white));
  B.put('cyl', [0, H + 0.25, 0], [2.8, 0.3, 2.8], c(PAL.slate));         // gallery
  if (!closed) B.lamp(0, H + 1.4, 0, 1.0, '#ffe3a0');
  B.put('hip', [0, H + 2.4, 0], [2.4, 1.6, 2.4], c(PAL.red));
  B.window(0, 4, 4, 0, 2.2, 0.7, 1.0, 0.4, 0);
  B.anchor('door', 0, 3.4);
}

function aquarium(ctx: Ctx) {
  const { B, W, D, H, c, closed, b, seed } = ctx;
  foundation(ctx);
  B.block(0, 0.35, 0, W, H - 0.35, D, c(PAL.dust));
  B.put('dome', [0, H, 0], [W * 0.42, 2.8, D * 0.62], c(PAL.blue));
  B.windows(0, W, D, { floors: 1, cols: 4, y0: 0.7, floorH: 3, w: 1.6, h: 2.6, shop: 1, seed, frame: PAL.white });
  B.block(0, 0.35, D / 2 + 0.9, 4.2, 0.15, 1.8, c(PAL.stone));
  B.block(0, 3.2, D / 2 + 1.2, 4.0, 0.2, 2.4, c(PAL.teal));
  for (const x of [-1.8, 1.8]) B.block(x, 0.35, D / 2 + 2.0, 0.2, 2.9, 0.2, c(PAL.white));
  B.anchor('door', 0, D / 2 + 2.2);
  if (!closed) B.signBoard(b.name, '#2f6f8a', '#f4efe4', 0, H - 0.2, D / 2 + 0.3, 6.0, 0.9, '#1c3c4a');
}

const tileOf = ({ c }: Ctx, hex: string) => c(hex);
function park(ctx: Ctx) {
  const { B, W, D, c } = ctx;
  B.block(0, 0, 0, W, 0.14, D, tileOf(ctx, '#8e9a5c'));
  B.block(0, 0.14, 0, W * 0.8, 0.04, 1.0, c(PAL.sand));
  B.block(0, 0.14, 0, 1.0, 0.04, D * 0.8, c(PAL.sand));
  B.cyl(0, 0.14, 0, 1.1, 0.35, c(PAL.stone));                         // little fountain base
}
function plaza(ctx: Ctx) {
  const { B, W, D, c } = ctx;
  B.block(0, 0, 0, W, 0.14, D, c(PAL.sand));
  const n = Math.max(2, Math.round(W / 4));
  for (let i = 0; i < n; i++) B.block((i + 0.5) / n * W - W / 2, 0.14, 0, W / n - 0.3, 0.03, D - 0.5, c(i % 2 ? PAL.cream : '#cdbd9a'));
}
function beach(ctx: Ctx) {
  const { B, W, D, c } = ctx;
  B.block(0, 0, 0, W, 0.1, D, c('#e0cfa0'));
  B.block(0, 0.1, D / 2 - 0.8, W, 0.03, 1.2, c('#cfc097'));
}

/** Empty lots and construction sites (cheap flat shapes in the same buffers). */
export function designLot(B: Batch, x: number, z: number, w: number, d: number, building: boolean, id: string): void {
  B.begin(id, x, z, 0);
  const c = new THREE.Color();
  B.block(0, 0, 0, w, 0.08, d, c.set('#a9ad84'));
  if (building) {
    for (const [px, pz] of [[-w * 0.35, -d * 0.35], [w * 0.35, -d * 0.35], [-w * 0.35, d * 0.35], [w * 0.35, d * 0.35]]) B.block(px, 0, pz, 0.25, 4.5, 0.25, c.set(PAL.wood));
    B.block(0, 4.5, 0, w * 0.8, 0.2, d * 0.8, c.set(PAL.golden));
    B.block(0, 0.08, 0, w * 0.5, 1.2, d * 0.5, c.set(PAL.sand));
  } else {
    B.block(w * 0.3, 0.08, d * 0.2, 1.0, 0.7, 1.0, c.set(PAL.wood));
    B.block(-w * 0.2, 0.08, -d * 0.2, 1.4, 0.4, 0.7, c.set(PAL.stone));
  }
  B.end();
}
