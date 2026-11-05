import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../../store/game';
import { dayOf } from '../../sim/clock';
import { isOutdoor } from '../../sim/paths';
import { cityData } from '../buildings/data';
import { animUniforms, characterGeometry, characterMaterial } from './character';

const CAP = 48;
const SKIN = ['#f1c9a5', '#e0ac82', '#c68b5f', '#8d5a3b'];
const HAIR = ['#2a211c', '#4a3426', '#7a5230', '#b88a4a', '#9a9aa0', '#a8442e'];
const TOP = ['#c8574b', '#d9a64a', '#5f8fb0', '#4f9a86', '#8a6bb0', '#e6dfd0', '#3f4a5c', '#c06f90', '#7a9f4c', '#cf8a3c'];
const BOTTOM = ['#2b3445', '#4a4036', '#6b7280', '#3a5a7a', '#1f2a24'];

interface RS { x: number; z: number; heading: number; phase: number; seat: string | null; visible: boolean; y: number }
/** Current rendered positions (read by the selection marker). */
export const renderPos = new Map<string, RS>();

const hash = (s: string) => { let h = 5; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function Citizens({ shadows }: { shadows: boolean }) {
  const body = useRef<THREE.InstancedMesh>(null!), hit = useRef<THREE.InstancedMesh>(null!), blob = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => {
    const g = characterGeometry();
    for (const [n, size] of [['iTop', 3], ['iBottom', 3], ['iSkin', 3], ['iHair', 3], ['iAnim', 4]] as const) g.setAttribute(n, new THREE.InstancedBufferAttribute(new Float32Array(CAP * size), size));
    return g;
  }, []);
  const mat = useMemo(characterMaterial, []);
  const hitGeo = useMemo(() => { const g = new THREE.CapsuleGeometry(0.55, 1.1, 2, 6); g.translate(0, 0.95, 0); return g; }, []);
  const blobGeo = useMemo(() => { const g = new THREE.PlaneGeometry(1.2, 1.2); g.rotateX(-Math.PI / 2); return g; }, []);
  const blobTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }, []);
  const store = useRef({ sig: '', list: [] as string[], seats: new Map<string, { x: number; z: number; heading: number }[]>(), seatVer: -1, taken: new Map<string, string>(), mine: new Map<string, string>() });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) }), []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); hitGeo.dispose(); blobGeo.dispose(); blobTex.dispose(); }, [geo, mat, hitGeo, blobGeo, blobTex]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1), t = clock.elapsedTime;
    animUniforms.uTime.value = t;
    const w = sim.world;
    const st = store.current;
    const list = Object.values(w.citizens).filter(c => c.movedOutAt === undefined).slice(0, CAP);

    // colours (only when the roster changes)
    const sig = list.map(c => c.id).join();
    if (sig !== st.sig) {
      st.sig = sig; st.list = list.map(c => c.id);
      const A = (n: string) => geo.getAttribute(n) as THREE.InstancedBufferAttribute;
      list.forEach((c, i) => {
        const L = c.look;
        const put = (n: string, hex: string) => { tmp.c.set(hex); A(n).setXYZ(i, tmp.c.r, tmp.c.g, tmp.c.b); };
        put('iSkin', SKIN[L.skin]); put('iHair', c.age > 62 ? HAIR[4] : HAIR[L.hair]); put('iTop', TOP[L.top]); put('iBottom', BOTTOM[L.bottom]);
      });
      for (const n of ['iSkin', 'iHair', 'iTop', 'iBottom']) (geo.getAttribute(n) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    // seat index by building (rebuilt when the city geometry changes)
    if (st.seatVer !== cityData.version) {
      st.seatVer = cityData.version; st.seats.clear(); st.taken.clear(); st.mine.clear();
      for (const a of cityData.anchors) if (a.kind === 'seat') { const arr = st.seats.get(a.buildingId) ?? []; arr.push({ x: a.x, z: a.z, heading: a.heading ?? 0 }); st.seats.set(a.buildingId, arr); }
    }
    const day = dayOf(w.time);
    const terraceOk = (w.env.weather === 'clear' || w.env.weather === 'cloudy') && w.env.temperature > 9 && w.env.daylight > 0.3;
    const anim = geo.getAttribute('iAnim') as THREE.InstancedBufferAttribute;
    const k = 1 - Math.exp(-dt * 6);
    const visiblePos: { x: number; z: number; talk: boolean; i: number }[] = [];

    list.forEach((c, i) => {
      let rs = renderPos.get(c.id);
      if (!rs) { rs = { x: c.x, z: c.z, heading: 0, phase: i, seat: null, visible: false, y: 0 }; renderPos.set(c.id, rs); }
      const b = w.buildings[c.currentLocation];
      const arrived = c.plan?.arrived === true;
      const indoors = !!b && !isOutdoor(b) && arrived;
      // --- sitting (visual only): benches outdoors, café terraces when the weather is kind
      const wantsSeat = arrived && b && (c.activity === 'rest' || c.activity === 'eat') &&
        (isOutdoor(b) || (terraceOk && (b.kind === 'cafe' || b.kind === 'restaurant') && hash(c.id + day) % 2 === 0));
      let seat: { x: number; z: number; heading: number } | null = null;
      if (wantsSeat) {
        const key = st.mine.get(c.id);
        const seats = st.seats.get(b!.id) ?? [];
        if (key && key.startsWith(b!.id + ':')) seat = seats[Number(key.split(':')[1])] ?? null;
        if (!seat) {
          for (let s = 0; s < seats.length; s++) { const sk = `${b!.id}:${s}`; if (!st.taken.has(sk)) { st.taken.set(sk, c.id); st.mine.set(c.id, sk); seat = seats[s]; break; } }
        }
      }
      if (!seat) { const key = st.mine.get(c.id); if (key) { st.taken.delete(key); st.mine.delete(c.id); } }

      const visible = !!seat || !indoors;
      let tx = c.x, tz = c.z;
      if (seat) { tx = seat.x; tz = seat.z; }
      else if (visible && b && isOutdoor(b) && (c.activity === 'stroll' || c.activity === 'hobby' || c.activity === 'shop')) {
        const ph = hash(c.id) * 0.37;
        tx += Math.sin(t * 0.18 + ph) * 2.2; tz += Math.cos(t * 0.15 + ph * 1.3) * 1.6; // idle wandering around the spot
      }
      if (!rs.visible && visible) { rs.x = tx; rs.z = tz; }  // appear in place (no glide from inside)
      rs.visible = visible;
      const dx = tx - rs.x, dz = tz - rs.z, dist = Math.hypot(dx, dz);
      if (dist > 30 || seat) { rs.x = seat && dist < 3 ? rs.x + dx * k : tx; rs.z = seat && dist < 3 ? rs.z + dz * k : tz; } else { rs.x += dx * k; rs.z += dz * k; }
      const moved = Math.hypot(tx - rs.x, tz - rs.z);
      const speed = visible ? (dist * k) / Math.max(dt, 1e-3) : 0;
      const walking = !seat && (speed > 0.35);
      let state = 0;
      if (seat) state = 2; else if (walking) state = 1; else if (c.activity === 'talk') state = 3;
      let target = rs.heading;
      if (seat) target = seat.heading; else if (walking) target = Math.atan2(dx, dz);
      rs.heading += angDiff(rs.heading, target) * (1 - Math.exp(-dt * (walking ? 9 : 4)));
      if (walking) rs.phase += (dist * k) * 3.1;
      void moved;
      visiblePos.push({ x: rs.x, z: rs.z, talk: state === 3, i });
      anim.setXYZW(i, state, rs.phase, Math.min(1, Math.max(0.3, speed / 6)), 0);
    });
    // talkers turn towards the nearest other visible person
    for (const a of visiblePos) {
      if (!a.talk) continue;
      let best = -1, bd = 36;
      for (const o of visiblePos) { if (o === a) continue; const d = (o.x - a.x) ** 2 + (o.z - a.z) ** 2; if (d < bd) { bd = d; best = o.i; } }
      if (best >= 0) { const o = visiblePos.find(v => v.i === best)!; const rs = renderPos.get(list[a.i].id)!; rs.heading += angDiff(rs.heading, Math.atan2(o.x - a.x, o.z - a.z)) * 0.12; }
    }
    // matrices
    list.forEach((c, i) => {
      const rs = renderPos.get(c.id)!;
      const sc = rs.visible ? 0.93 * c.look.height * (c.age > 65 ? 0.95 : 1) : 0;
      tmp.q.setFromAxisAngle(tmp.up, rs.heading);
      tmp.m.compose(tmp.p.set(rs.x, 0.1, rs.z), tmp.q, tmp.s.set(sc, sc, sc));
      body.current.setMatrixAt(i, tmp.m); hit.current.setMatrixAt(i, tmp.m);
      const bs = rs.visible ? 1 : 0;
      tmp.m.compose(tmp.p.set(rs.x, 0.16, rs.z), tmp.q.identity(), tmp.s.set(bs, bs, bs));
      blob.current.setMatrixAt(i, tmp.m);
    });
    body.current.count = hit.current.count = blob.current.count = list.length;
    body.current.instanceMatrix.needsUpdate = hit.current.instanceMatrix.needsUpdate = blob.current.instanceMatrix.needsUpdate = true;
    anim.needsUpdate = true;
  });

  const select = useGame(s => s.selectCitizen);
  return (
    <group>
      <instancedMesh ref={body} args={[geo, mat, CAP]} frustumCulled={false} castShadow={shadows && false} />
      <instancedMesh ref={hit} args={[hitGeo, undefined, CAP]} frustumCulled={false}
        onClick={e => { e.stopPropagation(); const id = store.current.list[e.instanceId ?? -1]; if (id) select(id); }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={blob} args={[blobGeo, undefined, CAP]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial map={blobTex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </instancedMesh>
      <Marker />
    </group>
  );
}

function Marker() {
  const selected = useGame(s => s.selectedCitizen), spot = useGame(s => s.spotlight);
  const ring = useRef<THREE.Mesh>(null!), label = useRef<THREE.Group>(null!);
  const id = selected ?? spot;
  useFrame(() => {
    const rs = id ? renderPos.get(id) : null;
    const on = !!rs && rs.visible;
    ring.current.visible = on;
    if (on) { ring.current.position.set(rs!.x, 0.3, rs!.z); label.current.position.set(rs!.x, 2.6, rs!.z); }
  });
  const name = id ? sim.world.citizens[id]?.name : '';
  return (
    <>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}><ringGeometry args={[0.7, 0.92, 28]} /><meshBasicMaterial color={selected ? '#ffd36b' : '#ff9ec3'} depthTest={false} transparent opacity={0.9} /></mesh>
      <group ref={label}>{id && <Html center distanceFactor={26} zIndexRange={[10, 0]}><div className="pointer-events-none whitespace-nowrap rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">{name}</div></Html>}</group>
    </>
  );
}
