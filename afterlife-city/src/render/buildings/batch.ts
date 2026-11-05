// Geometry batching for the whole town: every building is written into three shared buffers
// (solid walls/roofs, glass, signs) so 26 buildings cost ~3 draw calls. Pure data — no React, no sim writes.
import * as THREE from 'three';

interface Buf { pos: number[]; nor: number[]; col: number[]; uv: number[]; seed: number[]; shop: number[] }
const newBuf = (): Buf => ({ pos: [], nor: [], col: [], uv: [], seed: [], shop: [] });

const unit = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const BOX = unit(new THREE.BoxGeometry(1, 1, 1));
const PLANE = unit(new THREE.PlaneGeometry(1, 1));
const CYL = (seg: number) => unit(new THREE.CylinderGeometry(1, 1, 1, seg));
const CYL12 = CYL(12), CYL8 = CYL(8);
const HIP = (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return unit(g); })();
const DOME = (() => { const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); return unit(g); })();
/** Triangular prism: width 1 (x), depth 1 (z), eave y=0, ridge y=1 along z. */
const GABLE = (() => {
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  const L = -0.5, R = 0.5, F = 0.5, K = -0.5;
  tri([L, 0, F], [R, 0, F], [0, 1, F]);              // front gable
  tri([R, 0, K], [L, 0, K], [0, 1, K]);              // back gable
  tri([L, 0, F], [0, 1, F], [0, 1, K]); tri([L, 0, F], [0, 1, K], [L, 0, K]); // left slope
  tri([R, 0, F], [R, 0, K], [0, 1, K]); tri([R, 0, F], [0, 1, K], [0, 1, F]); // right slope
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((v.length / 3) * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
})();

export type Shape = 'box' | 'plane' | 'cyl' | 'cyl8' | 'hip' | 'dome' | 'gable';
const GEO: Record<Shape, THREE.BufferGeometry> = { box: BOX, plane: PLANE, cyl: CYL12, cyl8: CYL8, hip: HIP, dome: DOME, gable: GABLE };

export interface Cell { text: string; bg: string; fg: string }
/** heading: world yaw the sitter faces, as angle t with facing vector (sin t, cos t) in (x, z). */
export interface Anchor { buildingId: string; kind: 'door' | 'seat' | 'sign' | 'lamp'; x: number; z: number; heading?: number }
export interface Range { id: string; start: number; end: number }

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _p = new THREE.Vector3(), _nv = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Batch {
  solid = newBuf(); glass = newBuf(); sign = newBuf();
  cells: Cell[] = []; anchors: Anchor[] = []; ranges: Range[] = [];
  base = new THREE.Matrix4();
  private rangeStart = 0; private rangeId = '';
  private yaw = 0; private ox = 0; private oz = 0;

  begin(id: string, x: number, z: number, yaw: number): void {
    this.rangeId = id; this.rangeStart = this.solid.pos.length / 9;
    this.yaw = yaw; this.ox = x; this.oz = z;
    this.base.makeRotationY(yaw).setPosition(x, 0, z);
  }
  end(): void { this.ranges.push({ id: this.rangeId, start: this.rangeStart, end: this.solid.pos.length / 9 }); }

  /** local (x, z) -> world, for anchors */
  toWorld(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.ox + lx * c + lz * s, this.oz - lx * s + lz * c];
  }

  private push(buf: Buf, shape: Shape, m: THREE.Matrix4, color: THREE.Color, opts?: { cell?: number; seed?: number; shop?: number }): void {
    const g = GEO[shape];
    const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute, U = g.attributes.uv as THREE.BufferAttribute;
    _n.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(m);
      _nv.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
      buf.pos.push(_p.x, _p.y, _p.z); buf.nor.push(_nv.x, _nv.y, _nv.z); buf.col.push(color.r, color.g, color.b);
      if (opts?.cell !== undefined) {
        const cols = 4, cx = opts.cell % cols, cy = Math.floor(opts.cell / cols);
        buf.uv.push((cx + U.getX(i)) / cols, 1 - (cy + 1 - U.getY(i)) / 16);
      } else if (Math.abs(_nv.y) > 0.7) buf.uv.push(_p.x * 0.22, _p.z * 0.22);
      else if (Math.abs(_nv.x) > Math.abs(_nv.z)) buf.uv.push(_p.z * 0.22, _p.y * 0.22);
      else buf.uv.push(_p.x * 0.22, _p.y * 0.22);
      buf.seed.push(opts?.seed ?? 0); buf.shop.push(opts?.shop ?? 0);
    }
  }

  /** Generic part in building-local space. pos = centre (box) / base-centre (hip, gable, cyl uses centre). */
  put(shape: Shape, pos: [number, number, number], scale: [number, number, number], color: string | THREE.Color, rot: [number, number, number] = [0, 0, 0]): void {
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e); _s.set(scale[0], scale[1], scale[2]);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s).premultiply(this.base);
    this.push(this.solid, shape, _m, _c.set(color as THREE.ColorRepresentation));
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string | THREE.Color, ry = 0): void { this.put('box', [cx, cy, cz], [sx, sy, sz], color, [0, ry, 0]); }
  /** Box standing on the ground/floor y0 with height h. */
  block(cx: number, y0: number, cz: number, sx: number, h: number, sz: number, color: string | THREE.Color, ry = 0): void { this.box(cx, y0 + h / 2, cz, sx, h, sz, color, ry); }
  cyl(cx: number, y0: number, cz: number, rx: number, h: number, color: string | THREE.Color, rTopScale = 1): void {
    this.put('cyl', [cx, y0 + h / 2, cz], [rx, h, rx], color);
    void rTopScale;
  }
  /** Gable roof: eave at y0; ridge runs along local Z unless ridgeX. */
  gable(cx: number, y0: number, cz: number, W: number, D: number, rise: number, color: string | THREE.Color, ridgeX = false): void {
    if (!ridgeX) this.put('gable', [cx, y0, cz], [W, rise, D], color);
    else this.put('gable', [cx, y0, cz], [D, rise, W], color, [0, Math.PI / 2, 0]);
  }
  hip(cx: number, y0: number, cz: number, W: number, D: number, rise: number, color: string | THREE.Color): void { this.put('hip', [cx, y0, cz], [W, rise, D], color); }

  /** A window on a face of a W×D box. face: 0 front(+z) 1 back 2 right(+x) 3 left. u along the face, v height. */
  window(face: 0 | 1 | 2 | 3, W: number, D: number, u: number, v: number, w: number, h: number, seed: number, shop: number, frame: string | THREE.Color = '#f1ebdd'): void {
    const th = [0, Math.PI, Math.PI / 2, -Math.PI / 2][face];
    const ox = face === 2 ? W / 2 : face === 3 ? -W / 2 : 0, oz = face === 0 ? D / 2 : face === 1 ? -D / 2 : 0;
    const place = (off: number, sw: number, sh: number) => _m.makeRotationY(th).setPosition(ox, 0, oz)
      .multiply(new THREE.Matrix4().compose(_p.set(u, v, off), _q.identity(), _s.set(sw, sh, 1))).premultiply(this.base);
    this.push(this.solid, 'plane', place(0.02, w + 0.22, h + 0.22), _c.set(frame as THREE.ColorRepresentation));
    this.push(this.glass, 'plane', place(0.045, w, h), _c.set('#6f8d9a'), { seed, shop });
  }
  /** Grid of windows across a face. */
  windows(face: 0 | 1 | 2 | 3, W: number, D: number, o: { floors: number; cols: number; y0: number; floorH: number; w?: number; h?: number; shop?: number; seed: number; skip?: (r: number, c: number) => boolean; frame?: string }): void {
    const fw = face < 2 ? W : D;
    const w = o.w ?? 0.9, h = o.h ?? 1.15;
    for (let r = 0; r < o.floors; r++) for (let c = 0; c < o.cols; c++) {
      if (o.skip?.(r, c)) continue;
      const u = (c + 0.5) / o.cols * fw - fw / 2;
      const seed = ((o.seed * 7919 + r * 131 + c * 31 + face * 17) % 1000) / 1000;
      this.window(face, W, D, u, o.y0 + r * o.floorH + h / 2 + 0.55, w, h, seed, o.shop ?? 0, o.frame);
    }
  }
  /** Lit-from-inside part (lamps, lantern): goes in the glass buffer, always on at night. */
  lamp(cx: number, cy: number, cz: number, r: number, color = '#ffd9a0'): void {
    _m.compose(_p.set(cx, cy, cz), _q.identity(), _s.set(r, r, r)).premultiply(this.base);
    this.push(this.glass, 'cyl8', _m, _c.set(color), { seed: -1, shop: 0 }); // seed<0 => always lit
  }
  /** Sign board with a text cell from the atlas. */
  signBoard(text: string, bg: string, fg: string, cx: number, cy: number, cz: number, w: number, h: number, back = '#3a2f26'): void {
    const idx = this.cells.length;
    this.cells.push({ text, bg, fg });
    this.box(cx, cy, cz - 0.04, w + 0.15, h + 0.15, 0.1, back);
    _m.compose(_p.set(cx, cy, cz + 0.03), _q.identity(), _s.set(w, h, 1)).premultiply(this.base);
    this.push(this.sign, 'plane', _m, _c.set('#ffffff'), { cell: idx });
    const [ax, az] = this.toWorld(cx, cz);
    this.anchors.push({ buildingId: this.rangeId, kind: 'sign', x: ax, z: az });
  }
  anchor(kind: Anchor['kind'], lx: number, lz: number, localHeading?: number, parent?: string): void {
    const [x, z] = this.toWorld(lx, lz);
    this.anchors.push({ buildingId: parent ?? this.rangeId, kind, x, z, heading: localHeading === undefined ? undefined : localHeading + this.yaw });
  }
  /** Run `fn` in a temporary local frame (world x, z, yaw) — used for free-standing street furniture. */
  frame(x: number, z: number, yaw: number, fn: () => void): void {
    const sb = this.base.clone(), sy = this.yaw, sx = this.ox, sz = this.oz;
    this.yaw = yaw; this.ox = x; this.oz = z;
    this.base.makeRotationY(yaw).setPosition(x, 0, z);
    fn();
    this.base.copy(sb); this.yaw = sy; this.ox = sx; this.oz = sz;
  }

  toGeometry(buf: Buf, withLit: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    if (withLit) { g.setAttribute('aSeed', new THREE.Float32BufferAttribute(buf.seed, 1)); g.setAttribute('aShop', new THREE.Float32BufferAttribute(buf.shop, 1)); }
    g.computeBoundingSphere();
    return g;
  }
}
