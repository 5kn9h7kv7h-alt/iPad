// public/ を検証して dist/ に出力する。外部ツール不要。
// - 全JSの構文チェック / manifest と index.html の参照チェック
// - Service Worker にファイル一覧とバージョン（内容ハッシュ）を埋め込む
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'public');
// 出力先: 既定は dist/。GitHub Pages用は `node build.mjs --out docs`（Pagesは / か /docs しか公開元に選べない）
const outName = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist';
if (!['dist', 'docs'].includes(outName)) { console.error(`BUILD FAILED: --out は dist か docs のみ（指定: ${outName}）`); process.exit(1); }
const out = path.join(here, outName);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

const fail = (msg) => { console.error(`BUILD FAILED: ${msg}`); process.exit(1); };

const files = walk(src).sort();
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(src, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`syntax error in ${f}\n${r.stderr}`);
}

try { JSON.parse(fs.readFileSync(path.join(src, 'manifest.webmanifest'), 'utf8')); } catch (e) { fail(`manifest.webmanifest: ${e.message}`); }
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).concat(manifest.icons.map((i) => i.src));
for (const r of refs) if (!files.includes(r)) fail(`missing file referenced: ${r}`);

const hash = crypto.createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(src, f)));
const version = hash.digest('hex').slice(0, 10);

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}
// 約14MBのOCR部品はプリキャッシュしない（初回の読み取り時に取得され、以降はService Workerがキャッシュする）
const assets = ['./', ...files.filter((f) => f !== 'sw.js' && !f.startsWith('vendor/'))].map((f) => JSON.stringify(f)).join(', ');
const swPath = path.join(out, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("const VERSION = 'dev';") || !sw.includes('/*ASSETS*/')) fail('sw.js placeholders not found');
sw = sw.replace("const VERSION = 'dev';", `const VERSION = '${version}';`).replace('/*ASSETS*/', assets);
fs.writeFileSync(swPath, sw);

fs.writeFileSync(path.join(out, '.nojekyll'), ''); // GitHub PagesのJekyll処理を無効化
console.log(`Build OK: ${files.length} files -> ${outName}/ (version ${version})`);
