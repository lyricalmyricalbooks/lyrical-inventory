// Dev server for the phone screenshot rig (npm run shots). Serves the real
// index.html and src/, but boots through shots-entry.js instead of
// src/main.js, with the Firebase SDK and the PWA hook swapped for the same
// inert stubs the test suite uses — so the app runs signed in, against demo
// data, with no network and no Google account. Never part of the app build.
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: ROOT,
  configFile: false,
  // The app narrates freely to the console offline (FX lookups etc.); keep the run readable.
  logLevel: 'error',
  define: { __GIT_COMMIT_DATE__: JSON.stringify('2026-10-10T00:00:00Z') },
  resolve: {
    alias: [
      {
        find: /^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/[\w-]+\.js$/,
        replacement: path.join(ROOT, 'tests/helpers/stubs/firebase-sdk.js'),
      },
      { find: /^virtual:pwa-register$/, replacement: path.join(ROOT, 'tests/helpers/stubs/pwa-register.js') },
    ],
  },
  server: { strictPort: true, hmr: false },
  plugins: [{
    name: 'phone-shots-entry',
    transformIndexHtml(html) {
      const tag = '<script type="module" src="/src/main.js"></script>';
      if (!html.includes(tag)) throw new Error('phone-shots: index.html no longer loads /src/main.js the expected way');
      return html.replace(tag, '<script type="module" src="/scripts/phone-shots/shots-entry.js"></script>');
    },
  }],
});
