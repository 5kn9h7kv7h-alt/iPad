// Decorative vehicles (CC0 models by Quaternius): parked cars, a bus that loops the town on a timetable and
// stops for anyone in front of it, and sailboats out on the bay. Visual only: the simulation knows nothing of them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { sim, useGame } from '../../store/game';
import { minuteOfDay } from '../../sim/clock';
import { interp } from '../interp';
import { renderPos } from '../citizens/Citizens';
import { alongBus, BUS, busPath, busScheduled, parkedCars, ROAD_Y, type VName } from './vehicleLayout';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const NAMES: VName[] = ['car_a', 'car_b', 'car_c', 'taxi', 'bus', 'sailboat', 'sailship'];
const LEN: Record<VName, number> = { car_a: 3.5, car_b: 3.4, car_c: 3.5, taxi: 3.5, bus: BUS.len, sailboat: 7, sailship: 16 };
/** widths are capped so the cartoon-wide originals fit the narrow streets */
const WID: Partial<Record<VName, number>> = { car_a: 1.6, car_b: 1.6, car_c: 1.6, taxi: 1.6, bus: BUS.width };
const FLIP: Partial<Record<VName, boolean>> = {};

/** meshopt-quantized attributes are normalized integers: expand to floats before baking transforms into them. */
function floatCopy(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) {
    const a = src.getAttribute(k), f = new Float32Array(a.count * a.itemSize), get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = get[c].call(a, i);
    geo.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  if (src.index) geo.setIndex(src.index.clone());
  return geo;
}

/** Loads a model and bakes a transform: on y=0, centred, nose towards +z, at the target length. */
async function loadGeometry(name: VName): Promise<THREE.BufferGeometry> {
  const g = await loader.loadAsync(new URL(`assets/vehicles/${name}.glb`, document.baseURI).href);
  let out: THREE.BufferGeometry | null = null;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !out) { out = floatCopy(m.geometry); out.applyMatrix4(m.matrixWorld); } });
  const geo = out! as THREE.BufferGeometry;
  geo.computeBoundingBox();
  let b = geo.boundingBox!;
  if (b.max.x - b.min.x > b.max.z - b.min.z) geo.rotateY(Math.PI / 2);
  if (FLIP[name]) geo.rotateY(Math.PI);
  geo.computeBoundingBox(); b = geo.boundingBox!;
  const k = LEN[name] / (b.max.z - b.min.z), kw = Math.min(k, (WID[name] ?? Infinity) / (b.max.x - b.min.x));
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.scale(kw, (k + kw) / 2, k);
  geo.computeVertexNormals();
  return geo;
}

export function Vehicles({ shadows }: { shadows: boolean }) {
  const [geos, setGeos] = useState<Partial<Record<VName, THREE.BufferGeometry>>>({});
  useEffect(() => {
    let live = true;
    Promise.all(NAMES.map(async n => [n, await loadGeometry(n)] as const))
      .then(list => { if (live) setGeos(Object.fromEntries(list)); })
      .catch(e => console.warn('vehicles unavailable', e));
    return () => { live = false; };
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }), []);
  const parked = useMemo(() => parkedCars(sim.world), []);
  const path = useMemo(() => busPath(sim.world), []);
  const bus = useRef<THREE.Mesh>(null);
  const st = useRef({ d: 0, yaw: 0, init: false }); // d: distance travelled from the stop on this run
  const boats = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }, dtRaw) => {
    const w = sim.world, g = useGame.getState();
    const dt = Math.min(dtRaw, 0.1) * g.speed; // sim minutes this frame
    const s = st.current;
    if (bus.current) {
      const target = busScheduled(minuteOfDay(w.time + interp.frac), path.total);
      if (!s.init || Math.abs(target - s.d) > 80 || (target < s.d && s.d > path.total - 1)) s.d = target; // new run, or time jumped
      else if (target > s.d && dt > 0) {
        const here = alongBus(path, path.stopS + s.d), fx = Math.sin(here.yaw), fz = Math.cos(here.yaw);
        let blocked = false; // wait for anyone in front of the bus
        for (const r of renderPos.values()) {
          if (!r.visible) continue;
          const dx = r.x - here.x, dz = r.z - here.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          if (ahead > 3 && ahead < 10 && side < 2.4) { blocked = true; break; }
        }
        if (!blocked) s.d = Math.min(target, s.d + BUS.speed * 1.5 * dt); // catches up a little after waiting
      }
      const p = alongBus(path, path.stopS + s.d);
      if (!s.init) { s.yaw = p.yaw; s.init = true; }
      let d = p.yaw - s.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      s.yaw += d * Math.min(1, dt * 1.6);
      bus.current.position.set(p.x, ROAD_Y, p.z);
      bus.current.rotation.y = s.yaw;
    }
    // sailboats cross the bay slowly
    const t = clock.elapsedTime;
    boats.current.forEach((b, i) => {
      if (!b) return;
      const k = ((w.time + interp.frac) * (0.5 + i * 0.12) + i * 210) % 560;
      b.position.set(-280 + k, Math.sin(t * 0.8 + i) * 0.12, 120 + i * 42);
      b.rotation.set(Math.sin(t * 0.7 + i) * 0.03, Math.PI / 2, Math.sin(t * 0.9 + i) * 0.05);
    });
  });

  return (
    <group>
      {parked.map((p, i) => geos[p.model] && <mesh key={i} geometry={geos[p.model]} material={mat} position={[p.x, ROAD_Y, p.z]} rotation-y={p.yaw} castShadow={shadows} receiveShadow />)}
      {geos.bus && <mesh ref={bus} geometry={geos.bus} material={mat} castShadow={shadows} receiveShadow />}
      {geos.sailboat && [0, 1].map(i => <mesh key={'sb' + i} ref={el => { boats.current[i] = el; }} geometry={geos.sailboat} material={mat} />)}
      {geos.sailship && <mesh ref={el => { boats.current[2] = el; }} geometry={geos.sailship} material={mat} />}
    </group>
  );
}
