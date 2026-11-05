import { useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGame } from '../store/game';
import { QUALITY, type QualityTier } from './quality';
import { registry } from './registry';
import { Buildings } from './buildings/Buildings';
import { AtmosphereDriver, LampPools, Lighting, Sea, SkyDome } from './environment/Environment';
import { Terrain } from './world/Terrain';
import { Vegetation } from './world/Vegetation';
import { Boats } from './world/Boats';
import { Weather } from './world/Weather';
import { Citizens } from './citizens/Citizens';
import { CameraRig } from './CameraRig';

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
      camera={{ fov: 42, near: 0.5, far: 700, position: [0, 95, 120] }}
      gl={{ antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onPointerMissed={() => { select(null); selectB(null); }}
    >
      <AtmosphereDriver />
      <SkyDome />
      <Lighting shadowMap={q.shadowMap} shadows={q.shadows} range={q.shadowRange} />
      <LampPools />
      <Terrain />
      <Sea seg={q.seaSegments} />
      <Buildings />
      <Vegetation scale={q.treeScale} bushes={tier !== 'low'} detail={q.treeDetail} />
      <Boats />
      <Citizens shadows={q.shadows} />
      <Weather drops={q.rainDrops} drift={q.driftParticles} />
      <CameraRig />
      <StatsProbe />
    </Canvas>
  );
}
