import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim, useGame } from '../../store/game';
import { hourOf } from '../../sim/clock';
import { interp } from '../interp';

function boatGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, string][] = [];
  const hull = new THREE.BoxGeometry(2.2, 0.9, 6); hull.translate(0, 0.35, 0);
  const bow = new THREE.ConeGeometry(1.1, 1.6, 4); bow.rotateX(Math.PI / 2); bow.rotateY(Math.PI / 4); bow.scale(1, 0.55, 1); bow.translate(0, 0.35, 3.7);
  const cabin = new THREE.BoxGeometry(1.6, 1.2, 1.8); cabin.translate(0, 1.4, -0.8);
  const roof = new THREE.BoxGeometry(1.9, 0.14, 2.1); roof.translate(0, 2.06, -0.8);
  const mast = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 5); mast.translate(0, 2.4, 1.2);
  const stripe = new THREE.BoxGeometry(2.24, 0.16, 6.04); stripe.translate(0, 0.62, 0);
  parts.push([hull, '#ffffff'], [bow, '#ffffff'], [cabin, '#efe6d4'], [roof, '#4a5560'], [mast, '#5a4636'], [stripe, '#e9e2cf']);
  let total = 0; const gs = parts.map(([g, c]) => { const n = g.toNonIndexed(); total += n.attributes.position.count; return [n, c] as const; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
  for (const [g, c] of gs) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3); nor.set(g.attributes.normal.array as Float32Array, o * 3);
    const cc = new THREE.Color(c); for (let i = 0; i < g.attributes.position.count; i++) col.set([cc.r, cc.g, cc.b], (o + i) * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const SPOTS: { x: number; z: number; yaw: number; drift: number; tint: string }[] = [
  { x: -61, z: 62, yaw: -0.3, drift: 0, tint: '#c7503c' }, { x: -43, z: 60, yaw: 0.4, drift: 0, tint: '#4f7c9a' }, { x: -25, z: 66, yaw: -0.2, drift: 0, tint: '#e0b24a' },
  { x: -8, z: 78, yaw: 1.2, drift: 12, tint: '#c7503c' }, { x: 40, z: 85, yaw: -1.2, drift: 16, tint: '#4f7c9a' }, { x: 12, z: 96, yaw: 0.7, drift: 20, tint: '#e9e2cf' },
];

/** One instanced draw for the whole fleet; boats bob with the real sea state. */
export function Boats() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(boatGeometry, []);
  useEffect(() => { SPOTS.forEach((s, i) => ref.current.setColorAt(i, new THREE.Color(s.tint))); ref.current.instanceColor!.needsUpdate = true; }, []);
  const m = useMemo(() => new THREE.Matrix4(), []), q = useMemo(() => new THREE.Quaternion(), []), e = useMemo(() => new THREE.Euler(), []);
  const trip = useRef(SPOTS.map(() => 0)); // 0 = moored, 1 = at the fishing ground
  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime, w = sim.world, sea = w.env.sea;
    const dt = Math.min(dtRaw, 0.1) * useGame.getState().speed;        // sim minutes this frame
    const h = hourOf(w.time + interp.frac);
    // the harbour's boats head out when the fishermen are at work, and are back by mid-afternoon
    const crewOut = Object.values(w.citizens).some(c => c.workplaceId === 'b_fishery' && c.activity === 'work' && c.movedOutAt === undefined);
    const wantOut = crewOut && h > 5 && h < 13.2 && w.env.weather !== 'fog';
    SPOTS.forEach((s, i) => {
      let x = s.x + Math.sin(t * 0.05 + i) * s.drift, z = s.z, yaw = s.yaw + (s.drift ? Math.cos(t * 0.05 + i) * 0.05 : 0);
      if (i < 3) {
        const target = wantOut ? 1 : 0;
        const prev = trip.current[i];
        trip.current[i] = THREE.MathUtils.clamp(prev + Math.sign(target - prev) * dt / (55 + i * 12), 0, 1);
        const p = THREE.MathUtils.smoothstep(trip.current[i], 0, 1);
        // out through the harbour mouth to the fishing ground, then hold position (drifting a little)
        const gx = -70 + i * 26 + Math.sin(t * 0.03 + i) * 4, gz = 150 + i * 18;
        const mx = s.x, mz = 80;
        x = p < 0.3 ? s.x : p < 0.55 ? THREE.MathUtils.lerp(s.x, mx, (p - 0.3) / 0.25) : THREE.MathUtils.lerp(mx, gx, (p - 0.55) / 0.45);
        z = p < 0.3 ? THREE.MathUtils.lerp(s.z, mz - 8, p / 0.3) : p < 0.55 ? THREE.MathUtils.lerp(mz - 8, mz, (p - 0.3) / 0.25) : THREE.MathUtils.lerp(mz, gz, (p - 0.55) / 0.45);
        const moving = Math.abs(trip.current[i] - prev) > 1e-6;
        if (moving) yaw = (target > prev ? 0 : Math.PI) + (p > 0.55 ? Math.atan2(gx - mx, gz - mz) * (target > prev ? 1 : -1) : 0);
        else if (p > 0.95) yaw = s.yaw + 0.6;
      }
      const y = Math.sin(t * 0.8 + i) * 0.2 + 0.05 + sea * Math.sin(t * 1.3 + i) * 0.3;
      e.set(Math.sin(t * 0.9 + i) * 0.03 * (1 + sea * 2), yaw, Math.sin(t * 0.7 + i) * 0.05 * (1 + sea * 2));
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, undefined, SPOTS.length]} castShadow frustumCulled={false}><meshStandardMaterial vertexColors roughness={0.7} /></instancedMesh>;
}
