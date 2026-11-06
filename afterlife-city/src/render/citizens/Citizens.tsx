import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../../store/game';
import { dayOf } from '../../sim/clock';
import { isOutdoor, WALK_SPEED } from '../../sim/paths';
import { doorPoint } from '../../sim/doors';
import { cityData } from '../buildings/data';
import { interp } from '../interp';
import { animUniforms, characterGeometry, characterMaterial } from './character';

const CAP = 48;
const SKIN = ['#efc9a6', '#dcae86', '#c18c63', '#8d5d3f'];
const HAIR = ['#2a211c', '#4a3426', '#6f4e33', '#a8844e', '#9a9aa0', '#8f4430'];
const TOP = ['#a95a4c', '#c79a52', '#5f8296', '#5b8a78', '#7d6a92', '#e2dacb', '#3f4a5c', '#a87482', '#7b8f52', '#b98144'];
const BOTTOM = ['#2f3644', '#4a4036', '#68707a', '#3e566e', '#2a3229'];

interface RS {
  x: number; z: number; heading: number; phase: number; visible: boolean;
  ox: number; oz: number;            // separation offset (so people do not walk through each other)
  leaving: { x: number; z: number } | null; // walking back to a door before disappearing inside
}
/** Current rendered positions (read by the selection marker and the follow camera). */
export const renderPos = new Map<string, RS>();

const hash = (s: string) => { let h = 5; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function Citizens() {
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
  const store = useRef({
    sig: '', list: [] as string[], seatVer: -1,
    seats: new Map<string, { x: number; z: number; heading: number }[]>(), allSeats: [] as { x: number; z: number }[],
    taken: new Map<string, string>(), mine: new Map<string, string>(),
  });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) }), []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); hitGeo.dispose(); blobGeo.dispose(); blobTex.dispose(); }, [geo, mat, hitGeo, blobGeo, blobTex]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    animUniforms.uTime.value = clock.elapsedTime;
    const w = sim.world, st = store.current;
    const gameSpeed = useGame.getState().speed;
    const simT = w.time + interp.frac;                     // sim minutes, frozen while paused
    const list = Object.values(w.citizens).filter(c => c.movedOutAt === undefined).slice(0, CAP);

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
    if (st.seatVer !== cityData.version) {
      st.seatVer = cityData.version; st.seats.clear(); st.taken.clear(); st.mine.clear(); st.allSeats = [];
      for (const a of cityData.anchors) if (a.kind === 'seat') {
        const arr = st.seats.get(a.buildingId) ?? []; arr.push({ x: a.x, z: a.z, heading: a.heading ?? 0 }); st.seats.set(a.buildingId, arr);
        st.allSeats.push({ x: a.x, z: a.z });
      }
    }
    const day = dayOf(w.time);
    const terraceOk = (w.env.weather === 'clear' || w.env.weather === 'cloudy') && w.env.temperature > 9 && w.env.daylight > 0.3;
    const raining = w.env.weather === 'rain';
    const anim = geo.getAttribute('iAnim') as THREE.InstancedBufferAttribute;
    // pace: the sim's walking speed at the current game speed; tracking may run a little faster to keep up
    const walkPace = WALK_SPEED * Math.max(gameSpeed, 0);
    const trackPace = walkPace * 1.6;

    const states: { x: number; z: number; walking: boolean; state: number; i: number }[] = [];
    list.forEach((c, i) => {
      let rs = renderPos.get(c.id);
      if (!rs) { rs = { x: c.x, z: c.z, heading: 0, phase: i, visible: false, ox: 0, oz: 0, leaving: null }; renderPos.set(c.id, rs); }
      const b = w.buildings[c.currentLocation];
      const arrived = c.plan?.arrived === true;
      const indoors = !!b && !isOutdoor(b) && arrived;

      // interpolated sim position (skip interpolation across teleports such as stepping out of a door)
      let sx = c.x, sz = c.z;
      const pv = interp.prev.get(c.id);
      if (pv && (c.x - pv.x) ** 2 + (c.z - pv.z) ** 2 < 36) { sx = pv.x + (c.x - pv.x) * interp.frac; sz = pv.z + (c.z - pv.z) * interp.frac; }

      // seats: benches outdoors, café terraces in fine weather (visual only; the sim keeps them indoors)
      const wantsSeat = arrived && b && (c.activity === 'rest' || c.activity === 'eat') &&
        (isOutdoor(b) || (terraceOk && (b.kind === 'cafe' || b.kind === 'restaurant') && hash(c.id + day) % 2 === 0));
      let seat: { x: number; z: number; heading: number } | null = null;
      if (wantsSeat) {
        const seats = st.seats.get(b!.id) ?? [];
        const key = st.mine.get(c.id);
        if (key && key.startsWith(b!.id + ':')) seat = seats[Number(key.split(':')[1])] ?? null;
        if (!seat) for (let s = 0; s < seats.length; s++) { const sk = `${b!.id}:${s}`; if (!st.taken.has(sk)) { st.taken.set(sk, c.id); st.mine.set(c.id, sk); seat = seats[s]; break; } }
      }
      if (!seat) { const key = st.mine.get(c.id); if (key) { st.taken.delete(key); st.mine.delete(c.id); if (indoors && rs.visible) rs.leaving = doorPoint(b!, w); } }

      let visible = !!seat || !indoors || !!rs.leaving;
      let tx = sx, tz = sz, pace = trackPace;
      if (seat) { tx = seat.x; tz = seat.z; pace = walkPace; rs.leaving = null; }
      else if (rs.leaving) { tx = rs.leaving.x; tz = rs.leaving.z; pace = walkPace; }
      else if (!indoors && b && isOutdoor(b) && arrived && (c.activity === 'stroll' || c.activity === 'hobby' || c.activity === 'shop')) {
        // slow wander around the chosen spot, kept inside the area and off the benches
        const ph = hash(c.id) * 0.37;
        tx += Math.sin(simT * 0.12 + ph) * 1.8; tz += Math.cos(simT * 0.1 + ph * 1.3) * 1.3;
        if (b.kind !== 'lookout') { tx = Math.max(b.x - b.w / 2 + 0.8, Math.min(b.x + b.w / 2 - 0.8, tx)); tz = Math.max(b.z - b.d / 2 + 0.6, Math.min(b.z + b.d / 2 - 0.6, tz)); }
        // do not wander into a neighbouring building
        if (cityData.boxes.some(o => Math.abs(tx - o.x) < o.hw - 1.1 && Math.abs(tz - o.z) < o.hd - 1.1)) { tx = sx; tz = sz; }
        pace = walkPace;
      }
      if (!seat) for (const s of st.allSeats) { const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz); if (d < 0.75 && d > 1e-3) { tx = s.x + (dx / d) * 0.75; tz = s.z + (dz / d) * 0.75; } }

      if (!rs.visible && visible) {
        // appear where it makes sense: at the door when coming out to a terrace seat, else in place
        const start = seat && indoors && b ? doorPoint(b, w) : { x: tx, z: tz };
        rs.x = start.x; rs.z = start.z; rs.ox = 0; rs.oz = 0;
      }
      const dx = tx - rs.x, dz = tz - rs.z, dist = Math.hypot(dx, dz);
      let moved = 0;
      if (dist > 25) { rs.x = tx; rs.z = tz; }              // only after loading / long catch-up
      else if (dist > 1e-4) { moved = Math.min(dist, pace * dt); rs.x += (dx / dist) * moved; rs.z += (dz / dist) * moved; }
      if (rs.leaving && Math.hypot(rs.leaving.x - rs.x, rs.leaving.z - rs.z) < 0.2) { rs.leaving = null; visible = indoors ? false : visible; }
      rs.visible = visible;
      const speed = moved / Math.max(dt, 1e-3);
      const walking = speed > 0.25;
      let state = 0;
      if (seat && dist < 0.08) state = 2; else if (walking) state = 1; else if (c.activity === 'talk') state = 3;
      let target = rs.heading;
      if (state === 2) target = seat!.heading; else if (walking) target = Math.atan2(dx, dz);
      rs.heading += angDiff(rs.heading, target) * (1 - Math.exp(-dt * (walking ? 8 : 4)));
      if (walking) rs.phase += moved * 4.4;
      states.push({ x: rs.x, z: rs.z, walking, state, i });
      anim.setXYZW(i, state, rs.phase, Math.min(1, Math.max(0.35, speed / Math.max(WALK_SPEED, 0.1))), raining && visible && state !== 2 && !(b && !isOutdoor(b) && arrived && !seat) ? 1 : 0);
    });

    // keep people from overlapping: push pairs apart, and let talkers face each other
    for (let a = 0; a < states.length; a++) {
      const A = states[a]; const ra = renderPos.get(list[A.i].id)!;
      if (!ra.visible) continue;
      let px = 0, pz = 0, best = -1, bd = 36;
      for (let b2 = 0; b2 < states.length; b2++) {
        if (a === b2) continue; const Bs = states[b2]; const rb = renderPos.get(list[Bs.i].id)!; if (!rb.visible) continue;
        const ddx = A.x - Bs.x, ddz = A.z - Bs.z, d2 = ddx * ddx + ddz * ddz;
        if (d2 < 0.42 && A.state !== 2) { const d = Math.sqrt(d2) || 0.01; px += (ddx / d) * (0.65 - d); pz += (ddz / d) * (0.65 - d); }
        if (A.state === 3 && d2 < bd) { bd = d2; best = b2; }
      }
      const k = 1 - Math.exp(-dt * 5);
      ra.ox += (Math.max(-0.6, Math.min(0.6, px)) - ra.ox) * k; ra.oz += (Math.max(-0.6, Math.min(0.6, pz)) - ra.oz) * k;
      if (best >= 0) { const o = states[best]; ra.heading += angDiff(ra.heading, Math.atan2(o.x - A.x, o.z - A.z)) * 0.1; }
    }

    list.forEach((c, i) => {
      const rs = renderPos.get(c.id)!;
      const sc = rs.visible ? 0.93 * c.look.height * (c.age > 65 ? 0.95 : 1) : 0;
      const x = rs.x + rs.ox, z = rs.z + rs.oz;
      tmp.q.setFromAxisAngle(tmp.up, rs.heading);
      tmp.m.compose(tmp.p.set(x, 0.12, z), tmp.q, tmp.s.set(sc, sc, sc));
      body.current.setMatrixAt(i, tmp.m); hit.current.setMatrixAt(i, tmp.m);
      const bs = rs.visible ? 1 : 0;
      tmp.m.compose(tmp.p.set(x, 0.17, z), tmp.q.identity(), tmp.s.set(bs, bs, bs));
      blob.current.setMatrixAt(i, tmp.m);
    });
    body.current.count = hit.current.count = blob.current.count = list.length;
    body.current.instanceMatrix.needsUpdate = hit.current.instanceMatrix.needsUpdate = blob.current.instanceMatrix.needsUpdate = true;
    anim.needsUpdate = true;
  });

  const select = useGame(s => s.selectCitizen);
  return (
    <group>
      <instancedMesh ref={body} args={[geo, mat, CAP]} frustumCulled={false} />
      <instancedMesh ref={hit} args={[hitGeo, undefined, CAP]} frustumCulled={false}
        onClick={e => { e.stopPropagation(); const id = store.current.list[e.instanceId ?? -1]; if (id) select(id); }}>
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
    if (on) { ring.current.position.set(rs!.x + rs!.ox, 0.3, rs!.z + rs!.oz); label.current.position.set(rs!.x + rs!.ox, 2.6, rs!.z + rs!.oz); }
  });
  const name = id ? sim.world.citizens[id]?.name : '';
  return (
    <>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}><ringGeometry args={[0.7, 0.82, 4, 1, Math.PI / 4]} /><meshBasicMaterial color="#e8dcc0" depthTest={false} transparent opacity={0.85} /></mesh>
      <group ref={label}>{id && <Html center distanceFactor={26} zIndexRange={[10, 0]}><div className="hud-label">{name}</div></Html>}</group>
    </>
  );
}
