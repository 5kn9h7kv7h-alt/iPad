import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../../store/game';
import { isOpenAt } from '../../sim/behavior';
import type { Building, WorldState } from '../../sim/types';
import { atmo } from '../environment/Environment';
import { buildCity, citySignature } from './city';
import type { Cell } from './batch';
import { cityData } from './data';
import { SLOT_BACKDROP, SLOT_CHURCH } from './backdropDesign';
import { hourOf } from '../../sim/clock';
import { wetness } from '../environment/Environment';

// ---------------------------------------------------------------- textures
function plasterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3f0ea'; g.fillRect(0, 0, 128, 128);
  let s = 1337; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '90,80,60' : '255,255,255'},${0.025 + r() * 0.05})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3); }
  g.strokeStyle = 'rgba(60,50,40,0.05)'; g.lineWidth = 1;
  for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(128, y + 0.5); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}

function signAtlas(cells: Cell[]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1024);
  const cw = 256, ch = 64;
  cells.slice(0, 64).forEach((cell, i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    g.fillStyle = cell.bg; g.fillRect(x, y, cw, ch);
    g.strokeStyle = cell.fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, cw - 10, ch - 10); g.globalAlpha = 1;
    g.fillStyle = cell.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 34;
    g.font = `700 ${size}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
    while (g.measureText(cell.text).width > cw - 28 && size > 12) { size -= 2; g.font = `700 ${size}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`; }
    g.fillText(cell.text, x + cw / 2, y + ch / 2 + 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- surface atlas (CC0 textures from Poly Haven)
const ATLAS_MEAN = [0.8308, 0.2359, 0.4751, 0.3695, 0.5169, 0.7294]; // mean luminance per slot (tools/assets/build-textures.py)
function loadTex(url: string, srgb: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(new URL(url, document.baseURI).href);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/**
 * One material for every wall, roof, street and prop: the vertex attribute aMat picks a slot of the texture
 * atlas (plaster, roof tiles, stone, wood, cobblestone, flat). Textures only add *detail* (their luminance
 * relative to the slot mean), so the art-directed vertex colours stay in charge of the palette.
 */
function makeSurfaceMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0,
    map: loadTex('assets/textures/atlas_diff.jpg', true), normalMap: loadTex('assets/textures/atlas_nrm.jpg', false),
  });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; varying float vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    const atlas = `
varying float vMat;
const float ATLAS_MEAN[6] = float[6](${ATLAS_MEAN.map(v => v.toFixed(4)).join(', ')});
float matScale(int mi) { return mi == 1 ? 2.6 : mi == 2 ? 1.25 : mi == 3 ? 1.7 : mi == 4 ? 1.9 : 1.0; }
vec4 atlasSample(sampler2D tex, vec2 uv, int mi) {
  vec2 w = uv * matScale(mi);
  vec2 cell = vec2(float(mi % 3), float(1 - mi / 3));   // textures are flipped: the image's top row is uv y = 1
  vec2 g = vec2(480.0 / 1536.0, 480.0 / 1024.0);
  vec2 a = (cell * 512.0 + 16.0) / vec2(1536.0, 1024.0) + fract(w) * g;
  return textureGrad(tex, a, dFdx(w) * g, dFdy(w) * g);
}`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + atlas)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  int mi = int(vMat + 0.5);
  vec4 tx = atlasSample(map, vMapUv, mi);
  float detail = clamp(dot(tx.rgb, vec3(0.2126, 0.7152, 0.0722)) / ATLAS_MEAN[mi], 0.3, 1.9);
  float strength = mi == 5 ? 0.0 : mi == 0 ? 0.5 : 0.9;
  diffuseColor.rgb *= mix(1.0, detail, strength);
#endif`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
  int mn = int(vMat + 0.5);
  vec3 mapN = atlasSample(normalMap, vNormalMapUv, mn).xyz * 2.0 - 1.0;
  mapN.xy *= mn == 5 ? 0.0 : mn == 0 ? 0.55 : 1.0;`);
  };
  return m;
}

// ---------------------------------------------------------------- materials
export const MAX_LIT = 96;
const glassUniforms = { uLit: { value: new Array<number>(MAX_LIT).fill(0) }, uGlow: { value: 0 } };

function makeGlassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, glassUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aSeed; attribute float aBld; uniform float uLit[${MAX_LIT}]; varying float vLit; varying float vLamp;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aSeed < 0.0 ? 1.0 : 0.0; vLit = aSeed < 0.0 ? 1.0 : step(aSeed, uLit[int(aBld + 0.5)]);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit; varying float vLamp; uniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.30) * vLit * uGlow * (0.6 + vLamp * 2.8);');
  };
  return m;
}

/**
 * Share of a building's windows lit right now, from who is actually inside: a house glows when someone is home
 * and awake, an apartment by how many are up, a shop while it is open. Read-only on the sim.
 */
export function windowLight(w: WorldState, b: Building): number {
  if (b.status !== 'open') return 0;
  if (b.isHome) {
    let awake = 0;
    for (const c of Object.values(w.citizens)) if (c.currentLocation === b.id && c.movedOutAt === undefined && c.activity !== 'sleep') awake++;
    if (b.kind === 'apartment') return Math.min(0.85, 0.04 + 0.16 * awake);
    return awake ? Math.min(0.9, 0.5 + 0.15 * awake) : 0.03;
  }
  if (isOpenAt(b, w.time)) return 0.95;
  return Object.values(w.citizens).some(c => c.currentLocation === b.id && c.plan?.arrived) ? 0.3 : 0.04;
}

export function Buildings() {
  const world = sim.world;
  useGame(s => s.rev);
  const sig = citySignature(world);
  const selected = useGame(s => s.selectedBuilding);
  const select = useGame(s => s.selectBuilding);

  const built = useMemo(() => buildCity(world), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const geos = useMemo(() => ({
    solid: built.toGeometry(built.solid, false), glass: built.toGeometry(built.glass, true), sign: built.toGeometry(built.sign, false),
  }), [built]);
  useMemo(() => {
    cityData.anchors = built.anchors;
    cityData.boxes = Object.values(world.buildings).filter(b => b.status !== 'demolished' && !['park', 'plaza', 'beach'].includes(b.kind)).map(b => ({ x: b.x, z: b.z, hw: b.w / 2 + 1.5, hd: b.d / 2 + 1.5, h: b.h }));
    cityData.version++;
  }, [built]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { geos.solid.dispose(); geos.glass.dispose(); geos.sign.dispose(); }, [geos]);

  const plaster = useMemo(plasterTexture, []);
  const atlas = useMemo(() => signAtlas(built.cells), [built]);
  useEffect(() => () => atlas.dispose(), [atlas]);
  const solidMat = useMemo(() => makeSurfaceMaterial(), []);
  void plaster;
  const glassMat = useMemo(makeGlassMaterial, []);
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.6 }), [atlas]);

  useFrame(() => {
    const lit = glassUniforms.uLit.value;
    built.ranges.forEach((r, i) => { if (i < SLOT_BACKDROP) { const b = sim.world.buildings[r.id]; lit[i] = b ? windowLight(sim.world, b) : 0; } });
    // background houses: a share of windows by the hour (people we do not simulate are home in the evening)
    const h = hourOf(sim.world.time);
    lit[SLOT_BACKDROP] = h >= 17 ? 0.62 * Math.min(1, (h - 17) / 2.5) * (h > 23 ? 0.35 : 1) : h < 1 ? 0.25 : h < 5 ? 0.06 : h < 7 ? 0.3 : 0.05;
    lit[SLOT_CHURCH] = 1;
    const glow = THREE.MathUtils.smoothstep(atmo.night + (1 - atmo.sunGlow) * 0.12 * (1 - atmo.sunGlow), 0.18, 0.75);
    glassUniforms.uGlow.value = glow;
    signMat.emissiveIntensity = glow * 0.55;
    const wet = wetness();
    solidMat.roughness = 0.92 - wet * 0.5; solidMat.color.setScalar(1 - wet * 0.2);
  });

  const pick = (e: { faceIndex?: number; stopPropagation: () => void }) => {
    e.stopPropagation();
    const f = e.faceIndex ?? -1;
    const r = built.ranges.find(x => f >= x.start && f < x.end);
    if (r && sim.world.buildings[r.id]) select(r.id);
  };
  const sel = selected ? world.buildings[selected] : null;
  const closed = Object.values(world.buildings).filter(b => b.status === 'closed');

  return (
    <group>
      <mesh geometry={geos.solid} material={solidMat} castShadow receiveShadow onClick={pick}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')} />
      <mesh geometry={geos.glass} material={glassMat} raycast={() => null} />
      <mesh geometry={geos.sign} material={signMat} raycast={() => null} />
      {sel && (
        <mesh rotation-x={-Math.PI / 2} position={[sel.x, 0.3, sel.z]}>
          <ringGeometry args={[Math.max(sel.w, sel.d) * 0.62, Math.max(sel.w, sel.d) * 0.62 + 0.5, 48]} /><meshBasicMaterial color="#ffd36b" transparent opacity={0.9} />
        </mesh>
      )}
      {closed.map(b => (
        <Html key={b.id} position={[b.x, b.h + 2, b.z]} center distanceFactor={60}><div className="hud-label">閉店</div></Html>
      ))}
    </group>
  );
}
