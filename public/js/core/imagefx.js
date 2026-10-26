// レシート写真の前処理（純粋な配列処理。DOMに依存しない）。単体テスト対象。
// gray は 0〜255 のグレースケール(Uint8Array/Uint8ClampedArray)、幅 w × 高さ h。

/** 大津の方法で、明暗を分けるしきい値を求める */
export function otsu(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0, sumB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/** 1次元の配列で、値が基準を超える最長の連続区間（隙間 gap 以内は連続とみなす）を返す */
function longestRun(values, limit, gap) {
  let best = null, start = -1, last = -1;
  const close = () => { if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last]; };
  for (let i = 0; i < values.length; i++) {
    if (values[i] > limit) {
      if (start < 0) start = i;
      else if (i - last > gap + 1) { close(); start = i; }
      last = i;
    }
  }
  close();
  return best;
}

/**
 * 明るい「紙」の領域を、写真から見つける。暗い背景（机など）や、光の反射の小さな点に引きずられないよう、
 * 行・列ごとの「明るい画素の割合」で判定する。見つからなければ null（切り出さない）。
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function findPaperBox(gray, w, h, { step = 4, margin = -0.012 } = {}) { // margin が負なら紙の内側へ寄せる（縁の黒い部分を読ませない）
  const sw = Math.max(1, Math.floor(w / step)), sh = Math.max(1, Math.floor(h / step));
  const small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) small[y * sw + x] = gray[y * step * w + x * step];
  const thr = otsu(small);
  if (thr < 40 || thr > 220) return null; // 明暗がはっきりしない写真
  const bright = (v) => v > thr;
  const cols = new Float32Array(sw), rows = new Float32Array(sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (bright(small[y * sw + x])) { cols[x]++; rows[y]++; }
  for (let x = 0; x < sw; x++) cols[x] /= sh;
  const xr = longestRun(cols, 0.3, 3);
  if (!xr) return null;
  for (let y = 0; y < sh; y++) { rows[y] = 0; for (let x = xr[0]; x <= xr[1]; x++) if (bright(small[y * sw + x])) rows[y]++; rows[y] /= (xr[1] - xr[0] + 1); }
  const yr = longestRun(rows, 0.2, 6);
  if (!yr) return null;
  const mx = Math.round(w * margin), my = Math.round(h * margin);
  const x0 = Math.max(0, xr[0] * step - mx), x1 = Math.min(w, (xr[1] + 1) * step + mx);
  const y0 = Math.max(0, yr[0] * step - my), y1 = Math.min(h, (yr[1] + 1) * step + my);
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  // 画面のほとんどを占める（＝切り出す意味がない）か、極端に小さければ切り出さない
  const area = (box.w * box.h) / (w * h);
  if (area > 0.92 || area < 0.08) return null;
  return box;
}

/**
 * 局所しきい値による二値化（影や明るさのムラに強い）。画素が「周囲の平均 × ratio」より暗ければ黒。
 * 積分画像を使うので、窓が大きくても高速。
 */
export function adaptiveThreshold(gray, w, h, { win = Math.max(15, Math.round(Math.min(w, h) / 16) | 1), ratio = 0.88 } = {}) {
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += gray[(y - 1) * w + (x - 1)]; integral[y * W + x] = integral[(y - 1) * W + x] + row; }
  }
  const out = new Uint8ClampedArray(w * h);
  const r = win >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = gray[y * w + x] < (sum / area) * ratio ? 0 : 255;
    }
  }
  return out;
}

/** 1%〜99%の範囲をいっぱいに広げる（コントラスト補正） */
export function stretchContrast(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const n = gray.length;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo <= 20) return gray;
  const k = 255 / (hi - lo);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, (gray[i] - lo) * k));
  return out;
}
