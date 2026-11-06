// Post-processing: one bloom (mip-map blur, cheap on tile GPUs) + one grading pass that does exposure,
// filmic tone mapping, warm-highlight / cool-shadow split toning, saturation and a soft vignette.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, Effect, KernelSize } from 'postprocessing';
import * as THREE from 'three';
import { atmo } from '../environment/Environment';

const GRADE = /* glsl */ `
uniform float uExposure, uSat, uVignette, uWarm, uContrast;
uniform vec3 uShadowTint, uHighTint;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = aces(inputColor.rgb * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // split toning: highlights lean golden, shadows lean blue-violet (film-like, never an orange filter)
  c *= mix(uShadowTint, uHighTint, smoothstep(0.08, 0.85, l));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  vec2 d = uv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.8;
  outputColor = vec4(max(c, 0.0), inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1)], ['uSat', new THREE.Uniform(1.05)], ['uVignette', new THREE.Uniform(0.32)],
        ['uWarm', new THREE.Uniform(0)], ['uContrast', new THREE.Uniform(1.04)],
        ['uShadowTint', new THREE.Uniform(new THREE.Color(0.96, 0.97, 1.04))], ['uHighTint', new THREE.Uniform(new THREE.Color(1.03, 1.0, 0.95))],
      ]),
    });
  }
}

export interface PostSettings { bloomScale: number; multisampling: number }

/** Time-of-day grade: warmer and slightly more saturated at golden hour, cooler and darker at night. */
function gradeFor(): { exposure: number; sat: number; shadow: [number, number, number]; high: [number, number, number]; bloom: number; contrast: number } {
  const night = atmo.night, golden = atmo.evening ? Math.max(0, 1 - Math.abs(atmo.elevation - 0.12) / 0.3) * (1 - night) : 0;
  return {
    exposure: atmo.exposure * (1.08 + golden * 0.08),
    sat: 1.04 + golden * 0.12 - night * 0.1,
    shadow: [0.95 - golden * 0.02, 0.96, 1.05 + night * 0.06],
    high: [1.03 + golden * 0.05, 1.0 + golden * 0.01, 0.95 - golden * 0.06],
    bloom: 0.45 + golden * 0.55 + night * 0.65,
    contrast: 1.04 + golden * 0.04,
  };
}

export function PostFX({ settings }: { settings: PostSettings }) {
  const grade = useMemo(() => new GradeEffect(), []);
  const bloomRef = useMemo(() => ({ current: null as null | { intensity: number } }), []);
  useFrame(() => {
    const g = gradeFor();
    const u = grade.uniforms;
    u.get('uExposure')!.value = g.exposure; u.get('uSat')!.value = g.sat; u.get('uContrast')!.value = g.contrast;
    (u.get('uShadowTint')!.value as THREE.Color).setRGB(...g.shadow); (u.get('uHighTint')!.value as THREE.Color).setRGB(...g.high);
    if (bloomRef.current) bloomRef.current.intensity = g.bloom;
  });
  return (
    <EffectComposer multisampling={settings.multisampling} frameBufferType={THREE.HalfFloatType} enableNormalPass={false}>
      <Bloom ref={(b: unknown) => { bloomRef.current = b as { intensity: number } | null; }} mipmapBlur intensity={0.6} luminanceThreshold={0.85} luminanceSmoothing={0.25}
        radius={0.72} kernelSize={KernelSize.MEDIUM} resolutionScale={settings.bloomScale} />
      <primitive object={grade} />
    </EffectComposer>
  );
}
