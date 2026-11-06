import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../../store/game';
import type { Season } from '../../sim/types';
import { coastZ, fbm, heightAt, slopeAt, TOWN } from './terrainHeight';

const GRASS: Record<Season, string> = { spring: '#76955f', summer: '#64854c', autumn: '#938a56', winter: '#aeac98' };

function terrainGeometry(segX: number, segZ: number): THREE.BufferGeometry {
  const W = 560, D = 440, cz = -70;
  const g = new THREE.PlaneGeometry(W, D, segX, segZ);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, cz);
  const P = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(P.count * 3);
  const grass = new THREE.Color('#ffffff'), forest = new THREE.Color('#9fae96'), rock = new THREE.Color('#c9b9a3'), sand = new THREE.Color('#f1e3bf'), far = new THREE.Color('#b9c3c6'), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    const inTown = x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1;
    const h = inTown ? -0.06 : heightAt(x, z);
    P.setY(i, h);
    // colour is multiplied by the seasonal grass tint, so "grass" is white here
    const sl = inTown ? 0 : slopeAt(x, z);
    c.copy(grass);
    c.lerp(forest, THREE.MathUtils.smoothstep(fbm(x * 0.035, z * 0.035, 3), 0.48, 0.62) * (h > 2 ? 1 : 0));
    c.lerp(rock, THREE.MathUtils.smoothstep(sl, 0.55, 1.1));
    if (!inTown && coastZ(x) - z < 3.5 && Math.abs(x) > 84) c.lerp(sand, 0.6);
    c.lerp(far, THREE.MathUtils.smoothstep(-z, 170, 250));        // distant range turns blue-grey
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Rocks along the headland shores and a stone breakwater with a beacon at the harbour mouth. */
function rocksAndBreakwater(): { rocks: THREE.InstancedMesh; mole: THREE.BufferGeometry } {
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const pts: [number, number, number, number][] = [];
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let x = -250; x < 250; x += 2.6) {
    if (Math.abs(x) < 88) continue;
    const z = coastZ(x) + (r() - 0.6) * 2.5;
    pts.push([x + (r() - 0.5) * 2, z, 0.8 + r() * 1.8, r() * 6]);
    if (r() < 0.5) pts.push([x + (r() - 0.5) * 3, z + 1.5 + r() * 2, 0.6 + r(), r() * 6]);
  }
  // breakwater: a line of big blocks from the west headland, ending in a small beacon
  const a = new THREE.Vector2(-128, 86), b = new THREE.Vector2(-82, 99);
  for (let t = 0; t <= 1; t += 0.035) { const p = a.clone().lerp(b, t); pts.push([p.x + (r() - 0.5) * 1.5, p.y + (r() - 0.5) * 1.5, 1.6 + r() * 0.9, r() * 6]); }
  const mesh = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#9d9283', roughness: 1, flatShading: true }), pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  pts.forEach(([x, z, sc, rot], i) => { e.set(rot, rot * 1.7, rot * 0.3); m.compose(new THREE.Vector3(x, -0.3 + sc * 0.25, z), q.setFromEuler(e), new THREE.Vector3(sc * 1.3, sc * 0.8, sc)); mesh.setMatrixAt(i, m); });
  mesh.castShadow = true; mesh.receiveShadow = true;
  // beacon at the end of the breakwater
  const tower = new THREE.CylinderGeometry(0.7, 0.9, 4.5, 10); tower.translate(b.x, 3.6, b.y);
  return { rocks: mesh, mole: tower };
}

export function Landscape({ seg }: { seg: [number, number] }) {
  const geo = useMemo(() => terrainGeometry(seg[0], seg[1]), [seg]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, color: GRASS.spring, roughness: 1 }), []);
  const extra = useMemo(rocksAndBreakwater, []);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 0.4);
    mat.color.lerp(tint.set(GRASS[sim.world.env.season]), k);
  });
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow />
      <primitive object={extra.rocks} />
      <mesh geometry={extra.mole} castShadow><meshStandardMaterial color="#e9e2d2" roughness={0.8} /></mesh>
      <mesh position={[-82, 6.3, 99]}><sphereGeometry args={[0.55, 10, 8]} /><meshStandardMaterial color="#ff6a4a" emissive="#ff4a2a" emissiveIntensity={2.2} /></mesh>
    </group>
  );
}
