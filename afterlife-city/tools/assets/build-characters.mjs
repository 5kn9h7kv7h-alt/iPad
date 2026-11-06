// Converts the CC0 "Ultimate Animated Character Pack" by Quaternius (FBX) into small game-ready GLBs.
//   node tools/assets/build-characters.mjs <dir with *.fbx> <path to FBX2glTF binary>
// Each character becomes ONE skinned primitive: the original materials are replaced by a vertex attribute
// `_SLOT` (0 skin, 1 hair, 2 top, 3 bottom, 4 keep-original-colour) plus COLOR_0 with the original colour,
// so the game recolours each resident in a single draw call. Animations are written once to anims.glb.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [, , srcDir, fbx2gltf] = process.argv;
const OUT = new URL('../../public/assets/characters/', import.meta.url).pathname;
const MODELS = [
  'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
  'OldClassy_Male', 'OldClassy_Female', 'Suit_Male', 'Suit_Female', 'Worker_Male', 'Worker_Female', 'Chef_Male', 'Chef_Female',
];
const KEEP_ANIMS = ['Idle', 'Walk', 'SitDown', 'StandUp', 'PickUp', 'Victory'];
const SLOT = { Skin: 0, Hair: 1, Shirt: 2, Clothes: 2, Vest: 2, Main: 2, Pants: 3, DarkClothes: 3, Black: 3 };

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const tmp = mkdtempSync(join(tmpdir(), 'chars-'));

for (const [i, name] of MODELS.entries()) {
  execFileSync(fbx2gltf, ['--binary', '--input', join(srcDir, `${name}.fbx`), '--output', join(tmp, name)], { stdio: 'ignore' });
  const doc = await io.read(join(tmp, `${name}.glb`));
  const root = doc.getRoot();
  if (i === 0) {
    // the animation library (shared by every character: same 23-bone CharacterArmature)
    const a = await io.read(join(tmp, `${name}.glb`));
    for (const anim of a.getRoot().listAnimations()) {
      const short = anim.getName().split('|').pop();
      if (!KEEP_ANIMS.includes(short)) anim.dispose(); else anim.setName(short);
    }
    for (const m of a.getRoot().listMeshes()) m.dispose();
    await a.transform(prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(join(OUT, 'anims.glb'), a);
  }
  for (const anim of root.listAnimations()) anim.dispose();
  const shared = doc.createMaterial('Resident').setRoughnessFactor(0.85).setMetallicFactor(0);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const n = prim.getAttribute('POSITION').getCount();
    const c = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
    const slot = SLOT[mat?.getName() ?? ''] ?? 4;
    const color = new Float32Array(n * 3), slots = new Float32Array(n);
    for (let v = 0; v < n; v++) { color.set([c[0], c[1], c[2]], v * 3); slots[v] = slot; }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(color).setBuffer(root.listBuffers()[0]));
    prim.setAttribute('_SLOT', doc.createAccessor().setType('SCALAR').setArray(slots).setBuffer(root.listBuffers()[0]));
    prim.setMaterial(shared);
  }
  // merge every primitive of the (single) skinned mesh into one primitive -> one draw call per resident
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives();
    if (prims.length < 2) continue;
    const sems = ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0', '_SLOT'];
    const total = prims.reduce((s, p) => s + p.getAttribute('POSITION').getCount(), 0);
    const arrays = {}, sizes = {};
    for (const sem of sems) { const a = prims[0].getAttribute(sem); sizes[sem] = a.getElementSize(); arrays[sem] = new (sem === 'JOINTS_0' ? Uint16Array : Float32Array)(total * sizes[sem]); }
    const idx = [];
    let base = 0;
    for (const p of prims) {
      const n = p.getAttribute('POSITION').getCount();
      for (const sem of sems) arrays[sem].set(p.getAttribute(sem).getArray(), base * sizes[sem]);
      const ind = p.getIndices();
      if (ind) for (const v of ind.getArray()) idx.push(v + base); else for (let v = 0; v < n; v++) idx.push(v + base);
      base += n;
    }
    const buf = root.listBuffers()[0];
    const merged = doc.createPrimitive().setMaterial(shared)
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(total < 65535 ? Uint16Array.from(idx) : Uint32Array.from(idx)).setBuffer(buf));
    for (const sem of sems) merged.setAttribute(sem, doc.createAccessor().setType(sizes[sem] === 1 ? 'SCALAR' : sizes[sem] === 3 ? 'VEC3' : 'VEC4').setArray(arrays[sem]).setBuffer(buf));
    for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
    mesh.addPrimitive(merged);
  }
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.58, error: 0.0025 }), prune(), dedup(), quantize({ pattern: /^(POSITION|NORMAL|JOINTS_0|WEIGHTS_0)$/ }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(join(OUT, `${name}.glb`), doc);
  console.log(name, statSync(join(OUT, `${name}.glb`)).size, 'bytes');
}
console.log('anims', statSync(join(OUT, 'anims.glb')).size, 'bytes');
rmSync(tmp, { recursive: true, force: true });
