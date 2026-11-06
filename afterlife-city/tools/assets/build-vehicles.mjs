// Converts CC0 vehicle / boat models by Quaternius (FBX) into single-primitive GLBs with vertex colours.
//   node tools/assets/build-vehicles.mjs <dir containing "Car Pack", "Public Transport", "Ships by @Quaternius"> <FBX2glTF binary>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrims, prune, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const [, , root, fbx2gltf] = process.argv;
const OUT = new URL('../../public/assets/vehicles/', import.meta.url).pathname;
// The packs keep their colours in tiny palette textures (cars) or only in the .blend files (bus), so colours are
// baked into vertex colours here: palette texels are sampled at each vertex's UV and remapped to the town's palette,
// and the bus is painted by material name.
const CAR_TEX = 'Car Pack/Blends/CarTexture.png', TAXI_TEX = 'Car Pack/Blends/TaxiTexture.png';
const CAR_MAP = body => ({ '5ea0f2': body, '5aebeb': '#3a4a52', '75708f': '#3a393c', 'ffffff': '#ebe6da', 'f3e641': '#f3e7b4' });
const ITEMS = [
  ['Car Pack/FBX/SimpleCarHigh.fbx', 'car_a', { tex: CAR_TEX, map: CAR_MAP('#8fae9f') }],
  ['Car Pack/FBX/SimpleCarShort.fbx', 'car_b', { tex: CAR_TEX, map: CAR_MAP('#e6d9bb') }],
  ['Car Pack/FBX/BasicCar.fbx', 'car_c', { tex: CAR_TEX, map: CAR_MAP('#b4553d') }],
  ['Car Pack/FBX/Taxi.fbx', 'taxi', { tex: TAXI_TEX, map: {} }],
  ['Public Transport/FBX/Bus.fbx', 'bus', { byMaterial: { Top: '#ebe2c8', Bottom: '#3e6b66', Bumper: '#3a3a3a', Windows: '#465c66', Lights: '#f3e7b4', Details: '#c9b98f', Material: '#2a2a2a' } }],
  ['Ships by @Quaternius/FBX/BoatWSail.fbx', 'sailboat', { byMaterial: { Sail: '#efe8d8', Fabric: '#efe8d8' } }],
  ['Ships by @Quaternius/FBX/Sail ship.fbx', 'sailship', { byMaterial: { Fabric: '#ece3cf' } }],
];

/** Minimal PNG reader (8-bit RGB/RGBA, not interlaced): enough for the packs' palette textures. */
function readPng(file) {
  const b = readFileSync(file); let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      px[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { w, h, at(u, v) { const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h))), i = (y * w + x) * bpp; return [px[i], px[i + 1], px[i + 2]]; } };
}
const hex = c => c.map(v => v.toString(16).padStart(2, '0')).join('');
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linOf = h => [1, 3, 5].map(i => toLin(parseInt(h.slice(i, i + 2), 16)));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const tmp = mkdtempSync(join(tmpdir(), 'veh-'));
for (const [src, name, paint] of ITEMS) {
  const tex = paint.tex ? readPng(join(root, paint.tex)) : null;
  const seen = new Map();
  execFileSync(fbx2gltf, ['--binary', '--input', join(root, src), '--output', join(tmp, name)], { stdio: 'ignore' });
  const doc = await io.read(join(tmp, `${name}.glb`));
  const r = doc.getRoot();
  for (const a of r.listAnimations()) a.dispose();
  const shared = doc.createMaterial('Vehicle').setRoughnessFactor(0.6).setMetallicFactor(0.1);
  for (const mesh of r.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), named = paint.byMaterial?.[mat?.getName() ?? ''];
    const c = named ? linOf(named) : (mat?.getBaseColorFactor() ?? [1, 1, 1, 1]);
    const n = prim.getAttribute('POSITION').getCount(), col = new Float32Array(n * 3), uv = prim.getAttribute('TEXCOORD_0');
    for (let v = 0; v < n; v++) {
      if (tex && uv) {
        const [u, t] = uv.getElement(v, []), texel = hex(tex.at(u, t)), to = paint.map[texel];
        seen.set(texel, (seen.get(texel) ?? 0) + 1);
        col.set(to ? linOf(to) : tex.at(u, t).map(toLin), v * 3);
      } else col.set([c[0], c[1], c[2]], v * 3);
    }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(r.listBuffers()[0]));
    for (const sem of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'COLOR_0'].includes(sem)) prim.setAttribute(sem, null);
    prim.setMaterial(shared);
  }
  await doc.transform(flatten(), joinPrims({ keepMeshes: false, keepNamed: false }), weld(), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(join(OUT, `${name}.glb`), doc);
  const prims = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0);
  console.log(name, statSync(join(OUT, `${name}.glb`)).size, 'bytes,', prims, 'primitive(s)', seen.size ? Object.fromEntries(seen) : '');
}
rmSync(tmp, { recursive: true, force: true });
