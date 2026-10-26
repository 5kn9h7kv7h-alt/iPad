import test from 'node:test';
import assert from 'node:assert/strict';
import { otsu, findPaperBox, adaptiveThreshold, stretchContrast } from '../../public/js/core/imagefx.js';

const make = (w, h, fn) => { const g = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = fn(x, y); return g; };

test('otsu: 暗い面と明るい面の間にしきい値が入る', () => {
  const g = make(100, 100, (x) => (x < 50 ? 20 : 230));
  const t = otsu(g);
  assert.ok(t >= 20 && t < 230, String(t));
});

test('findPaperBox: 暗い背景の中の明るい紙を見つける（小さな反射の点に引きずられない）', () => {
  const w = 400, h = 600;
  const g = make(w, h, (x, y) => {
    const paper = x >= 100 && x < 300 && y >= 40 && y < 560;
    if (paper) return (x + y) % 7 === 0 ? 40 : 235; // 紙の上の文字っぽい暗い点
    if (x >= 380 && y >= 100 && y < 110) return 250; // 背景の小さな反射
    return 15;
  });
  const b = findPaperBox(g, w, h);
  assert.ok(b, '紙が見つかる');
  assert.ok(Math.abs(b.x - 100) <= 16 && Math.abs(b.x + b.w - 300) <= 16, `x範囲: ${JSON.stringify(b)}`);
  assert.ok(Math.abs(b.y - 40) <= 16 && Math.abs(b.y + b.h - 560) <= 16, `y範囲: ${JSON.stringify(b)}`);
  assert.ok(b.x >= 100 && b.x + b.w <= 300, '紙の内側に寄せる（縁の黒を含めない）');
});

test('findPaperBox: 全面が白い写真・真っ暗な写真・明暗がはっきりしない写真では切り出さない', () => {
  assert.equal(findPaperBox(make(200, 200, () => 240), 200, 200), null);
  assert.equal(findPaperBox(make(200, 200, () => 10), 200, 200), null);
  assert.equal(findPaperBox(make(200, 200, (x) => 120 + (x % 5)), 200, 200), null);
});

test('adaptiveThreshold: 明るさのムラ（影）があっても文字だけが黒になる', () => {
  const w = 120, h = 60;
  // 左は暗く右は明るい背景（影）。中央付近に細い暗い線（文字）
  const g = make(w, h, (x, y) => {
    const bg = 120 + x; // 120〜239 のグラデーション
    const ink = (x % 20 === 10) && y > 20 && y < 40;
    return ink ? bg - 70 : bg;
  });
  const b = adaptiveThreshold(g, w, h, { win: 31, ratio: 0.88 });
  let inkBlack = 0, inkTotal = 0, bgWhite = 0, bgTotal = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ink = (x % 20 === 10) && y > 20 && y < 40;
    if (ink) { inkTotal++; if (b[y * w + x] === 0) inkBlack++; } else { bgTotal++; if (b[y * w + x] === 255) bgWhite++; }
  }
  assert.ok(inkBlack / inkTotal > 0.95, `文字が黒: ${inkBlack}/${inkTotal}`);
  assert.ok(bgWhite / bgTotal > 0.97, `背景が白: ${bgWhite}/${bgTotal}`);
});

test('stretchContrast: 狭い範囲の画像を広げ、すでに広い画像はそのまま', () => {
  const g = make(100, 100, (x) => 100 + (x % 50));
  const s = stretchContrast(g);
  assert.ok(Math.min(...s) <= 5 && Math.max(...s) >= 250);
  const wide = make(100, 100, (x) => (x % 2 ? 0 : 255));
  assert.deepEqual(Array.from(stretchContrast(wide)), Array.from(wide), '広い画像は内容が変わらない');
  const flat = make(10, 10, () => 128);
  assert.equal(stretchContrast(flat), flat, 'ほぼ一色の画像は引き伸ばさない（ノイズを増幅しない）');
});
