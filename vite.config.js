import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function syncAppsScriptPlugin() {
  const codeGsPath = path.resolve(__dirname, 'apps-script/Code.gs');
  const indexHtmlPath = path.resolve(__dirname, 'index.html');

  const update = () => {
    try {
      let codeContent = fs.readFileSync(codeGsPath, 'utf8');
      const escapedCode = codeContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      let indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
      const preRegex = /(<pre id="gas-code"[^>]*>)([\s\S]*?)(<\/pre>)/;
      
      const match = indexContent.match(preRegex);
      if (!match) return;

      const newIndexContent = indexContent.replace(preRegex, (m, p1, p2, p3) => p1 + escapedCode + p3);
      if (newIndexContent !== indexContent) {
        fs.writeFileSync(indexHtmlPath, newIndexContent, 'utf8');
        console.log('\n[Vite] Google Apps Script synced to index.html successfully.');
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
  plugins: [
    syncAppsScriptPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'maskable-icon-512x512.png'],
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
