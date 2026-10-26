// Pressing one of the app's notifications on the phone or computer.
//
// Loaded into the service worker that vite-plugin-pwa generates (see
// `workbox.importScripts` in vite.config.js). Android only shows notifications
// that come from the service worker, so the press lands here rather than in
// the page: bring the open app forward and tell it which notification it was,
// or open the app if it was closed, carrying where the press should land on
// the address. src/lib/device-notify.js handles both.
/* eslint-env serviceworker */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const tag = data.tag || event.notification.tag || '';
  // Where the press should land (an order, an invoice, a screen), as plain data.
  const open = data.open || null;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => c.url.startsWith(self.registration.scope)) || windows[0];
    if (client) {
      try { await client.focus(); } catch (_) { /* focus is best-effort */ }
      client.postMessage({ type: 'lm-notification-click', tag, open });
      return;
    }
    const url = new URL(self.registration.scope);
    url.searchParams.set('notif', tag || '1');
    if (open) url.searchParams.set('open', JSON.stringify(open));
    await self.clients.openWindow(url.href);
  })());
});
