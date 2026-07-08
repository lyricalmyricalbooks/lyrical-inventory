import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commitDate = '';
try {
  commitDate = execSync('git log -1 --format=%cd --date=format:"%Y-%m-%d %H:%M:%S"').toString().trim();
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
  plugins: [
    syncAppsScriptPlugin(),
    VitePWA({
      registerType: 'prompt',
      // gas-code.txt is lazy-fetched by the "Connect your Google Sheet" tab;
      // precaching it (a background fetch after load, not render-blocking) keeps
      // that tab working offline without bloating the initial HTML parse.
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'maskable-icon-512x512.png', 'gas-code.txt'],
      workbox: {
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
          }
        ]
      },
      manifest: {
        name: 'Lyricalmyrical Inventory',
        short_name: 'Lyrical-Inv',
        description: 'Inventory management for Lyricalmyrical Books',
        theme_color: '#0e0c0a',
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
