import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../../store/game';
import { hourOf } from '../../sim/clock';
import { registry } from '../registry';
import { computeAtmosphere, createAtmosphere, WEATHER_TARGET, type WeatherLook } from './atmosphere';

/** Shared, per-frame atmosphere. Written by <AtmosphereDriver/>, read by sky / sea / lights. */
export const atmo = createAtmosphere();
const look: WeatherLook = { ...WEATHER_TARGET.clear };

/** Must be mounted before the other environment parts so they see this frame's values. */
export function AtmosphereDriver() {
  useFrame((_, dt) => {
    const w = sim.world;
    const t = WEATHER_TARGET[w.env.weather];
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 0.35); // weather blends over ~3-5 s
    look.grey += (t.grey - look.grey) * k; look.cover += (t.cover - look.cover) * k; look.fog += (t.fog - look.fog) * k;
    computeAtmosphere(atmo, hourOf(w.time), w.env.season, look);
  });
  return null;
}

// ------------------------------------------------------------------ lights
export function Lighting({ shadowMap, shadows, range }: { shadowMap: number; shadows: boolean; range: number }) {
  const { scene, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    scene.fog = new THREE.FogExp2('#d3e2e0', 0.003);
    scene.add(target);
    sun.current.target = target;
    return () => { scene.remove(target); };
  }, [scene, target]);

  useFrame(() => {
    const a = atmo;
    // shadows follow what the camera looks at: sharp near the action, long when the sun is low
    const l = registry.look;
    const tx = l ? Math.round(l.x) : 0, tz = l ? Math.round(l.z) : 0;
    target.position.set(tx, 0, tz);
    sun.current.position.set(tx + a.sunDir.x * 220, a.sunDir.y * 220, tz + a.sunDir.z * 220);
    sun.current.color.copy(a.sunColor);
    sun.current.intensity = a.sunIntensity;
    sun.current.castShadow = shadows && a.sunIntensity > 0.05;
    moon.current.position.set(tx - 80, 120, tz - 40);
    moon.current.intensity = a.moonIntensity;
    hemi.current.color.copy(a.hemiSky); hemi.current.groundColor.copy(a.hemiGround); hemi.current.intensity = a.hemiIntensity;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(a.fogColor); fog.density = a.fogDensity;
    gl.toneMappingExposure = a.exposure;
    scene.background = a.fogColor;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe6ff', '#6e6a45', 0.8]} />
      <directionalLight
        ref={sun} castShadow={shadows} shadow-mapSize={[shadowMap, shadowMap]}
        shadow-camera-left={-range} shadow-camera-right={range} shadow-camera-top={range} shadow-camera-bottom={-range}
        shadow-camera-near={20} shadow-camera-far={520} shadow-bias={-0.0004} shadow-normalBias={0.35}
      />
      <directionalLight ref={moon} color="#8fa6d8" />
    </>
  );
}

// ------------------------------------------------------------------ sky
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uSunDir, uSunColor, uCloudLit, uCloudShade;
uniform float uNight, uCover, uTime, uSunGlow;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.16 + pow(sd, 50.0) * 0.3 + pow(sd, 900.0) * 1.6) * uSunGlow;
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.28) * 1.5 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv);
    float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n);
    vec2 sdir = normalize(uSunDir.xz + 1e-4);
    float lit = clamp(0.5 + dot(normalize(d.xz + 1e-4), sdir) * 0.5, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit * (0.55 + 0.45 * (1.0 - n)));
    col = mix(col, cc, c * 0.88 * smoothstep(0.01, 0.16, d.y));
  }
  if (uNight > 0.02 && d.y > 0.0) {
    vec2 g = floor(d.xz / (d.y + 0.35) * 70.0);
    float s = step(0.997, hash(g));
    col += vec3(s) * uNight * (1.0 - uCover) * smoothstep(0.04, 0.3, d.y);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function SkyDome() {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uNight: { value: 0 }, uCover: { value: 0.3 }, uTime: { value: 0 }, uSunGlow: { value: 1 },
    },
  }), []);
  useFrame(({ camera, clock }) => {
    mesh.current.position.copy(camera.position);
    const u = mat.uniforms;
    u.uTop.value.copy(atmo.skyTop); u.uHorizon.value.copy(atmo.skyHorizon); u.uSunDir.value.copy(atmo.sunDir);
    u.uSunColor.value.copy(atmo.sunColor); u.uCloudLit.value.copy(atmo.cloudLit); u.uCloudShade.value.copy(atmo.cloudShade);
    u.uNight.value = atmo.night; u.uCover.value = atmo.cover; u.uTime.value = clock.elapsedTime; u.uSunGlow.value = atmo.sunGlow;
  });
  return <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[480, 32, 16]} /></mesh>;
}

// ------------------------------------------------------------------ sea (all wave maths on the GPU)
const SEA_VERT = /* glsl */ `
uniform float uTime, uAmp;
varying vec3 vWorld; varying vec3 vN;
vec3 waves(vec2 p, out vec3 grad) {
  vec2 d1 = normalize(vec2(1.0, 0.35)), d2 = normalize(vec2(-0.4, 1.0)), d3 = normalize(vec2(0.8, -0.9));
  float p1 = dot(p, d1) * 0.11 + uTime * 0.9, p2 = dot(p, d2) * 0.17 + uTime * 0.75, p3 = dot(p, d3) * 0.31 + uTime * 1.3;
  float h = sin(p1) * 0.5 + sin(p2) * 0.38 + sin(p3) * 0.14;
  vec2 g = d1 * cos(p1) * 0.5 * 0.11 + d2 * cos(p2) * 0.38 * 0.17 + d3 * cos(p3) * 0.14 * 0.31;
  grad = vec3(g.x, 0.0, g.y) * uAmp;
  return vec3(0.0, h * uAmp, 0.0);
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 grad; vec3 off = waves(w.xz, grad);
  w.y += off.y; vWorld = w.xyz; vN = normalize(vec3(-grad.x, 1.0, -grad.z));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FRAG = /* glsl */ `
uniform vec3 uDeep, uShallow, uTop, uHorizon, uSunDir, uSunColor, uFogColor;
uniform float uTime, uFogDensity, uSunGlow;
varying vec3 vWorld; varying vec3 vN;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 q = vWorld.xz;
  vec3 N = normalize(vN + vec3(sin(q.x * 0.9 + uTime * 1.7) * 0.03 + sin(q.y * 1.3 - uTime * 1.1) * 0.025, 0.0, cos(q.x * 1.1 - uTime * 1.3) * 0.03 + cos(q.y * 0.8 + uTime * 1.5) * 0.025));
  float fres = 0.04 + 0.92 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float sd = max(dot(R, uSunDir), 0.0);
  vec3 sun = uSunColor * (pow(sd, 500.0) * 3.5 + pow(sd, 40.0) * 0.45 + pow(sd, 6.0) * 0.12) * uSunGlow;
  float shore = 1.0 - smoothstep(52.0, 82.0, vWorld.z);
  vec3 body = mix(uDeep, uShallow, shore * 0.8);
  vec3 col = mix(body, sky, fres) + sun;
  float foam = smoothstep(0.55, 0.0, vWorld.z - 52.0 - sin(vWorld.x * 0.4 + uTime * 0.8) * 0.8 - 0.4);
  col = mix(col, vec3(0.93, 0.92, 0.86) * (0.35 + 0.65 * uSunGlow), foam * 0.45 * step(52.0, vWorld.z) * (1.0 - step(54.0, vWorld.z)));
  float dist = length(cameraPosition - vWorld);
  col = mix(col, uFogColor, 1.0 - exp(-uFogDensity * uFogDensity * dist * dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Sea({ seg }: { seg: [number, number] }) {
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(420, 170, seg[0], seg[1]); g.rotateX(-Math.PI / 2); return g; }, [seg]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: 0.5 }, uFogDensity: { value: 0.003 }, uSunGlow: { value: 1 },
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() },
    },
  }), []);
  useFrame(({ clock }) => {
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime; u.uAmp.value = 0.25 + sim.world.env.sea * 1.1;
    u.uDeep.value.copy(atmo.seaDeep); u.uShallow.value.copy(atmo.seaShallow);
    u.uTop.value.copy(atmo.skyTop); u.uHorizon.value.copy(atmo.skyHorizon);
    u.uSunDir.value.copy(atmo.sunDir); u.uSunColor.value.copy(atmo.sunColor); u.uSunGlow.value = atmo.sunGlow;
    u.uFogColor.value.copy(atmo.fogColor); u.uFogDensity.value = atmo.fogDensity;
  });
  return <mesh geometry={geo} material={mat} position={[0, -0.25, 137]} frustumCulled={false} />;
}

// ------------------------------------------------------------------ lamp light pools (1 draw call)
export function LampPools() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const nodes = useMemo(() => Object.values(sim.world.nodes), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    nodes.forEach((n, i) => { m.makeTranslation(n.x + 2.3, 0.14, n.z + 2.3); ref.current.setMatrixAt(i, m); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [nodes]);
  useFrame(() => {
    const on = sim.world.env.lightsOn ? Math.min(1, 0.25 + atmo.night * 0.9) : 0;
    mat.current.opacity += (on * 0.55 - mat.current.opacity) * 0.05;
    ref.current.visible = mat.current.opacity > 0.01;
  });
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(16, 16); g.rotateX(-Math.PI / 2); return g; }, []);
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, nodes.length]} frustumCulled={false}>
      <meshBasicMaterial ref={mat} map={tex} color="#ffb25e" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
    </instancedMesh>
  );
}
