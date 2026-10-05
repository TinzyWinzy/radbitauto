import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: { 'react-vendor': ['react', 'react-dom', 'react-router-dom'], 'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'] } } } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/radbit-auto-v2-192.png', 'icons/radbit-auto-v2-512.png', 'icons/radbit-auto-v2-maskable.png', 'icons/radbit-auto-v2-180.png'],
      manifest: {
        id: '/',
        name: 'Radbit Auto',
        short_name: 'Radbit Auto',
        description: 'Stock, sales and imports for Zimbabwean dealerships and their customers.',
        theme_color: '#f3f0e8',
        background_color: '#f3f0e8',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        start_url: '/?source=pwa',
        scope: '/',
        lang: 'en',
        categories: ['business', 'utilities'],
        launch_handler: { client_mode: 'navigate-existing' },
        edge_side_panel: { preferred_width: 480 },
        icons: [
          { src: '/icons/radbit-auto-v2-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/radbit-auto-v2-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/radbit-auto-v2-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        screenshots: [
          { src: '/screenshots/radbit-auto-v2-mobile.png', sizes: '390x900', type: 'image/png', form_factor: 'narrow' },
          { src: '/screenshots/radbit-auto-v2-desktop.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide' }
        ],
        shortcuts: [
          { name: 'My imports', url: '/app?source=shortcut', icons: [{ src: '/icons/radbit-auto-v2.svg', sizes: '192x192' }] },
          { name: 'New vehicle', url: '/app/new/vehicle?source=shortcut', icons: [{ src: '/icons/radbit-auto-v2.svg', sizes: '192x192' }] }
        ]
      },
      workbox: {
        globIgnores: ['**/exceljs*.js'],
        navigateFallbackDenylist: [/^\/__\//],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 2592000 } },
          },
          {
            urlPattern: ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'images', expiration: { maxEntries: 100, maxAgeSeconds: 604800 } },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'shell' },
          },
        ],
      },
      devOptions: { enabled: false },
    })
  ]
});
