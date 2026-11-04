import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../store/game';
import { isOutdoor } from '../sim/paths';
import { hourOf } from '../sim/clock';
import type { Building, Citizen, WorldState } from '../sim/types';
import { QUALITY, type QualityTier } from './quality';
import { registry } from './registry';
import { chooseShot, newDirector, poseFor, type DirectorState, type Shot } from './director';

// ------------------------------------------------------------------ palettes
const SKIN = ['#f1c9a5', '#e0ac82', '#c68b5f', '#8d5a3b'];
const HAIR = ['#2a211c', '#4a3426', '#7a5230', '#b88a4a', '#8c8c92', '#c0452d'];
const TOP = ['#d65a4f', '#e0a64a', '#5b8fd1', '#4fa08a', '#8c6bb5', '#e8e2d6', '#3f4a5c', '#c46f9a', '#7aa84c', '#d98c3a'];
const BOTTOM = ['#2b3445', '#4a4036', '#6b7280', '#3a5a7a', '#1f2a24'];

const WALL: Record<string, string> = {
  house: '#e8dccb', apartment: '#cfd6dc', cafe: '#e8c9a0', bookstore: '#a98a68', restaurant: '#d9a384', shop: '#d8c58f',
  market: '#9bbcc4', warehouse: '#a3a8ad', fishery: '#7fa3b8', station: '#d9d3c4', convenience: '#cfe3d4', lookout: '#f2efe8',
  tourist: '#b8d4e6', office: '#c6c9d1', park: '#7aa86a', plaza: '#cfc8bb', beach: '#e6d6a8',
};
const ROOF: Record<string, string> = {
  house: '#a8503c', apartment: '#6d7480', cafe: '#7a4a3a', bookstore: '#5b4636', restaurant: '#7c3e34', shop: '#8a6a3a',
  market: '#476b78', warehouse: '#5d6268', fishery: '#3f6277', station: '#4b5563', convenience: '#3f7c5a', lookout: '#b23a3a',
  tourist: '#2f6f9a', office: '#4a4f5a',
};

function shade(hex: string, tint: number): THREE.Color {
  const c = new THREE.Color(hex);
  c.offsetHSL((tint - 0.5) * 0.04, 0, (tint - 0.5) * 0.08);
  return c;
}

// ------------------------------------------------------------------ lighting & sky
const NIGHT = new THREE.Color('#080f22'), DUSK = new THREE.Color('#f08a5d'), DAY = new THREE.Color('#86bfe8');
const WGREY = new THREE.Color('#8f9ba5');

function Lighting({ shadowMap }: { shadowMap: number }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const sky = useMemo(() => new THREE.Color(), []);
  useEffect(() => { scene.fog = new THREE.FogExp2('#86bfe8', 0.003); }, [scene]);
  useFrame(() => {
    const w = sim.world, e = w.env;
    const dl = e.daylight;
    const h = hourOf(w.time);
    if (dl < 0.7) sky.copy(NIGHT).lerp(DUSK, dl / 0.7); else sky.copy(DUSK).lerp(DAY, (dl - 0.7) / 0.3);
    const grey = e.weather === 'rain' ? 0.72 : e.weather === 'fog' ? 0.88 : e.weather === 'cloudy' ? 0.45 : 0;
    sky.lerp(WGREY.clone().multiplyScalar(0.25 + 0.75 * dl), grey);
    scene.background = sky;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(sky);
    const target = e.weather === 'fog' ? 0.016 : e.weather === 'rain' ? 0.0065 : 0.0028;
    fog.density += (target - fog.density) * 0.04;
    const ang = ((h - 6) / 12) * Math.PI;
    const elev = Math.max(0.05, Math.sin(ang));
    sun.current.position.set(Math.cos(ang) * 160, elev * 130 + 8, 50);
    sun.current.intensity = dl * (e.weather === 'clear' ? 2.4 : e.weather === 'cloudy' ? 1.4 : 0.8);
    sun.current.color.set(dl < 0.75 ? '#ffb27a' : '#fff4e0');
    moon.current.intensity = (1 - dl) * 0.35;
    hemi.current.intensity = 0.25 + dl * 0.75;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe6ff', '#4a5a40', 0.8]} />
      <directionalLight ref={sun} castShadow shadow-mapSize={[shadowMap, shadowMap]} shadow-camera-left={-110} shadow-camera-right={110}
        shadow-camera-top={90} shadow-camera-bottom={-90} shadow-camera-near={10} shadow-camera-far={420} shadow-bias={-0.0005} />
      <directionalLight ref={moon} position={[-80, 90, -40]} color="#7f9bff" />
    </>
  );
}

// ------------------------------------------------------------------ terrain
function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, -78]} receiveShadow>
        <planeGeometry args={[420, 260]} />
        <meshStandardMaterial color="#6f9a5a" roughness={1} />
      </mesh>
      {/* harbor concrete + beach sand */}
      <mesh rotation-x={-Math.PI / 2} position={[-48, 0.02, 41]} receiveShadow><planeGeometry args={[62, 22]} /><meshStandardMaterial color="#9aa0a3" roughness={1} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[38, 0.02, 47]} receiveShadow><planeGeometry args={[70, 14]} /><meshStandardMaterial color="#e3d3a2" roughness={1} /></mesh>
      {/* old-town paving */}
      <mesh rotation-x={-Math.PI / 2} position={[-47, 0.015, 0]} receiveShadow><planeGeometry args={[62, 40]} /><meshStandardMaterial color="#b9ad98" roughness={1} /></mesh>
      {/* piers */}
      {[-70, -52, -34].map(x => (
        <mesh key={x} position={[x, 0.2, 56]} receiveShadow castShadow><boxGeometry args={[3, 0.5, 16]} /><meshStandardMaterial color="#7d6b58" roughness={0.9} /></mesh>
      ))}
      <Mountains />
    </group>
  );
}

function Mountains() {
  const peaks: [number, number, number, number][] = [
    [-130, -150, 60, 36], [-70, -165, 75, 46], [0, -170, 70, 40], [70, -165, 80, 48], [130, -150, 60, 34], [-175, -60, 55, 30], [175, -60, 55, 32],
  ];
  return (
    <group>
      {peaks.map(([x, z, r, h], i) => (
        <mesh key={i} position={[x, h / 2 - 1, z]}><coneGeometry args={[r, h, 7]} /><meshStandardMaterial color={i % 2 ? '#4f6b55' : '#5a7a60'} roughness={1} flatShading /></mesh>
      ))}
    </group>
  );
}

function Sea({ seg }: { seg: [number, number] }) {
  const ref = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(320, 150, seg[0], seg[1]); g.rotateX(-Math.PI / 2); return g; }, [seg]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as ArrayLike<number>), [geo]);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const amp = 0.15 + sim.world.env.sea * 0.9;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.11 + t * 0.9) * amp * 0.5 + Math.cos(z * 0.16 + t * 0.7) * amp * 0.45);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const dl = sim.world.env.daylight;
    tint.set('#1c5f86').lerp(new THREE.Color('#06142a'), 1 - dl);
    if (sim.world.env.weather === 'rain' || sim.world.env.weather === 'cloudy') tint.lerp(new THREE.Color('#4c6577'), 0.4);
    mat.current.color.copy(tint);
  });
  return (
    <mesh ref={ref} geometry={geo} position={[0, -0.25, 127]} receiveShadow>
      <meshStandardMaterial ref={mat} color="#1c5f86" roughness={0.25} metalness={0.2} />
    </mesh>
  );
}

function Roads() {
  const w = sim.world;
  const segs = useMemo(() => {
    const out: { a: [number, number]; b: [number, number] }[] = [];
    const seen = new Set<string>();
    for (const n of Object.values(w.nodes)) for (const l of n.links) {
      const key = [n.id, l].sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      out.push({ a: [n.x, n.z], b: [w.nodes[l].x, w.nodes[l].z] });
    }
    return out;
  }, [w.nodes]);
  return (
    <group>
      {segs.map((s, i) => {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        const horizontal = s.a[1] === s.b[1];
        return (
          <mesh key={i} position={[(s.a[0] + s.b[0]) / 2, 0.06, (s.a[1] + s.b[1]) / 2]} receiveShadow>
            <boxGeometry args={[horizontal ? len + 3.2 : 3.2, 0.1, horizontal ? 3.2 : len + 3.2]} />
            <meshStandardMaterial color="#4a4e55" roughness={0.95} />
          </mesh>
        );
      })}
      {Object.values(w.nodes).map(n => <Streetlamp key={n.id} x={n.x + 2.3} z={n.z + 2.3} />)}
    </group>
  );
}

// Shared emissive materials so night lighting is a single update per frame.
const lampMat = new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffc66b', emissiveIntensity: 0 });
const windowMat = new THREE.MeshStandardMaterial({ color: '#8fb4c8', emissive: '#ffcf80', emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 });

function LightsDriver() {
  useFrame(() => {
    const on = sim.world.env.lightsOn;
    const target = on ? 1.6 : 0;
    lampMat.emissiveIntensity += (target - lampMat.emissiveIntensity) * 0.05;
    windowMat.emissiveIntensity += ((on ? 1.1 : 0) - windowMat.emissiveIntensity) * 0.05;
  });
  return null;
}

function Streetlamp({ x, z, big }: { x: number; z: number; big?: boolean }) {
  const hh = big ? 5.2 : 4.2;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, hh / 2, 0]} castShadow><cylinderGeometry args={[0.08, 0.1, hh, 6]} /><meshStandardMaterial color="#2c3036" /></mesh>
      <mesh position={[0, hh + 0.1, 0]} material={lampMat}><sphereGeometry args={[big ? 0.45 : 0.32, 10, 8]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------------ buildings
function BuildingMesh({ b, selected, onPick }: { b: Building; selected: boolean; onPick: () => void }) {
  const wall = useMemo(() => shade(WALL[b.kind] ?? '#ccc', b.tint), [b.kind, b.tint]);
  const roof = useMemo(() => shade(ROOF[b.kind] ?? '#555', b.tint), [b.kind, b.tint]);
  const closed = b.status === 'closed';
  const click = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onPick(); };

  if (b.kind === 'park') {
    return (
      <group position={[b.x, 0, b.z]} onClick={click}>
        <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[b.w, 0.12, b.d]} /><meshStandardMaterial color="#7fb06c" roughness={1} /></mesh>
        <mesh position={[0, 0.14, 0]}><boxGeometry args={[b.w * 0.78, 0.05, 0.9]} /><meshStandardMaterial color="#d9cfb8" /></mesh>
        {selected && <SelectRing r={Math.max(b.w, b.d) * 0.55} />}
      </group>
    );
  }
  if (b.kind === 'plaza' || b.kind === 'beach') {
    return (
      <group position={[b.x, 0, b.z]} onClick={click}>
        <mesh position={[0, b.kind === 'plaza' ? 0.08 : 0.05, 0]} receiveShadow>
          <boxGeometry args={[b.w, 0.12, b.d]} /><meshStandardMaterial color={b.kind === 'plaza' ? '#d8d0c0' : '#ebdcae'} roughness={1} />
        </mesh>
        {selected && <SelectRing r={Math.min(Math.max(b.w, b.d) * 0.55, 14)} />}
      </group>
    );
  }
  const lighthouse = b.kind === 'lookout';
  return (
    <group position={[b.x, 0, b.z]} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      {lighthouse ? (
        <>
          <mesh position={[0, b.h / 2, 0]} castShadow><cylinderGeometry args={[2.2, 3.2, b.h, 12]} /><meshStandardMaterial color={wall} /></mesh>
          <mesh position={[0, b.h * 0.55, 0]}><cylinderGeometry args={[2.25, 2.6, 1.2, 12]} /><meshStandardMaterial color="#b23a3a" /></mesh>
          <mesh position={[0, b.h + 0.6, 0]} material={lampMat}><sphereGeometry args={[1.1, 12, 10]} /></mesh>
          <mesh position={[0, b.h + 1.9, 0]} castShadow><coneGeometry args={[1.6, 1.8, 12]} /><meshStandardMaterial color={roof} /></mesh>
        </>
      ) : (
        <>
          <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} /><meshStandardMaterial color={closed ? '#8d8d8d' : wall} roughness={0.85} />
          </mesh>
          {/* window band */}
          {!closed && b.h >= 4 && (
            <>
              <mesh position={[0, b.h * 0.58, b.d / 2 + 0.02]} material={windowMat}><boxGeometry args={[b.w * 0.8, b.h * (b.kind === 'apartment' ? 0.7 : 0.28), 0.06]} /></mesh>
              <mesh position={[0, b.h * 0.58, -b.d / 2 - 0.02]} material={windowMat}><boxGeometry args={[b.w * 0.8, b.h * (b.kind === 'apartment' ? 0.7 : 0.28), 0.06]} /></mesh>
            </>
          )}
          {b.kind === 'house' || b.kind === 'bookstore' || b.kind === 'cafe' || b.kind === 'shop' ? (
            <mesh position={[0, b.h + b.w * 0.18, 0]} rotation-y={Math.PI / 4} castShadow>
              <coneGeometry args={[Math.max(b.w, b.d) * 0.78, b.w * 0.36, 4]} /><meshStandardMaterial color={closed ? '#666' : roof} roughness={0.9} />
            </mesh>
          ) : b.kind === 'tourist' ? (
            <mesh position={[0, b.h, 0]} castShadow><sphereGeometry args={[b.w * 0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={roof} /></mesh>
          ) : (
            <mesh position={[0, b.h + 0.25, 0]} castShadow><boxGeometry args={[b.w + 0.6, 0.5, b.d + 0.6]} /><meshStandardMaterial color={closed ? '#666' : roof} /></mesh>
          )}
          {/* awning for shops */}
          {['cafe', 'shop', 'restaurant', 'convenience', 'bookstore'].includes(b.kind) && !closed && (
            <mesh position={[0, 2.5, b.d / 2 + 0.7]} rotation-x={0.35}><boxGeometry args={[b.w * 0.7, 0.12, 1.6]} /><meshStandardMaterial color={b.tint > 0.5 ? '#c9473a' : '#2f6f9a'} /></mesh>
          )}
          {b.kind === 'station' && <mesh position={[0, b.h + 2.2, b.d / 2 - 0.4]} rotation-x={Math.PI / 2}><cylinderGeometry args={[1, 1, 0.3, 20]} /><meshStandardMaterial color="#f5f1e6" emissive="#ffe0a0" emissiveIntensity={0.1} /></mesh>}
        </>
      )}
      {selected && <SelectRing r={Math.max(b.w, b.d) * 0.7} />}
      {closed && <Html position={[0, b.h + 2, 0]} center distanceFactor={60}><div className="pointer-events-none rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">閉店</div></Html>}
    </group>
  );
}

function SelectRing({ r }: { r: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.25, 0]}>
      <ringGeometry args={[r, r + 0.5, 48]} /><meshBasicMaterial color="#ffd36b" transparent opacity={0.9} />
    </mesh>
  );
}

function Buildings() {
  const world = sim.world;
  const selected = useGame(s => s.selectedBuilding);
  const select = useGame(s => s.selectBuilding);
  useGame(s => s.rev);
  const sig = Object.values(world.buildings).map(b => b.id + b.status).join();
  const list = useMemo(() => Object.values(world.buildings).filter(b => b.status !== 'demolished'), [sig, world]); // eslint-disable-line react-hooks/exhaustive-deps
  const lots = world.lots.filter(l => !l.used);
  return (
    <group>
      {list.map(b => <BuildingMesh key={b.id} b={b} selected={selected === b.id} onPick={() => select(b.id)} />)}
      {lots.map(l => (
        <mesh key={l.id} position={[l.x, 0.05, l.z]} rotation-x={-Math.PI / 2}><planeGeometry args={[l.w, l.d]} /><meshStandardMaterial color="#a6b08a" roughness={1} /></mesh>
      ))}
      {world.construction.map(c => {
        const l = world.lots.find(x => x.id === c.lotId);
        return l ? (
          <group key={c.id} position={[l.x, 0, l.z]}>
            <mesh position={[0, 1.4, 0]}><boxGeometry args={[l.w * 0.7, 2.8, l.d * 0.7]} /><meshStandardMaterial color="#d9b25c" wireframe /></mesh>
          </group>
        ) : null;
      })}
    </group>
  );
}

function Props() {
  const world = sim.world;
  useGame(s => s.rev);
  return (
    <group>
      {world.props.map(p => {
        switch (p.kind) {
          case 'bench':
            return <group key={p.id} position={[p.x, 0.3, p.z]}><mesh castShadow><boxGeometry args={[1.8, 0.12, 0.6]} /><meshStandardMaterial color="#8a5a34" /></mesh><mesh position={[0, 0.35, -0.28]}><boxGeometry args={[1.8, 0.5, 0.08]} /><meshStandardMaterial color="#8a5a34" /></mesh></group>;
          case 'plant':
            return <group key={p.id} position={[p.x, 0, p.z]}><mesh position={[0, 0.5, 0]} castShadow><sphereGeometry args={[0.7, 10, 8]} /><meshStandardMaterial color="#4e9a55" /></mesh><mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.35, 0.28, 0.3, 8]} /><meshStandardMaterial color="#a0663a" /></mesh></group>;
          case 'streetlight':
            return <Streetlamp key={p.id} x={p.x} z={p.z} big />;
          default:
            return <group key={p.id} position={[p.x, 0, p.z]}><mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[1.6, 0.12, 1.6]} /><meshStandardMaterial color="#d6613a" /></mesh><mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.1, 0.1, 1.1, 6]} /><meshStandardMaterial color="#3f6fb0" /></mesh></group>;
        }
      })}
    </group>
  );
}

function Trees({ scale }: { scale: number }) {
  const trunks = useRef<THREE.InstancedMesh>(null!);
  const crowns = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const park = sim.world.buildings['b_park'];
    for (let i = 0; i < 18; i++) out.push([park.x + (r() - 0.5) * (park.w - 2), park.z + (r() - 0.5) * (park.d - 2), 1 + r() * 0.5]);
    for (let i = 0; i < 70; i++) {
      const x = -95 + r() * 190, z = -85 + r() * 45;
      out.push([x, z, 0.9 + r() * 1.1]);
    }
    for (let i = 0; i < 24; i++) out.push([-85 + r() * 18, -25 + r() * 40, 0.8 + r()]);
    for (let i = 0; i < 20; i++) out.push([80 + r() * 18, -50 + r() * 70, 0.9 + r()]);
    return out.filter((_, i) => (i * 0.618) % 1 < scale).filter(([x, z]) => !Object.values(sim.world.buildings).some(b => Math.abs(b.x - x) < b.w / 2 + 2 && Math.abs(b.z - z) < b.d / 2 + 2) && !(Math.abs(z) < 3 || Math.abs(z - 30) < 3 || Math.abs(z + 30) < 3));
  }, [scale]);
  useEffect(() => {
    const m = new THREE.Matrix4();
    pts.forEach(([x, z, s], i) => {
      m.compose(new THREE.Vector3(x, 0.8 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunks.current.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 2.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      crowns.current.setMatrixAt(i, m);
    });
    trunks.current.instanceMatrix.needsUpdate = true; crowns.current.instanceMatrix.needsUpdate = true;
  }, [pts]);
  const season = sim.world.env.season;
  const crown = season === 'autumn' ? '#c9702f' : season === 'winter' ? '#7d8f77' : season === 'spring' ? '#7fbf72' : '#3f8a4a';
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, pts.length]} castShadow><cylinderGeometry args={[0.18, 0.25, 1.6, 6]} /><meshStandardMaterial color="#6b4a2e" /></instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, pts.length]} castShadow><coneGeometry args={[1.4, 3.2, 7]} /><meshStandardMaterial color={crown} roughness={1} flatShading /></instancedMesh>
    </group>
  );
}

function Boats() {
  const refs = useRef<THREE.Group[]>([]);
  const spots: [number, number][] = [[-61, 62], [-43, 60], [-25, 66], [-8, 78], [40, 85]];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.position.y = Math.sin(t * 0.8 + i) * 0.2 + 0.1 + sim.world.env.sea * Math.sin(t * 1.3 + i) * 0.3;
      g.rotation.z = Math.sin(t * 0.7 + i) * 0.05;
      g.position.x = spots[i][0] + (i === 3 || i === 4 ? Math.sin(t * 0.05 + i) * 12 : 0);
    });
  });
  return (
    <group>
      {spots.map((p, i) => (
        <group key={i} ref={el => { if (el) refs.current[i] = el; }} position={[p[0], 0, p[1]]} rotation-y={i % 2 ? 0.4 : -0.3}>
          <mesh castShadow><boxGeometry args={[2.2, 0.9, 6]} /><meshStandardMaterial color={i % 2 ? '#c7503c' : '#2f6f9a'} /></mesh>
          <mesh position={[0, 1, -0.8]} castShadow><boxGeometry args={[1.6, 1.2, 1.8]} /><meshStandardMaterial color="#efe9de" /></mesh>
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ citizens
interface RenderState { x: number; z: number; heading: number }

function CitizenFigure({ c, store }: { c: Citizen; store: Map<string, RenderState> }) {
  const group = useRef<THREE.Group>(null!);
  const selected = useGame(s => s.selectedCitizen === c.id);
  const spotlight = useGame(s => s.spotlight === c.id);
  const select = useGame(s => s.selectCitizen);
  const look = c.look;
  useFrame(({ clock }, dt) => {
    const w = sim.world;
    const cc = w.citizens[c.id];
    const b = w.buildings[cc.currentLocation];
    const inside = !!b && !isOutdoor(b) && cc.plan?.arrived === true;
    const gone = cc.movedOutAt !== undefined;
    const g = group.current;
    g.visible = !inside && !gone;
    if (!g.visible) return;
    let rs = store.get(c.id);
    if (!rs) { rs = { x: cc.x, z: cc.z, heading: 0 }; store.set(c.id, rs); }
    const k = 1 - Math.exp(-dt * 6);
    const dx = cc.x - rs.x, dz = cc.z - rs.z;
    if (Math.hypot(dx, dz) > 30) { rs.x = cc.x; rs.z = cc.z; } else { rs.x += dx * k; rs.z += dz * k; }
    if (Math.hypot(dx, dz) > 0.05) rs.heading = Math.atan2(dx, dz);
    const moving = cc.activity === 'commute';
    g.position.set(rs.x, moving ? Math.abs(Math.sin(clock.elapsedTime * 9 + look.top)) * 0.12 : 0, rs.z);
    g.rotation.y = rs.heading;
  });
  const h = look.height;
  return (
    <group ref={group} scale={[1, h, 1]} onClick={e => { e.stopPropagation(); select(c.id); }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <mesh position={[0, 0.55, 0]} castShadow><capsuleGeometry args={[0.28, 0.5, 4, 8]} /><meshStandardMaterial color={TOP[look.top]} /></mesh>
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.27, 0.22, 0.3, 8]} /><meshStandardMaterial color={BOTTOM[look.bottom]} /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><sphereGeometry args={[0.22, 12, 10]} /><meshStandardMaterial color={SKIN[look.skin]} /></mesh>
      <mesh position={[0, 1.27, -0.02]}><sphereGeometry args={[0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} /><meshStandardMaterial color={HAIR[look.hair]} /></mesh>
      {(selected || spotlight) && (
        <>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}><ringGeometry args={[0.6, 0.78, 28]} /><meshBasicMaterial color={spotlight ? '#ff9ec3' : '#ffd36b'} /></mesh>
          <Html position={[0, 2.1, 0]} center distanceFactor={26} zIndexRange={[10, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">{c.name}</div>
          </Html>
        </>
      )}
    </group>
  );
}

function Citizens() {
  const ids = useGame(s => s.rev) && Object.keys(sim.world.citizens).join();
  const store = useMemo(() => new Map<string, RenderState>(), []);
  const list = useMemo(() => Object.values(sim.world.citizens), [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  return <group>{list.map(c => <CitizenFigure key={c.id} c={c} store={store} />)}</group>;
}

// ------------------------------------------------------------------ rain
function Rain({ drops }: { drops: number }) {
  const ref = useRef<THREE.LineSegments>(null!);
  const N = drops;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = -110 + Math.random() * 220, y = Math.random() * 60, z = -80 + Math.random() * 170;
      arr.set([x, y, z, x - 0.1, y - 1.3, z], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const on = sim.world.env.weather === 'rain';
    ref.current.visible = on;
    if (!on) return;
    const a = geo.attributes.position as THREE.BufferAttribute;
    const d = Math.min(dt, 0.05) * 55;
    for (let i = 0; i < N; i++) {
      let y = a.getY(i * 2) - d;
      if (y < 0) y += 60;
      a.setY(i * 2, y); a.setY(i * 2 + 1, y - 1.3);
    }
    a.needsUpdate = true;
  });
  return <lineSegments ref={ref} geometry={geo}><lineBasicMaterial color="#bcd3e8" transparent opacity={0.45} /></lineSegments>;
}

// ------------------------------------------------------------------ camera rig
const MANUAL_RESUME_SECONDS = 25;

function CameraRig() {
  const { camera } = useThree();
  const controls = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const director = useRef<DirectorState>(newDirector());
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const shotStart = useRef(0);
  const userActive = useRef(false);
  const lastMode = useRef('auto');
  const focusSeen = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    camera.position.set(0, 95, 120);
    look.current.set(0, 0, 0);
    registry.camera = camera as THREE.PerspectiveCamera; registry.look = look.current;
  }, [camera]);

  useFrame(({ clock }, dt) => {
    const g = useGame.getState();
    const now = clock.elapsedTime;
    let mode = g.cameraMode;
    if (mode === 'manual' && performance.now() / 1000 - registry.lastInteract > MANUAL_RESUME_SECONDS && !userActive.current) {
      g.setCameraMode('auto'); mode = 'auto';
    }
    if (mode === 'manual') { lastMode.current = mode; return; }
    if (lastMode.current === 'manual') { director.current.current = null; look.current.copy(controls.current?.target ?? look.current); }
    lastMode.current = mode;

    const w = sim.world;
    const d = director.current;
    const fc = g.focus;
    if (fc && fc.at !== focusSeen.current && w.buildings[fc.buildingId]) {
      focusSeen.current = fc.at;
      d.current = { kind: 'event', label: 'Event Shot', ttl: 14, locationId: fc.buildingId }; shotStart.current = now;
      g.setShotLabel('Event Shot');
    } else if (mode === 'follow' && g.spotlight && w.citizens[g.spotlight]) {
      if (d.current?.kind !== 'follow' || d.current.citizenId !== g.spotlight || d.current.ttl < 1e6) {
        d.current = { kind: 'follow', label: 'Character Follow', ttl: 1e9, citizenId: g.spotlight }; shotStart.current = now;
        g.setShotLabel('Character Follow');
      }
    } else if (!d.current || now - shotStart.current > d.current.ttl || d.current.ttl > 1e6) {
      const shot: Shot = chooseShot(w, d, g.spotlight);
      d.current = shot; shotStart.current = now;
      g.setShotLabel(shot.label);
    }
    const pose = poseFor(w, d.current!, now - shotStart.current, now);
    const k = 1 - Math.exp(-dt * (d.current?.kind === "follow" ? 2.6 : 1.7));
    camera.position.lerp(tmp.set(...pose.pos), k);
    look.current.lerp(tmp.set(...pose.look), k * 1.4);
    camera.lookAt(look.current);
    if (controls.current) { controls.current.target.copy(look.current); }
  });

  return (
    <OrbitControls
      ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={230}
      maxPolarAngle={Math.PI / 2 - 0.04} zoomSpeed={0.9}
      onStart={() => { userActive.current = true; }}
      onChange={() => {
        if (userActive.current && useGame.getState().cameraMode !== 'manual') useGame.getState().setCameraMode('manual');
        registry.lastInteract = performance.now() / 1000;
      }}
      onEnd={() => { userActive.current = false; registry.lastInteract = performance.now() / 1000; }}
    />
  );
}

function StatsProbe() {
  const gl = useThree(s => s.gl);
  useEffect(() => { gl.info.autoReset = false; }, [gl]);
  useFrame(() => {
    // Runs before this frame's render, so info holds the previous completed frame.
    const i = gl.info;
    registry.stats = { drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    i.reset();
  });
  return null;
}

export function CityCanvas({ frameloop, tier }: { frameloop: 'always' | 'never'; tier: QualityTier }) {
  const q = QUALITY[tier];
  const select = useGame(s => s.selectCitizen);
  const selectB = useGame(s => s.selectBuilding);
  return (
    <Canvas
      key={tier}
      shadows={q.shadows} frameloop={frameloop} dpr={[1, q.dprMax]}
      camera={{ fov: 50, near: 0.5, far: 700, position: [0, 95, 120] }}
      gl={{ antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onPointerMissed={() => { select(null); selectB(null); }}
    >
      <Lighting shadowMap={q.shadowMap} />
      <LightsDriver />
      <Ground />
      <Sea seg={q.seaSegments} />
      <Roads />
      <Buildings />
      <Props />
      <Trees scale={q.treeScale} />
      <Boats />
      <Citizens />
      <Rain drops={q.rainDrops} />
      <CameraRig />
      <StatsProbe />
    </Canvas>
  );
}

export type { WorldState };
