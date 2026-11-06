import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../../store/game';

// All precipitation motion lives in the vertex shader: zero per-frame CPU work per drop.
const BOX = { x: 220, y: 60, z: 170, cx: 0, cz: 5 };
const smooth = { rain: 0, snow: 0, petals: 0, leaves: 0 };

function rand(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

const RAIN_V = /* glsl */ `
uniform float uTime, uAmt; attribute float aTip; attribute vec3 aSeed; varying float vA;
void main() {
  float y = mod(aSeed.y - uTime * 38.0, ${BOX.y.toFixed(1)});
  vec3 p = vec3(aSeed.x, y, aSeed.z) + vec3(0.0, -aTip * 1.4, 0.0) + vec3(-aTip * 0.12, 0.0, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = uAmt * (0.25 + 0.2 * aTip) * smoothstep(260.0, 40.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const RAIN_F = /* glsl */ `varying float vA; void main() { gl_FragColor = vec4(0.74, 0.83, 0.92, vA); }`;

const FLAKE_V = /* glsl */ `
uniform float uTime, uAmt, uSize, uFall, uWind; attribute vec3 aSeed; varying float vA;
void main() {
  float y = mod(aSeed.y - uTime * uFall, ${BOX.y.toFixed(1)});
  float sx = sin(uTime * 0.7 + aSeed.x) * 1.4 + uTime * uWind * 1.5;
  float x = mod(aSeed.x + sx + ${(BOX.x / 2).toFixed(1)}, ${BOX.x.toFixed(1)}) - ${(BOX.x / 2).toFixed(1)};
  vec4 mv = modelViewMatrix * vec4(x, y, aSeed.z + cos(uTime * 0.5 + aSeed.z) * 1.1, 1.0);
  gl_PointSize = uSize * 60.0 / -mv.z;
  vA = uAmt * smoothstep(240.0, 30.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FLAKE_F = /* glsl */ `uniform vec3 uColor; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.15, d)); }`;

function seeds(n: number, salt: number): Float32Array {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([BOX.cx + (rand(i * 3 + salt) - 0.5) * BOX.x, rand(i * 3 + 1 + salt) * BOX.y, BOX.cz + (rand(i * 3 + 2 + salt) - 0.5) * BOX.z], i * 3);
  return a;
}

function Rain({ drops }: { drops: number }) {
  const geo = useMemo(() => {
    const s = seeds(drops, 1), seed2 = new Float32Array(drops * 6), tip = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) { seed2.set(s.subarray(i * 3, i * 3 + 3), i * 6); seed2.set(s.subarray(i * 3, i * 3 + 3), i * 6 + 3); tip[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(drops * 6), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed2, 3)); g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    return g;
  }, [drops]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } } }), []);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uAmt.value = smooth.rain; });
  return <lineSegments geometry={geo} material={mat} frustumCulled={false} visible={true} onUpdate={() => undefined} />;
}

function Flakes({ n, salt, color, size, fall, kind }: { n: number; salt: number; color: string; size: number; fall: number; kind: 'snow' | 'petals' | 'leaves' }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds(n, salt), 3));
    return g;
  }, [n, salt]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: FLAKE_V, fragmentShader: FLAKE_F, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSize: { value: size }, uFall: { value: fall }, uWind: { value: 0 }, uColor: { value: new THREE.Color(color) } },
  }), [size, fall, color]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uAmt.value = smooth[kind]; mat.uniforms.uWind.value = 0.4 + sim.world.env.wind * 3; });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** Rain, snow (when it is cold enough), and seasonal drift: spring petals / autumn leaves. */
export function Weather({ drops, drift }: { drops: number; drift: number }) {
  useFrame((_, dt) => {
    const e = sim.world.env, k = 1 - Math.exp(-Math.min(dt, 0.1) * 0.6);
    const wet = e.weather === 'rain';
    const cold = e.temperature < 2.5;
    const up = (key: keyof typeof smooth, target: number) => { smooth[key] += (target - smooth[key]) * k; };
    up('rain', wet && !cold ? 1 : 0); up('snow', wet && cold ? 1 : 0);
    up('petals', e.season === 'spring' && e.weather !== 'rain' ? 0.9 : 0);
    up('leaves', e.season === 'autumn' && e.weather !== 'rain' ? 0.95 : 0);
  });
  return (
    <group>
      <Rain drops={drops} />
      <Flakes n={Math.round(drops * 0.8)} salt={7} color="#f4f6f8" size={0.55} fall={2.2} kind="snow" />
      {drift > 0 && <Flakes n={drift} salt={19} color="#f2c3cf" size={0.5} fall={1.1} kind="petals" />}
      {drift > 0 && <Flakes n={drift} salt={31} color="#d98a3e" size={0.55} fall={1.6} kind="leaves" />}
    </group>
  );
}
