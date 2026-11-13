// Groundwork service worker: shows push notifications and opens the job when tapped, and shows a calm
// offline page when a page can not load. Nothing is cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let m = { title: 'Groundwork', body: 'You have an update.', url: '/', tag: 'groundwork' };
  try { m = { ...m, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, tag: m.tag, data: { url: m.url }, icon: '/icon.png', badge: '/icon.png' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus().then(c => c.navigate(url)) : self.clients.openWindow(url);
  }));
});

// Offline: a page that can not load shows this instead of the browser's own error page (bug 93).
const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are offline · Groundwork</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F6F5F2;color:#1C1B19;display:grid;min-height:100vh;place-items:center;padding:16px}
main{max-width:420px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 2px rgba(28,27,25,.04),0 4px 16px rgba(28,27,25,.04)}
h1{font-size:20px;margin:0 0 8px}p{color:#5F5B54;margin:0 0 16px;line-height:1.5}
button{font:inherit;font-weight:500;min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#1F1D1A;color:#fff}
@media (prefers-color-scheme:dark){body{background:#151412;color:#F2EFEA}main{background:#1E1C19}p{color:#ADA79E}button{background:#F2EFEA;color:#1C1B19}}</style></head>
<body><main><h1>You are offline.</h1><p>Groundwork will open again when your phone is back online. Anything you saved on this phone will be sent then.</p><button onclick="location.reload()">Try again</button></main></body></html>`;
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
