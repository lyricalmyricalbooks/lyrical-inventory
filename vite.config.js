import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-controlled.png'],
      manifest: {
        name: 'Lyricalmyrical Inventory',
        short_name: 'Lyrical-Inv',
        description: 'Inventory management for Lyricalmyrical Books',
        theme_color: '#0e0c0a',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
});
