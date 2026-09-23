// Stand-in for vite-plugin-pwa's `virtual:pwa-register` (aliased in the
// `test` block of vite.config.js). No service worker exists under jsdom.
export function registerSW() {
  return async () => {};
}
