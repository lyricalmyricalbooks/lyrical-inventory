import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { firebaseCdnPrecacheEntries } from './scripts/firebase-cdn-precache.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commitDate = '';
try {
  commitDate = execSync('git log -1 --format=%cI').toString().trim();
} catch (e) {
  commitDate = 'Unknown';
}

function syncAppsScriptPlugin() {
  const codeGsPath = path.resolve(__dirname, 'apps-script/Code.gs');
  // The "Connect your Google Sheet" tab no longer embeds the ~50 KB of Apps
  // Script source inline in index.html — it lazy-fetches this verbatim copy the
  // first time that tab is opened. Keeping it as a plain .txt (assigned via
  // textContent in the client) means no HTML-escaping is needed: Code.gs is the
  // single source of truth, copied here byte-for-byte on every build/edit.
  const gasCodeOutPath = path.resolve(__dirname, 'public/gas-code.txt');

  const update = () => {
    try {
      const codeContent = fs.readFileSync(codeGsPath, 'utf8');
      let current = '';
      try { current = fs.readFileSync(gasCodeOutPath, 'utf8'); } catch { /* first run */ }
      if (current !== codeContent) {
        fs.writeFileSync(gasCodeOutPath, codeContent, 'utf8');
        console.log('\n[Vite] Apps Script copied to public/gas-code.txt successfully.');
      }
    } catch (err) {
      console.error('\n[Vite] Failed to sync Apps Script:', err);
    }
  };

  return {
    name: 'sync-apps-script',
    buildStart() {
      update();
    },
    configureServer(server) {
      server.watcher.add(codeGsPath);
      server.watcher.on('change', (file) => {
        if (file === codeGsPath) {
          update();
          server.hot.send({ type: 'full-reload', path: '/index.html' });
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  define: {
    __GIT_COMMIT_DATE__: JSON.stringify(commitDate),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  test: {
    // There was no test config at all before this, so vitest ran with no DOM.
    // That is the reason so much of the suite asserts on the *text* of
    // src/main.js rather than on behaviour: with no document to render into,
    // grepping the source was the only option, and a test that greps for a
    // function name passes just as happily when that function is broken.
    //
    // jsdom is the default rather than opt-in per file so that writing a real
    // test is the path of least resistance. Node globals stay available, so the
    // existing pure-logic and filesystem tests are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Nothing here touches the network or a real Firebase project; a test that
    // hangs is a bug in the test, not something to wait 30s for.
    testTimeout: 10000,
    // Default 'threads' pool spins up a fresh jsdom environment per test file
    // (237 times, ~223s of the suite's ~106s wall time in overlapping workers).
    // vmThreads reuses the environment within a worker via a vm context, cutting
    // that overhead while still isolating each file's module registry/globals.
    pool: 'vmThreads',
    // What lets a test import the real src/main.js (see
    // tests/helpers/load-app.js). The Firebase SDK is loaded straight from the
    // gstatic CDN and the PWA hook is a plugin virtual module; under test both
    // resolve to inert local stubs instead. The CDN pattern matches any SDK
    // version so a Firebase upgrade doesn't silently break the harness.
    alias: [
      {
        find: /^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/[\w-]+\.js$/,
        replacement: path.resolve(__dirname, 'tests/helpers/stubs/firebase-sdk.js'),
      },
      {
        find: /^virtual:pwa-register$/,
        replacement: path.resolve(__dirname, 'tests/helpers/stubs/pwa-register.js'),
      },
    ],
  },
  plugins: [
    syncAppsScriptPlugin(),
    VitePWA({
      registerType: 'prompt',
      // gas-code.txt is lazy-fetched by the "Connect your Google Sheet" tab;
      // precaching it (a background fetch after load, not render-blocking) keeps
      // that tab working offline without bloating the initial HTML parse.
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'maskable-icon-512x512.png', 'gas-code.txt'],
      workbox: {
        // The Firebase SDK is imported from www.gstatic.com by src/firebase.js,
        // which main.js imports statically — if those modules can't load, no
        // app code runs and the app opens blank. Precaching them guarantees the
        // app can start with no signal. The list is read from src/firebase.js
        // so an SDK version bump can't silently fall out of the precache (the
        // helper throws if it finds nothing).
        additionalManifestEntries: firebaseCdnPrecacheEntries(path.resolve(__dirname, 'src/firebase.js')),
        // Cache cross-origin assets at runtime so the app keeps its typography
        // and lazy-loaded libraries (jsPDF/html2canvas, xlsx, qrcode) offline
        // after the first online visit. Without this, an offline invoice PDF
        // dropped to system fonts and "Download PDF" failed with no network.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdnjs-libs',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Fallback for any Firebase SDK module the precache above doesn't
            // list (the URLs are versioned, so a cached copy never goes stale).
            urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-sdk',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      manifest: {
        name: 'Lyricalmyrical Inventory',
        short_name: 'Lyrical-Inv',
        description: 'Inventory management for Lyricalmyrical Books',
        theme_color: '#100F0D',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
