import { useMemo } from 'react';
import * as THREE from 'three';

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

export function Terrain() {
  const geo = useMemo(() => ({
    paving: merge([
      flat(62, 22, -48, 41, 0.02, '#a8a294'),      // harbor quay
      flat(70, 14, 38, 47, 0.02, '#dcc9a0'),       // beach sand
      flat(62, 40, -47, 0, 0.015, '#c4b394'),      // old town paving
      flat(72, 3, 38, 52.2, 0.025, '#c9b98e'),     // wet sand line
    ]),

  }), []);
  const mats = useMemo(() => ({
    paving: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  }), []);
  return (
    <group>
      <mesh geometry={geo.paving} material={mats.paving} receiveShadow />
    </group>
  );
}
