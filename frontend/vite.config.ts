import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'Déclaration de naissance en ligne',
        short_name: 'DéclaNaiss',
        description: 'Déclaration des naissances des centres de santé vers les mairies',
        lang: 'fr',
        theme_color: '#0f7a43',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // L'application (shell) est servie hors-ligne ; l'API n'est jamais mise en cache
        // (donnees personnelles), sauf le referentiel geographique et le personnel.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/(mairies\/referentiel|centres\/[^/]+\/personnel)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'referentiels', expiration: { maxAgeSeconds: 7 * 24 * 3600 } },
          },
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  server: {
    // Ecoute IPv4 + IPv6 et sur le reseau local (postes de saisie, telephones)
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } },
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } } },
  build: { sourcemap: false },
});
