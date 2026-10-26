// 依存なしの静的サーバー。既定は 127.0.0.1 のみ待受（外部へ公開しない）。
// 同じWi-FiのiPadから試す場合のみ HOST=0.0.0.0 を明示する。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export function startServer({ root, port = 8080, host = '127.0.0.1' }) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad request'); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      }).end(buf);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const useDist = process.argv.includes('--dist');
  const root = path.join(here, useDist ? 'dist' : 'public');
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  startServer({ root, port, host }).then(() => {
    console.log(`AI Control Panel: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/  (root: ${path.basename(root)})`);
    if (host === '0.0.0.0') console.log('注意: 同じネットワーク内の端末から見える状態です。信頼できるネットワークでのみ使ってください。');
  });
}
