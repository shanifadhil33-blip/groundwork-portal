// Groundwork service worker: shows push notifications and opens the job when tapped. No caching.
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
