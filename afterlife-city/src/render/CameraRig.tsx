import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { sim, useGame } from '../store/game';
import { cityData } from './buildings/data';
import { atmo } from './environment/Environment';
import { chooseShot, FOV, newDirector, poseFor, type DirectorState, type Shot } from './director';
import { registry } from './registry';

const MANUAL_RESUME_SECONDS = 25;

/** Keep the camera out of buildings: lift it over roofs instead of clipping through walls. */
export function avoidBuildings(p: THREE.Vector3): void {
  for (const b of cityData.boxes) {
    if (Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hd && p.y < b.h + 3.2) p.y = b.h + 3.4;
  }
  if (p.y < 1.3) p.y = 1.3;
}

export function CameraRig() {
  const { camera } = useThree();
  const controls = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const director = useRef<DirectorState>(newDirector());
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const shotStart = useRef(0);
  const userActive = useRef(false);
  const lastMode = useRef('auto');
  const focusSeen = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    camera.position.set(0, 95, 120);
    look.current.set(0, 0, 0);
    registry.camera = camera as THREE.PerspectiveCamera; registry.look = look.current;
    registry.controls = controls.current;
  }, [camera]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const g = useGame.getState();
    const now = clock.elapsedTime;
    let mode = g.cameraMode;
    if (mode === 'manual' && performance.now() / 1000 - registry.lastInteract > MANUAL_RESUME_SECONDS && !userActive.current) { g.setCameraMode('auto'); mode = 'auto'; }
    if (mode === 'manual') { lastMode.current = mode; return; }
    if (lastMode.current === 'manual') { director.current.current = null; look.current.copy(controls.current?.target ?? look.current); }
    lastMode.current = mode;

    const w = sim.world, d = director.current;
    const fc = g.focus;
    if (fc && fc.at !== focusSeen.current && w.buildings[fc.buildingId]) {
      focusSeen.current = fc.at;
      d.current = { kind: 'event', label: 'Event Shot', ttl: 14, locationId: fc.buildingId }; shotStart.current = now; g.setShotLabel('Event Shot');
    } else if (mode === 'follow' && g.spotlight && w.citizens[g.spotlight]) {
      if (d.current?.kind !== 'follow' || d.current.citizenId !== g.spotlight || d.current.ttl < 1e6) {
        d.current = { kind: 'follow', label: 'Character Follow', ttl: 1e9, citizenId: g.spotlight }; shotStart.current = now; g.setShotLabel('Character Follow');
      }
    } else if (!d.current || now - shotStart.current > d.current.ttl || d.current.ttl > 1e6) {
      const shot: Shot = chooseShot(w, d, g.spotlight);
      d.current = shot; shotStart.current = now; g.setShotLabel(shot.label);
    }
    const shot = d.current!;
    const t = now - shotStart.current;
    const pose = poseFor(w, shot, t, now, { sunAz: Math.atan2(atmo.sunDir.x, atmo.sunDir.z) });
    // ease the start of each shot, quicker for follow shots
    const k = 1 - Math.exp(-dt * (shot.kind === 'follow' ? 2.6 : shot.kind === 'aerial' ? 1.1 : 1.7));
    want.set(...pose.pos);
    if (shot.kind !== 'aerial') { // gentle handheld breathing
      want.x += Math.sin(now * 1.3) * 0.05; want.y += Math.sin(now * 1.9) * 0.04;
    }
    camera.position.lerp(want, k);
    avoidBuildings(camera.position);
    look.current.lerp(tmp.set(...pose.look), k * 1.4);
    camera.lookAt(look.current);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = FOV[shot.kind];
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 1.2)); cam.updateProjectionMatrix(); }
    if (controls.current) controls.current.target.copy(look.current);
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
