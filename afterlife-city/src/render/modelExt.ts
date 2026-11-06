// Model files are .glb. The published page host does not serve binary model files, so that build
// (VITE_MODEL_EXT=json) packs each model as base64 inside a JSON file: { "glb": "<base64>" }.
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_EXT = (import.meta.env.VITE_MODEL_EXT as string | undefined) ?? 'glb';

/** Load a model by its path without extension, e.g. "assets/vehicles/bus". */
export async function loadGltf(loader: GLTFLoader, path: string): Promise<GLTF> {
  const url = new URL(`${path}.${MODEL_EXT}`, document.baseURI).href;
  if (MODEL_EXT !== 'json') return loader.loadAsync(url);
  const { glb } = await (await fetch(url)).json() as { glb: string };
  const bin = atob(glb), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return loader.parseAsync(buf.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}
