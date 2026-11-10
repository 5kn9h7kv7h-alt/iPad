// PWA用アイコン(PNG)を生成する。Chromium(Playwright)でSVGを描画するだけで、追加の依存はない。
//   node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

// アイボリーの紙に、チャコールの「L」と、落ち着いた青の星（Lucida = 星座でいちばん明るい星）
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f5f0e4"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <path d="M168 120h64v8h-14v236h78c30 0 46-18 54-52h8l-6 68H168v-8h14V128h-14z" fill="#26262a"/>
    <path d="M352 104l11 37 37 11-37 11-11 37-11-37-37-11 37-11z" fill="#2f5b86"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.22], ['apple-touch-icon.png', 180, 0.08]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`);
  await page.screenshot({ path: path.join(out, name) });
  console.log('wrote', name);
}
fs.writeFileSync(path.join(out, 'icon.svg'), svg(0));
await browser.close();
