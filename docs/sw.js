// オフライン対応用Service Worker。ビルド時に VERSION と ASSETS が埋め込まれる。
const VERSION = '52bcfa0e30';
const ASSETS = ["./", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "index.html", "js/app.js", "js/core/backup.js", "js/core/imagefx.js", "js/core/model.js", "js/core/ocr.js", "js/core/receipt.js", "js/core/save.js", "js/core/voice.js", "js/fx.js", "js/ledger.js", "js/storage/repository.js", "manifest.webmanifest", "styles.css"];
const CACHE = `acp-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('acp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ネットワーク優先、失敗時にキャッシュ（更新が反映されやすく、オフラインでも開ける）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
