import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Palabreo',
        short_name: 'Palabreo',
        description: 'Aprende vocabulario en inglés con fichas, audio, IPA y repaso espaciado.',
        lang: 'es',
        theme_color: '#0E7C77',
        background_color: '#FAF7F1',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The 4 MB pronunciation table is only needed while creating cards (online anyway):
        // keep it out of the install download and cache it on first use instead.
        globIgnores: ['**/cmu-pronouncing-dictionary-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/cmu-pronouncing-dictionary-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'dictionaries' },
          },
          {
            // Images and pronunciation audio fetched from free sources: keep them for offline study.
            urlPattern: ({ request }) => request.destination === 'image' || request.destination === 'audio',
            handler: 'CacheFirst',
            options: { cacheName: 'media', expiration: { maxEntries: 3000 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 4500 },
  test: { environment: 'node' },
});
