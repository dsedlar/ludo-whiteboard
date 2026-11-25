// Offline support: keep a copy of every app file on the iPad, serve from that copy first,
// and quietly refresh the copy whenever there is a connection.
const CACHE = 'bishops-whiteboard-v11';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'court.jpg', 'team-playbook.json', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    // The team playbook should be as new as possible, so try the network first for that one file.
    if (url.pathname.endsWith('team-playbook.json')) return (await fresh) || hit;
    return hit || fresh;
  }));
});
