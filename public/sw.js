// LadangKita service worker: lets the app open without signal.
// App files: try the network first (so updates arrive), fall back to the saved copy when offline.
// Fonts: saved copy first. Supabase data and photos are never handled here.
const CACHE = 'lk-app-v1';
const SHELL = ['./', 'index.html', 'app.js', 'styles.css', 'config.js', 'manifest.webmanifest', 'vendor/supabase.js',
  'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), timeout(6000)]);
        if (res && res.ok) cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
        return res;
      } catch (_) {
        const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
        return hit || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
