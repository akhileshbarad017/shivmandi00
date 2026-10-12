import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Vijay Pandey & Company',
        short_name: 'VP Mandi',
        description: 'Wholesale vegetable billing and mandi ERP — works offline.',
        theme_color: '#eef3fb',
        background_color: '#eef3fb',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'New sale', short_name: 'Sale', url: '/sales/new' },
          { name: 'Multi sale', short_name: 'Multi', url: '/sales/multi' },
          { name: 'New purchase', short_name: 'Buy', url: '/purchases/new' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/print/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true, // listen on LAN so phones on the same Wi-Fi can connect
    port: 5173,
    allowedHosts: true, // allow tunnel hostnames (e.g. *.trycloudflare.com)
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    // Split big third-party libraries so the app shell loads fast and each
    // chunk can be cached independently by the browser / Netlify CDN.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'react';
          }
          if (id.includes('node_modules/@tanstack/')) return 'query';
          if (/node_modules\/(motion|framer-motion)\//.test(id)) return 'motion';
          if (id.includes('node_modules/qrcode')) return 'qrcode';
          if (id.includes('node_modules/lucide-react/')) return 'icons';
          if (id.includes('node_modules/idb-keyval/')) return 'idb';
          return 'vendor';
        },
      },
    },
  },
});
