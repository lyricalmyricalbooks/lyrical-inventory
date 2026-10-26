// Pressing one of the app's notifications on the phone or computer.
//
// Loaded into the service worker that vite-plugin-pwa generates (see
// `workbox.importScripts` in vite.config.js). Android only shows notifications
// that come from the service worker, so the press lands here rather than in
// the page: bring the open app forward and tell it which notification it was,
// or open the app if it was closed. src/lib/device-notify.js handles both.
/* eslint-env serviceworker */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tag = (event.notification.data && event.notification.data.tag) || event.notification.tag || '';
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = open.find((c) => c.url.startsWith(self.registration.scope)) || open[0];
    if (client) {
      try { await client.focus(); } catch (_) { /* focus is best-effort */ }
      client.postMessage({ type: 'lm-notification-click', tag });
      return;
    }
    const url = new URL(self.registration.scope);
    if (tag) url.searchParams.set('notif', tag);
    await self.clients.openWindow(url.href);
  })());
});
