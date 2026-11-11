const CACHE = 'opendesqueeze-web-v0.1.0';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return res;
    })));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return res;
    })));
  }
});
