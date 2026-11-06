import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../../store/game';
import type { Season, WorldState } from '../../sim/types';
import { frontYaw } from '../../sim/doors';
import { coastZ, fbm, heightAt, TOWN } from './terrainHeight';
import { backdropBoxes, CHURCH } from './backdrop';
import { inBuilding, onStreet } from '../buildings/space';

// ---------------------------------------------------------------- crowns (3 species) + trunks: 4 instanced draws, wind-swayed in the vertex shader
// Crowns are soft volumes rather than facets: lumpy blobs whose normals bend towards the crown's centre, and a
// height term (aH) that darkens the underside like ambient occlusion.
const CROWN_SHAPE = { pine: { c: 3.4, lo: 1.1, hi: 5.7 }, round: { c: 3.2, lo: 1.3, hi: 5.2 }, cypress: { c: 3.6, lo: 0.7, hi: 6.6 } };
function crownGeo(kind: 'pine' | 'round' | 'cypress', detail: 0 | 1 = 1): THREE.BufferGeometry {
  const parts: { g: THREE.BufferGeometry; c: THREE.Vector3; r: number }[] = [];
  if (kind === 'pine') for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(1.5 - i * 0.35, 2.2, 9); g.translate(0, 2.2 + i * 1.15, 0); parts.push({ g, c: new THREE.Vector3(0, 2.2 + i * 1.15, 0), r: 0 }); }
  else if (kind === 'round') for (const [x, y, z, r] of [[0, 3.1, 0, 1.7], [0.9, 2.7, 0.3, 1.2], [-0.8, 2.8, -0.4, 1.25], [0.1, 4.0, -0.2, 1.1], [-0.2, 3.3, 0.9, 1.05]]) { const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); parts.push({ g, c: new THREE.Vector3(x, y, z), r }); }
  else { const g = new THREE.SphereGeometry(0.95, 10, 9); g.scale(1, 3.1, 1); g.translate(0, 3.6, 0); parts.push({ g, c: new THREE.Vector3(0, 3.6, 0), r: 0.5 }); }
  const S = CROWN_SHAPE[kind], centre = new THREE.Vector3(0, S.c, 0);
  const flat = parts.map(p => ({ ...p, g: p.g.index ? p.g.toNonIndexed() : p.g }));
  let total = 0; for (const p of flat) total += p.g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), hgt = new Float32Array(total);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n0 = new THREE.Vector3();
  let o = 0;
  for (const p of flat) {
    const P = p.g.attributes.position, N = p.g.attributes.normal;
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P, i);
      if (p.r > 0) { // lumpy surface; duplicated vertices hash alike, so the mesh stays closed
        const h = Math.sin(Math.round(v.x * 40) * 12.9898 + Math.round(v.y * 40) * 78.233 + Math.round(v.z * 40) * 37.719) * 43758.5453;
        v.addScaledVector(a.copy(v).sub(p.c).normalize(), ((h - Math.floor(h)) - 0.5) * 0.22 * p.r);
      }
      n0.fromBufferAttribute(N, i);
      if (p.r > 0) a.copy(v).sub(p.c).normalize(); else a.copy(n0);
      b.copy(v).sub(centre).normalize();
      a.lerp(b, kind === 'pine' ? 0.35 : 0.5).normalize();
      pos.set([v.x, v.y, v.z], o * 3); nor.set([a.x, a.y, a.z], o * 3);
      hgt[o] = Math.min(1, Math.max(0, (v.y - S.lo) / (S.hi - S.lo)));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(hgt, 1));
  return g;
}

const swayUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
function swayMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, swayUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 0.62 + 0.5 * vH;');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; attribute float aH; varying float vH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vH = aH;
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
#else
  float ph = 0.0;
#endif
  float sw = sin(uTime * 1.4 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25;
  float hh = max(position.y, 0.0);
  transformed.x += sw * uWind * 0.075 * hh;
  transformed.z += cos(uTime * 1.1 + ph) * uWind * 0.05 * hh;`);
  };
  return m;
}

interface Tree { x: number; z: number; s: number; kind: 0 | 1 | 2; r: number; y?: number; far?: boolean }

export function makeTrees(): Tree[] { return makeTreesFor(sim.world); }

export function makeTreesFor(world: WorldState): Tree[] {
  const out: Tree[] = [];
  let seed = 424242;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const park = world.buildings['b_park'];
  for (let i = 0; i < 16; i++) out.push({ x: park.x + (r() - 0.5) * (park.w - 2), z: park.z + (r() - 0.5) * (park.d - 2), s: 0.9 + r() * 0.5, kind: 1, r: r() });
  for (let i = 0; i < 90; i++) out.push({ x: -100 + r() * 200, z: -92 + r() * 52, s: 0.9 + r() * 1.1, kind: r() < 0.55 ? 0 : r() < 0.7 ? 2 : 1, r: r() });
  for (let i = 0; i < 34; i++) out.push({ x: -92 + r() * 20, z: -26 + r() * 52, s: 0.8 + r(), kind: r() < 0.5 ? 1 : 2, r: r() });
  for (let i = 0; i < 26; i++) out.push({ x: 80 + r() * 20, z: -52 + r() * 80, s: 0.9 + r(), kind: r() < 0.6 ? 1 : 0, r: r() });
  for (let i = 0; i < 40; i++) out.push({ x: 8 + r() * 66, z: -34 + r() * 50, s: 0.8 + r() * 0.7, kind: r() < 0.7 ? 1 : 2, r: r() }); // residential street trees
  // forest on the hills and headlands outside the town (density from noise, pines higher up)
  for (let i = 0; i < 1500; i++) {
    const x = -240 + r() * 480, z = -230 + r() * 330;
    if (x > TOWN.x0 - 2 && x < TOWN.x1 + 2 && z > TOWN.z0 - 2) continue;
    if (z > coastZ(x) - 3) continue;
    if (fbm(x * 0.035, z * 0.035, 3) < 0.5 && r() < 0.75) continue;
    const h = heightAt(x, z);
    out.push({ x, z, s: 0.8 + r() * 0.7, kind: h > 22 || r() < 0.35 ? 0 : r() < 0.25 ? 2 : 1, r: r(), far: true });
  }
  const solid = Object.values(world.buildings).filter(b => !['plaza', 'beach'].includes(b.kind));
  const houseBoxes = [...backdropBoxes(), { x0: CHURCH.x - 9, x1: CHURCH.x + 11, z0: CHURCH.z - 12, z1: CHURCH.z + 10 }];
  const rows = [-30, 0, 30], cols = [-60, -40, -20, 10, 35, 60];
  return out.filter(t => {
    if (solid.some(b => Math.abs(b.x - t.x) < b.w / 2 + 3 && Math.abs(b.z - t.z) < b.d / 2 + 3)) return false;
    { const m = 0.8 + 1.3 * t.s; if (houseBoxes.some(b => t.x > b.x0 - m && t.x < b.x1 + m && t.z > b.z0 - m && t.z < b.z1 + m)) return false; }
    if (world.lots.some(l => Math.abs(l.x - t.x) < l.w / 2 + 2 && Math.abs(l.z - t.z) < l.d / 2 + 2)) return false;
    if (rows.some(z => Math.abs(t.z - z) < 5 && t.x > -64 && t.x < 64) || cols.some(x => Math.abs(t.x - x) < 5 && t.z > -34 && t.z < 34)) return false;
    if (t.z > 31 && t.x < -17 && t.x > TOWN.x0) return false;     // harbor
    if (t.z > 40 && t.x > TOWN.x0 && t.x < TOWN.x1) return false;  // beach / sea
    if (Math.abs(t.z + 35) < 4 && t.x > -64 && t.x < 64) return false;
    return true;
  }).map(t => ({ ...t, y: heightAt(t.x, t.z) - 0.1 }));
}

export function makeBushesFor(w: WorldState): { x: number; z: number; s: number; r: number }[] {
  const out: { x: number; z: number; s: number; r: number }[] = [];
  let seed = 99; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hb = backdropBoxes();
  const ok = (x: number, z: number, rad: number) => !onStreet(w, x, z, rad) && !inBuilding(w, x, z, rad) && !hb.some(b => x + rad > b.x0 && x - rad < b.x1 && z + rad > b.z0 && z - rad < b.z1);
  for (const b of Object.values(w.buildings)) {
    if (b.kind === 'house' || b.kind === 'cafe' || b.kind === 'shop' || b.kind === 'bookstore') {
      // a hedge along the back wall (the side away from the street)
      const yaw = frontYaw(b, w);
      for (let i = 0; i < 3; i++) {
        const s = 0.7 + r() * 0.5;
        const lx = (r() - 0.5) * (Math.abs(Math.sin(yaw)) > 0.5 ? b.d : b.w) * 0.8, lz = -(Math.abs(Math.sin(yaw)) > 0.5 ? b.w : b.d) / 2 - 0.4 - 0.8 * s;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c;
        if (ok(x, z, 0.8 * s)) out.push({ x, z, s, r: r() });
      }
    }
    if (b.kind === 'park') for (let i = 0; i < 14; i++) {
      const t = i / 14, x = b.x - b.w / 2 + 0.6 + t * (b.w - 1.2), z = b.z + (i % 2 ? b.d / 2 - 0.6 : -b.d / 2 + 0.6);
      if (ok(x, z, 0.7)) out.push({ x, z, s: 0.8, r: r() });
    }
  }
  return out;
}

const CROWN: Record<Season, string[]> = {
  spring: ['#93a85c', '#a3b469', '#86a052', '#e5b9c4'],
  summer: ['#5f8344', '#6b8d4a', '#547a42', '#6f9150'],
  autumn: ['#b9833a', '#c4672f', '#a8873a', '#9a5a30'],
  winter: ['#7c8470', '#868b78', '#737c6c', '#8a8c80'],
};

export function Vegetation({ scale, bushes, detail }: { scale: number; bushes: boolean; detail: 0 | 1 }) {
  const trees = useMemo(() => makeTrees().filter((_, i) => (i * 0.618) % 1 < scale), [scale]);
  const groups = useMemo(() => [0, 1, 2].map(k => trees.filter(t => t.kind === k && !t.far)), [trees]);
  const farGroups = useMemo(() => [trees.filter(t => t.far && t.kind === 0), trees.filter(t => t.far && t.kind !== 0)], [trees]);
  const farRefs = [useRef<THREE.InstancedMesh>(null!), useRef<THREE.InstancedMesh>(null!)];
  const farGeos = useMemo(() => { const a = new THREE.ConeGeometry(1.1, 4.6, 7); a.translate(0, 2.9, 0); const b = new THREE.SphereGeometry(1.25, 9, 6); b.scale(1, 0.85, 1); b.translate(0, 2.3, 0); return [a, b]; }, []);
  const farMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1 }), []);
  const refs = [useRef<THREE.InstancedMesh>(null!), useRef<THREE.InstancedMesh>(null!), useRef<THREE.InstancedMesh>(null!)];
  const trunk = useRef<THREE.InstancedMesh>(null!);
  const bush = useRef<THREE.InstancedMesh>(null!);
  const geos = useMemo(() => [crownGeo('pine', detail), crownGeo('round', detail), crownGeo('cypress', detail)], [detail]);
  const mats = useMemo(() => [swayMaterial(), swayMaterial(), swayMaterial()], []);
  const trunkGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6); g.translate(0, 1.2, 0); return g; }, []);
  const bushList = useMemo(() => (bushes ? makeBushesFor(sim.world) : []), [bushes]);
  const lastSeason = useRef<Season | null>(null);

  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let ti = 0;
    groups.forEach((list, k) => {
      list.forEach((t, i) => { m.compose(p.set(t.x, t.y ?? 0, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r * 6.28), sc.set(t.s, t.s, t.s)); refs[k].current.setMatrixAt(i, m); trunk.current.setMatrixAt(ti++, m); });
      refs[k].current.count = list.length; refs[k].current.instanceMatrix.needsUpdate = true;
    });
    trunk.current.count = ti; trunk.current.instanceMatrix.needsUpdate = true;
    farGroups.forEach((list, k) => {
      list.forEach((t, i) => { m.compose(p.set(t.x, t.y ?? 0, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r * 6.28), sc.set(t.s, t.s * (0.9 + t.r * 0.3), t.s)); farRefs[k].current.setMatrixAt(i, m); });
      farRefs[k].current.count = list.length; farRefs[k].current.instanceMatrix.needsUpdate = true;
    });
    bushList.forEach((b, i) => { m.compose(p.set(b.x, 0.25, b.z), q.identity(), sc.set(b.s * 1.1, b.s * 0.75, b.s * 1.1)); bush.current.setMatrixAt(i, m); });
    bush.current.count = bushList.length; bush.current.instanceMatrix.needsUpdate = true;
    lastSeason.current = null;
  }, [groups, farGroups, bushList]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    swayUniforms.uTime.value = clock.elapsedTime;
    swayUniforms.uWind.value += ((0.25 + sim.world.env.wind * 1.6) - swayUniforms.uWind.value) * 0.03;
    const season = sim.world.env.season;
    if (lastSeason.current === season) return;
    lastSeason.current = season;
    const pal = CROWN[season].map(h => new THREE.Color(h));
    const c = new THREE.Color();
    groups.forEach((list, k) => {
      list.forEach((t, i) => {
        // pines keep their needles; broadleaf trees follow the season (spring blossom on some)
        c.copy(k === 0 ? new THREE.Color(season === 'winter' ? '#58705a' : '#4f7048').lerp(pal[0], 0.15) : pal[Math.floor(t.r * 3) % 3]);
        if (season === 'spring' && k === 1 && t.r < 0.7) c.copy(pal[3]).lerp(pal[0], t.r * 0.5);
        c.offsetHSL(0, 0, (t.r - 0.5) * 0.06);
        refs[k].current.setColorAt(i, c);
      });
      if (refs[k].current.instanceColor) refs[k].current.instanceColor!.needsUpdate = true;
    });
    farGroups.forEach((list, k) => {
      list.forEach((t, i) => { c.copy(k === 0 ? new THREE.Color(season === 'winter' ? '#56695a' : '#4c6a47') : pal[Math.floor(t.r * 3) % 3]).offsetHSL(0, -0.05, (t.r - 0.5) * 0.08 - 0.04); farRefs[k].current.setColorAt(i, c); });
      if (farRefs[k].current.instanceColor) farRefs[k].current.instanceColor.needsUpdate = true;
    });
    bushList.forEach((b, i) => { c.copy(pal[(i + 1) % 3]).multiplyScalar(0.85); bush.current.setColorAt(i, c); });
    if (bush.current.instanceColor) bush.current.instanceColor.needsUpdate = true;
    // bare branches in winter: shrink broadleaf crowns
    const winter = season === 'winter';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
    list1: {
      const list = groups[1];
      list.forEach((t, i) => { const f = winter ? 0.62 : 1; m.compose(p.set(t.x, t.y ?? 0, t.z), q.setFromAxisAngle(ax, t.r * 6.28), sc.set(t.s * f, t.s * (winter ? 0.8 : 1), t.s * f)); refs[1].current.setMatrixAt(i, m); });
      refs[1].current.instanceMatrix.needsUpdate = true;
      break list1;
    }
  });

  return (
    <group>
      {[0, 1, 2].map(k => <instancedMesh key={k} ref={refs[k]} args={[geos[k], mats[k], Math.max(1, groups[k].length)]} castShadow />)}
      {[0, 1].map(k => <instancedMesh key={'far' + k} ref={farRefs[k]} args={[farGeos[k], farMat, Math.max(1, farGroups[k].length)]} />)}
      <instancedMesh ref={trunk} args={[trunkGeo, undefined, Math.max(1, trees.length)]} castShadow><meshStandardMaterial color="#6b4a2e" roughness={1} /></instancedMesh>
      <instancedMesh ref={bush} args={[undefined, undefined, Math.max(1, bushList.length)]}>
        <icosahedronGeometry args={[0.7, 1]} /><meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  );
}
