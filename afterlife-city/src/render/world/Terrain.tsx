import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../../store/game';
import type { Season } from '../../sim/types';

const GRASS: Record<Season, string> = { spring: '#869a5a', summer: '#72894c', autumn: '#9a8b52', winter: '#b3b09b' };

function colored(g: THREE.BufferGeometry, hex: string, m?: THREE.Matrix4): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (m) out.applyMatrix4(m);
  const c = new THREE.Color(hex), n = out.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  out.deleteAttribute('uv');
  return out;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0; for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3); nor.set(p.attributes.normal.array as Float32Array, o * 3); col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const flat = (w: number, d: number, x: number, z: number, y: number, hex: string) =>
  colored(new THREE.PlaneGeometry(w, d), hex, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, y, z));

/** Height-shaded low-poly ridges; farther ridges are lighter so fog + colour read as atmospheric depth. */
function ridge(x: number, z: number, r: number, h: number, near: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 7, 3).toNonIndexed();
  g.translate(x, h / 2 - 1, z);
  g.computeVertexNormals();
  const P = g.attributes.position, arr = new Float32Array(P.count * 3);
  const lo = new THREE.Color('#5f7355').lerp(new THREE.Color('#9fb0a2'), 1 - near), hi = new THREE.Color('#8d9a7c').lerp(new THREE.Color('#c0c9c3'), 1 - near);
  for (let i = 0; i < P.count; i++) { const t = THREE.MathUtils.clamp((P.getY(i) + 1) / h, 0, 1); const c = lo.clone().lerp(hi, t); arr.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

export function Terrain() {
  const geo = useMemo(() => ({
    grass: merge([flat(420, 260, 0, -78, -0.05, '#ffffff')]),
    paving: merge([
      flat(62, 22, -48, 41, 0.02, '#a8a294'),      // harbor quay
      flat(70, 14, 38, 47, 0.02, '#dcc9a0'),       // beach sand
      flat(62, 40, -47, 0, 0.015, '#c4b394'),      // old town paving
      flat(72, 3, 38, 52.2, 0.025, '#c9b98e'),     // wet sand line
    ]),
    mountains: merge([
      ridge(-130, -150, 60, 36, 0.35), ridge(-70, -165, 75, 46, 0.2), ridge(0, -172, 70, 40, 0.1), ridge(70, -165, 80, 48, 0.2), ridge(130, -150, 60, 34, 0.35),
      ridge(-175, -60, 55, 30, 0.6), ridge(175, -60, 55, 32, 0.6), ridge(-110, -110, 40, 24, 0.7), ridge(95, -112, 44, 26, 0.7),
    ]),
  }), []);
  const mats = useMemo(() => ({
    grass: new THREE.MeshStandardMaterial({ color: GRASS.spring, roughness: 1 }),
    paving: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    mountains: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  }), []);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const e = sim.world.env;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 0.4);
    mats.grass.color.lerp(tint.set(GRASS[e.season]), k);
    // snow dusting on the ridges in winter
    mats.mountains.color.lerp(tint.set(e.season === 'winter' ? '#e8ecf0' : '#ffffff'), k);
  });
  return (
    <group>
      <mesh geometry={geo.grass} material={mats.grass} receiveShadow />
      <mesh geometry={geo.paving} material={mats.paving} receiveShadow />
      <mesh geometry={geo.mountains} material={mats.mountains} />
    </group>
  );
}
