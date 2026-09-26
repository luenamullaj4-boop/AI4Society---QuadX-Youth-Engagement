// GreenELB service worker: offline app shell + web push.
const CACHE = 'greenelb-v1';
const SHELL = ['/app.html', '/css/app.css', '/js/main.js', '/js/config.js', '/img/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first; fall back to the cached shell when offline. API calls are never cached.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match(e.request)) || (e.request.mode === 'navigate' ? caches.match('/app.html') : Response.error())));
});
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'GreenELB', { body: data.body || '', icon: '/img/icon-192.png', badge: '/img/icon-192.png', data: { link: data.link || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.link || '/'));
});
