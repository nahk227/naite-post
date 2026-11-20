/* 나이테 우체국 — 서비스 워커 (답장 도착 알림) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: '답장이 도착했어요 🌳', body: '나이테 우체국에 다른 세대의 답장이 도착했어요.', url: './#inbox' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) { /* 기본 문구 사용 */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'naite-reply',
    renotify: true,
    data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './#inbox';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
