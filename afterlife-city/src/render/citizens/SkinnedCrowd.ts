// High-detail residents: rigged CC0 characters (Quaternius) with real walk / idle / sit animations.
// Only the residents nearest to the camera use them; everybody else keeps the light instanced figure.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelName } from './models';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const url = (f: string) => new URL(`assets/characters/${f}`, document.baseURI).href;
const models = new Map<ModelName, Promise<GLTF>>();
let clipsP: Promise<THREE.AnimationClip[]> | null = null;

export function loadClips(): Promise<THREE.AnimationClip[]> {
  if (!clipsP) clipsP = loader.loadAsync(url('anims.glb')).then(g => g.animations);
  return clipsP;
}
export function loadModel(name: ModelName): Promise<GLTF> {
  let p = models.get(name);
  if (!p) { p = loader.loadAsync(url(`${name}.glb`)); models.set(name, p); }
  return p;
}

export interface Palette { skin: THREE.Color; hair: THREE.Color; top: THREE.Color; bottom: THREE.Color }

function recolor(mat: THREE.MeshStandardMaterial, pal: Palette): THREE.MeshStandardMaterial {
  const m = mat.clone();
  m.roughness = 0.82; m.metalness = 0;
  const u = { uSkin: { value: pal.skin }, uHair: { value: pal.hair }, uTop: { value: pal.top }, uBottom: { value: pal.bottom } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _slot; varying float vSlot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = _slot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSlot; uniform vec3 uSkin, uHair, uTop, uBottom;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (vSlot < 0.5) diffuseColor.rgb = uSkin; else if (vSlot < 1.5) diffuseColor.rgb = uHair;
  else if (vSlot < 2.5) diffuseColor.rgb = uTop; else if (vSlot < 3.5) diffuseColor.rgb = uBottom;`);
  };
  m.customProgramCacheKey = () => 'resident';
  return m;
}

/** One animated resident. */
export class Resident {
  root: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current = '';
  private umbrella: THREE.Group;
  constructor(gltf: GLTF, clips: THREE.AnimationClip[], pal: Palette, height: number, castShadow: boolean) {
    const model = cloneSkinned(gltf.scene) as THREE.Group;
    model.traverse(o => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) { mesh.material = recolor(mesh.material as THREE.MeshStandardMaterial, pal); mesh.castShadow = castShadow; mesh.frustumCulled = false; }
    });
    // more natural proportions than the chibi originals: a smaller head
    model.traverse(o => { if ((o as THREE.Bone).isBone && o.name === 'Head') o.scale.setScalar(0.76); });
    // normalise the size: models come in centimetres-ish scales; we want metres
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const k = height / Math.max(0.01, box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    this.root = new THREE.Group();
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    const sit = this.actions.SitDown;
    if (sit) { sit.setLoop(THREE.LoopOnce, 1); sit.clampWhenFinished = true; }
    // umbrella, held over the head in the rain
    this.umbrella = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: pal.bottom.clone().lerp(new THREE.Color('#2a3440'), 0.4), side: THREE.DoubleSide, roughness: 0.6 }));
    canopy.position.set(0.18, 2.12, 0.1);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 5), new THREE.MeshStandardMaterial({ color: '#222' }));
    stick.position.set(0.2, 1.62, 0.12);
    this.umbrella.add(canopy, stick);
    this.umbrella.visible = false;
    this.root.add(this.umbrella);
    this.play('Idle');
  }
  play(name: string, fade = 0.25): void {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.actions[this.current]?.fadeOut(fade);
    this.current = name;
  }
  /** state: 0 idle, 1 walk, 2 sit, 3 talk. speed in world units per real second. */
  update(dt: number, state: number, speed: number, umbrella: boolean): void {
    if (state === 1) { this.play('Walk', 0.2); this.actions.Walk.timeScale = THREE.MathUtils.clamp(speed / 1.55, 0.45, 3); }
    else if (state === 2) this.play('SitDown', 0.35);
    else this.play('Idle', 0.35);
    this.umbrella.visible = umbrella;
    this.mixer.update(dt);
  }
  dispose(): void {
    this.mixer.stopAllAction();
    // geometry is shared between clones: only the per-resident materials are ours to free
    this.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose?.(); });
  }
}
