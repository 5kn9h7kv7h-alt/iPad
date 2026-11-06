// Geometry for the background houses and the hill church, written into the same city buffers as the
// 26 real buildings so they cost no extra draw calls and share the plaster texture and night lighting.
import * as THREE from 'three';
import type { Batch } from './batch';
import { PAL } from './designs';
import { backdropHouses, CHURCH, type House } from '../world/backdrop';
import { heightAt } from '../world/terrainHeight';

/** Night-light slots shared by all background houses / the church (see MAX_LIT in Buildings.tsx). */
export const SLOT_BACKDROP = 94, SLOT_CHURCH = 95;

const WALLS = ['#efe3c8', '#e8d2a6', '#e3b98f', '#d99a73', '#f2e8d2', '#e6c07a', '#d8c7a3', '#c9a27e'];
const ROOFS = ['#b8613f', '#a9573a', '#c2704c', '#9c4f37', '#b8613f', '#7d6a5a'];
const SHUTTERS = ['#5f8a9a', '#6f8a5a', '#4f6f7f', '#8a6a48', '#a8a490', '#5d7a6e'];
const pick = <T,>(a: T[], t: number) => a[Math.min(a.length - 1, Math.floor(t * a.length))];

function house(B: Batch, h: House, i: number): void {
  B.begin(`bg:${i}`, h.x, h.z, h.yaw, h.y, SLOT_BACKDROP);
  const W = h.w, D = h.d, H = h.h;
  const wall = new THREE.Color(pick(WALLS, h.wall)), roof = new THREE.Color(pick(ROOFS, h.roof)), sh = pick(SHUTTERS, h.shutter);
  B.block(0, 0, 0, W + 0.25, 1.0, D + 0.25, '#a59a88');                  // stone plinth (also buries the hillside step)
  B.block(0, 1.0, 0, W, H - 1.0, D, wall);
  B.block(0, H - 0.05, 0, W + 0.5, 0.25, D + 0.5, '#e9dfcc');            // cornice
  B.hip(0, H + 0.2, 0, W + 0.8, D + 0.8, Math.min(W, D) * 0.3, roof);
  if (h.seed > 0.55) B.block(W * 0.22, H + 0.4, -D * 0.15, 0.7, 1.4, 0.7, '#c9bba3'); // chimney
  const floors = Math.max(2, Math.round((H - 1) / 3)), cols = Math.max(2, Math.round(W / 2.6));
  const faces: (0 | 1)[] = h.kind === 'town' ? [0, 1] : [0];
  for (const f of faces) for (let r = 0; r < floors; r++) for (let c = 0; c < cols; c++) {
    const u = (c + 0.5) / cols * W - W / 2, v = H - 0.9 - r * 3 - 0.9;
    if (v < 1.2) continue;
    const seed = ((i * 131 + r * 17 + c * 7 + f * 3) % 997) / 997;
    if (r === floors - 1 && c === Math.floor(cols / 2) && f === 0) { B.block(u, 1.0, D / 2 + 0.04, 1.0, 2.0, 0.08, '#5b4636'); continue; } // front door
    B.window(f, W, D, u, v, 0.85, 1.25, seed, 0, '#efe6d6');
    if (h.seed > 0.3) { B.facePlane(f, W, D, u - 0.72, v, 0.5, 1.3, 0.05, sh); B.facePlane(f, W, D, u + 0.72, v, 0.5, 1.3, 0.05, sh); }
    if (r === 0 && f === 0 && (h.seed * 7 + c) % 3 < 1) {   // little balcony on the top floor
      B.block(u, v - 0.85, D / 2 + 0.35, 1.5, 0.1, 0.7, '#cfc3ad');
      B.facePlane(0, W, D, u, v - 0.55, 1.5, 0.55, 0.69, '#3d3a36');
    }
  }
  // side windows, one column
  for (const f of [2, 3] as const) for (let r = 0; r < floors; r++) {
    const v = H - 1.8 - r * 3; if (v < 1.4) continue;
    B.window(f, W, D, 0, v, 0.75, 1.1, ((i * 71 + r * 13 + f) % 997) / 997, 0, '#efe6d6');
  }
  B.end();
}

function church(B: Batch): void {
  const { x, z } = CHURCH;
  const y = Math.min(heightAt(x - 6, z - 12), heightAt(x + 6, z - 12), heightAt(x - 6, z + 9), heightAt(x + 6, z + 9)) - 0.5;
  B.begin('church', x, z, 0, y, SLOT_CHURCH);
  const cream = '#efe3c8', stone = '#d8c9ad', tile = '#b0583a';
  B.block(0, 0, 0, 13, 1.4, 22, '#a59a88');
  // nave with gable facade facing the bay
  B.block(0, 1.4, -1, 9, 9, 17, cream);
  B.gable(0, 10.4, -1, 9.8, 17.8, 3.6, tile, false);
  B.block(0, 1.4, 7.6, 10, 10.6, 0.5, stone);                            // facade
  B.put('gable', [0, 12, 7.6], [10.4, 2.6, 0.7], stone);
  B.put('cyl', [0, 8.2, 7.9], [1.25, 0.2, 1.25], '#5b4636', [Math.PI / 2, 0, 0]);   // rose window
  B.lamp(0, 8.2, 8.05, 0.9, '#ffd28a');
  B.block(0, 1.4, 7.95, 2.0, 3.6, 0.2, '#4a3a2c');                       // portal
  B.put('cyl', [0, 5.0, 7.95], [1.0, 0.2, 1.0], '#4a3a2c', [Math.PI / 2, 0, 0]);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) B.window(sx > 0 ? 2 : 3, 9, 17, -5 + k * 5, 6.5, 1.0, 2.6, 0.5, 0, '#e6dcc8');
  // campanile
  const tx = 6.2, tz = 4.5;
  B.block(tx, 1.4, tz, 4.6, 19, 4.6, cream);
  for (const hgt of [7.5, 14]) B.block(tx, 1.4 + hgt, tz, 5.0, 0.35, 5.0, stone);
  B.block(tx, 20.4, tz, 5.2, 0.5, 5.2, stone);
  for (const f of [0, 1, 2, 3] as const) {
    B.facePlane(f, 4.6, 4.6, 0, 17.8, 1.5, 3.0, 0.02, '#2a2620');      // belfry arches
    B.facePlane(f, 4.6, 4.6, 0, 12.2, 1.5, 1.5, 0.02, '#f4efe4');      // clock face
  }
  B.lamp(tx, 17.8, tz, 0.9, '#ffcf84');
  B.hip(tx, 20.9, tz, 5.4, 5.4, 4.2, tile);
  B.block(tx, 25.1, tz, 0.15, 1.4, 0.15, '#3d3a36');
  B.end();
}

export function designBackdrop(B: Batch): void {
  backdropHouses().forEach((h, i) => house(B, h, i));
  church(B);
}
