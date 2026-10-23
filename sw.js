/* Cellar service worker — coherent, offline app shell. */
const CACHE = 'cellar-v18';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=2.7.0',
  './app.js?v=2.7.0',
  './inbox-core.js?v=2.7.0',
  './inbox.js?v=2.7.0',
  './voice-parser.js?v=2.7.0',
  './voice-memory.js?v=2.7.0',
  './voice.js?v=2.7.0',
  './voice-worker.js?v=2.7.0',
  './tasting.js?v=2.7.0',
  './vendor/transformers.min.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
const OPTIONAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE_ASSETS)
        .then(() => Promise.all(OPTIONAL_ASSETS.map(url => cache.add(url).catch(() => null)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('cellar-v') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCoreRequest(request) {
  if (request.mode === 'navigate') return true;
  const path = new URL(request.url).pathname;
  return ['/index.html', '/app.js', '/style.css', '/manifest.webmanifest', '/voice-parser.js', '/voice-memory.js', '/voice.js', '/voice-worker.js', '/tasting.js', '/inbox-core.js', '/inbox.js']
    .some(name => path.endsWith(name));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Deliveries and authorization responses must never be cached.
  if (url.origin === 'https://api.github.com' || /\/inbox\//.test(url.pathname) || url.pathname.endsWith('/delivery-key.json')) return;
  // Online suggestions are ephemeral until approved; never cache query responses.
  if (['https://datasets-server.huggingface.co','https://r.jina.ai'].includes(url.origin)) return;

  if (isCoreRequest(request)) {
    // Network-first prevents a mixed old-HTML/new-JS shell after a GitHub deploy.
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }))
  );
});

