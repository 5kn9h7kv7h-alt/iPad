// アイコンPNGを生成する（依存なし）。出力は public/icons/ に置いてコミット対象にする。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

const BG = [79, 122, 100], FG = [255, 253, 248], LEAF = [79, 122, 100];

function pixel(u, v) {
  // 中心(0.5,0.5)の白い円＋緑の「葉」型（2つの円の共通部分）で、Study Groveを連想させる単純な図形
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d < 0.3) {
    const a = Math.hypot(u - 0.42, v - 0.58) < 0.26;
    const b = Math.hypot(u - 0.58, v - 0.42) < 0.26;
    return a && b ? LEAF : FG;
  }
  return BG;
}

function png(size) {
  const ss = 3; // スーパーサンプリング
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const p = pixel((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        r += p[0]; g += p[1]; b += p[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r / ss / ss); raw[o + 1] = Math.round(g / ss / ss); raw[o + 2] = Math.round(b / ss / ss);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(outDir, name), png(size));
  console.log('wrote', name);
}
