// LUCIDA の Service Worker。オフラインでもアプリを開けるようにする。
// - 画面(HTML): ネットワーク優先、失敗したらキャッシュ（更新が反映されやすい）
// - 同一オリジンの静的ファイルとWebフォント: キャッシュを返しつつ裏で更新
// - それ以外（AI中継サーバーやSupabaseへの通信、POST）: 一切キャッシュしない・触らない
const CACHE = 'lucida-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lucida-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); }
        return res;
      }).catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      });
      if (hit) { refresh.catch(() => undefined); return hit; }
      return refresh;
    }),
  );
});
