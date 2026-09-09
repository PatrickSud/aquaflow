/* AquaFlow service worker â€” app shell offline-first.
   Ao publicar uma nova versÃ£o, mude VERSION. */
const VERSION = 'v1.2.1';
const SHELL = `aquaflow-shell-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/model.js',
  './js/engine.js',
  './js/ui.js',
  './js/charts.js',
  './js/pwa.js',
  './js/ai.js',
  './js/cloud.js',
  './js/firebase-config.js',
  './js/views/dashboard.js',
  './js/views/params.js',
  './js/views/tasks.js',
  './js/views/fauna.js',
  './js/views/plants.js',
  './js/views/consultor.js',
  './js/views/settings.js',
  './js/views/aquariums.js',
  './js/views/history.js',
  './js/views/cycling.js',
  './js/views/logs.js',
  './js/views/account.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll falha inteiro se 1 arquivo faltar; adiciona um a um p/ ser tolerante
    await Promise.all(ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // nunca intercepta outras origens (ex.: API do Gemini)
  if (url.origin !== self.location.origin) return;

  // navegaÃ§Ã£o: rede primeiro (pega deploy novo), cai p/ shell offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // estÃ¡ticos: cache primeiro, revalida em background
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: false });
    if (hit) {
      fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r && r.ok && url.origin === self.location.origin) c.put(req, r.clone());
      return r;
    } catch {
      return Response.error();
    }
  })());
});
