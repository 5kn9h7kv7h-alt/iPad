// One articulated low-poly person baked into a single geometry. Limbs carry a pivot + part id;
// the vertex shader swings them, so 30 animated residents cost a single instanced draw call.
import * as THREE from 'three';

export const SLOT = { skin: 0, hair: 1, top: 2, bottom: 3, shoe: 4, umbrella: 5 } as const;
export const PART = { body: 0, legL: 1, legR: 2, armL: 3, armR: 4, umbrella: 5 } as const;

export function characterGeometry(): THREE.BufferGeometry {
  type Piece = { g: THREE.BufferGeometry; slot: number; part: number; pivot: [number, number, number] };
  const pieces: Piece[] = [];
  const add = (g: THREE.BufferGeometry, slot: number, part: number, pivot: [number, number, number] = [0, 0, 0]) => pieces.push({ g: g.index ? g.toNonIndexed() : g, slot, part, pivot });
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z = 0, seg = 8) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return g; };

  for (const [sx, part] of [[-0.11, PART.legL], [0.11, PART.legR]] as const) {
    const pv: [number, number, number] = [sx, 0.88, 0];
    add(cyl(0.085, 0.062, 0.86, sx, 0.45), SLOT.bottom, part, pv);
    const shoe = new THREE.BoxGeometry(0.15, 0.08, 0.28); shoe.translate(sx, 0.04, 0.06); add(shoe, SLOT.shoe, part, pv);
  }
  const hips = cyl(0.19, 0.18, 0.2, 0, 0.93, 0, 10); hips.scale(1, 1, 0.66); add(hips, SLOT.bottom, PART.body);
  const torso = cyl(0.205, 0.17, 0.58, 0, 1.22, 0, 10); torso.scale(1, 1, 0.64); add(torso, SLOT.top, PART.body);
  for (const [sx, part] of [[-0.285, PART.armL], [0.285, PART.armR]] as const) {
    const pv: [number, number, number] = [sx, 1.47, 0];
    add(cyl(0.062, 0.055, 0.3, sx, 1.32), SLOT.top, part, pv);
    add(cyl(0.05, 0.042, 0.28, sx, 1.03), SLOT.skin, part, pv);
    const hand = new THREE.SphereGeometry(0.05, 6, 5); hand.translate(sx, 0.87, 0); add(hand, SLOT.skin, part, pv);
  }
  add(cyl(0.055, 0.06, 0.1, 0, 1.55), SLOT.skin, PART.body);
  const head = new THREE.SphereGeometry(0.135, 12, 10); head.translate(0, 1.68, 0); add(head, SLOT.skin, PART.body);
  const hair = new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.75); hair.translate(0, 1.7, -0.012); add(hair, SLOT.hair, PART.body);

  // umbrella (only shown in the rain; held in the right hand)
  const stick = cyl(0.016, 0.016, 1.0, 0.25, 1.55, 0.36, 5); add(stick, SLOT.shoe, PART.umbrella);
  const canopy = new THREE.ConeGeometry(0.66, 0.32, 8, 1, true); canopy.translate(0.2, 2.15, 0.3); add(canopy, SLOT.umbrella, PART.umbrella);
  const canopyIn = new THREE.ConeGeometry(0.64, 0.3, 8, 1, true); canopyIn.rotateX(Math.PI); canopyIn.translate(0.2, 2.13, 0.3); add(canopyIn, SLOT.umbrella, PART.umbrella);

  let total = 0; for (const p of pieces) total += p.g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), slot = new Float32Array(total), part = new Float32Array(total), pivot = new Float32Array(total * 3);
  let o = 0;
  for (const p of pieces) {
    p.g.computeVertexNormals();
    const n = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array as Float32Array, o * 3); nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
    for (let i = 0; i < n; i++) { slot[o + i] = p.slot; part[o + i] = p.part; pivot.set(p.pivot, (o + i) * 3); }
    o += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1)); g.setAttribute('aPart', new THREE.BufferAttribute(part, 1)); g.setAttribute('aPivot', new THREE.BufferAttribute(pivot, 3));
  return g;
}

export const animUniforms = { uTime: { value: 0 } };

export function characterMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, animUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSlot; attribute float aPart; attribute vec3 aPivot;
attribute vec3 iTop; attribute vec3 iBottom; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iAnim;
uniform float uTime; varying vec3 vCol;`)
      .replace('#include <begin_vertex>', `
  vec3 transformed = position;
  float st = iAnim.x, ph = iAnim.y, amp = iAnim.z;
  float sw = sin(ph);
  float ang = 0.0;
  bool umb = iAnim.w > 0.5;
  if (st < 1.5) { // idle / walk
    float k = st > 0.5 ? amp : 0.0;
    if (aPart > 0.5 && aPart < 1.5) ang = sw * 0.75 * k;
    else if (aPart > 1.5 && aPart < 2.5) ang = -sw * 0.75 * k;
    else if (aPart > 2.5 && aPart < 3.5) ang = -sw * 0.6 * k;
    else if (aPart > 3.5) ang = sw * 0.6 * k;
    else ang = 0.0;
  } else if (st < 2.5) { // sitting: thighs forward, hands in lap
    if (aPart > 0.5 && aPart < 2.5) ang = -1.5;
    else if (aPart > 2.5) ang = -0.55;
  } else { // talking: expressive right arm, calmer left
    if (aPart > 3.5) ang = -1.15 + sin(uTime * 4.0 + ph) * 0.4;
    else if (aPart > 2.5 && aPart < 3.5) ang = -0.25 + sin(uTime * 2.3 + ph) * 0.15;
  }
  if (umb && aPart > 3.5 && aPart < 4.5) ang = -0.85;            // right hand holds the umbrella
  if (aPart > 4.5 && !umb) transformed = vec3(0.0, -40.0, 0.0);  // umbrella hidden when dry
  if (aPart > 0.5 && aPart < 4.5) {
    vec3 q = transformed - aPivot;
    float c = cos(ang), s = sin(ang);
    q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    transformed = q + aPivot;
  }
  if (st > 1.5 && st < 2.5) transformed.y -= 0.45;
  transformed.y += st > 0.5 && st < 1.5 ? abs(sw) * 0.05 * amp : sin(uTime * 1.7 + ph) * 0.006;
  vCol = aSlot < 0.5 ? iSkin : aSlot < 1.5 ? iHair : aSlot < 2.5 ? iTop : aSlot < 3.5 ? iBottom : aSlot < 4.5 ? vec3(0.075, 0.065, 0.06) : mix(iBottom, vec3(0.2, 0.22, 0.25), 0.35);
`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vCol;');
  };
  return m;
}
