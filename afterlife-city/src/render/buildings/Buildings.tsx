import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../../store/game';
import { hourOf } from '../../sim/clock';
import { atmo } from '../environment/Environment';
import { buildCity, citySignature } from './city';
import type { Cell } from './batch';
import { cityData } from './data';
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

// ---------------------------------------------------------------- materials
const glassUniforms = { uHome: { value: 0 }, uShop: { value: 0 }, uGlow: { value: 0 } };

function makeGlassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.15, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, glassUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed; attribute float aShop; uniform float uHome; uniform float uShop; varying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aSeed < 0.0 ? 1.0 : step(aSeed, mix(uHome, uShop, aShop));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit; uniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.30) * vLit * uGlow * 0.7;');
  };
  return m;
}

/** Fraction of home / shop windows that are lit at a given hour. */
export function litFractions(hour: number): { home: number; shop: number } {
  const ramp = (a: number, b: number, h: number) => Math.min(1, Math.max(0, (h - a) / (b - a)));
  let home = 0;
  if (hour >= 17) home = 0.7 * ramp(17, 20, hour) * (1 - 0.85 * ramp(23, 25, hour));
  else if (hour < 1) home = 0.7 * (1 - 0.85 * ramp(23 - 24, 1, hour));
  else if (hour < 7) home = 0.4 * ramp(4.5, 5.5, hour) * (1 - ramp(6, 7, hour));
  const shop = hour >= 9 && hour < 21 ? 0.95 : hour >= 21 || hour < 1 ? 0.12 : 0.05;
  return { home, shop };
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
  const solidMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, map: plaster, roughness: 0.92, metalness: 0 }), [plaster]);
  const glassMat = useMemo(makeGlassMaterial, []);
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.6 }), [atlas]);

  useFrame(() => {
    const f = litFractions(hourOf(sim.world.time));
    glassUniforms.uHome.value = f.home; glassUniforms.uShop.value = f.shop;
    const glow = THREE.MathUtils.smoothstep(atmo.night + (1 - atmo.sunGlow) * 0.25, 0.1, 0.7);
    glassUniforms.uGlow.value = glow;
    signMat.emissiveIntensity = glow * 0.55;
    const wet = wetness();
    solidMat.roughness = 0.92 - wet * 0.5; solidMat.color.setScalar(1 - wet * 0.2);
  });

  const pick = (e: { faceIndex?: number; stopPropagation: () => void }) => {
    e.stopPropagation();
    const f = e.faceIndex ?? -1;
    const r = built.ranges.find(x => f >= x.start && f < x.end);
    if (r && !r.id.startsWith('lot:') && r.id !== 'street') select(r.id);
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
        <Html key={b.id} position={[b.x, b.h + 2, b.z]} center distanceFactor={60}><div className="pointer-events-none rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">閉店</div></Html>
      ))}
    </group>
  );
}
