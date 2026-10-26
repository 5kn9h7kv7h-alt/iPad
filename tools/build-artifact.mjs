// Claudeの共有ページ（Artifact）用のファイル一式を artifact/ に作る。
// 共有ページは公開時に <!doctype>/<html>/<head>/<body> で包まれるため、index.html は本文だけにする。
// Service Worker・manifest・アイコンは共有ページでは使えない（動かない）ので含めない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(here, 'public');
const out = path.join(here, 'artifact');
const EXCLUDE = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1];
if (!title || !body) { console.error('BUILD FAILED: index.html の title/body を取り出せません'); process.exit(1); }

fs.rmSync(out, { recursive: true, force: true });
const files = walk(src).filter((f) => !EXCLUDE.has(f) && !f.startsWith('icons/'));
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}
fs.writeFileSync(path.join(out, 'index.html'), `<title>${title}</title>\n<link rel="stylesheet" href="styles.css">\n${body.trim()}\n`);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(['styles.css', ...files.filter((f) => f !== 'styles.css')], null, 0));
console.log(`Artifact build OK: ${files.length + 1} files -> artifact/`);
