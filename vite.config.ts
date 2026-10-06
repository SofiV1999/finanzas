import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages sirve el sitio en https://sofiv1999.github.io/finanzas/
  base: '/finanzas/',
  plugins: [
    react(),
    // App instalable: manifiesto + service worker que guarda la app (no los datos) para que
    // abra rápido; los datos siempre se piden a Supabase.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Finanzas',
        short_name: 'Finanzas',
        description: 'Mis gastos, presupuesto, deudas, ahorros y metas.',
        lang: 'es-CO',
        start_url: '/finanzas/',
        scope: '/finanzas/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/finanzas/index.html',
        cleanupOutdatedCaches: true,
        // Supabase y la TRM nunca se guardan en caché: siempre datos frescos
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith('supabase.co') || url.hostname === 'www.datos.gov.co',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Librerías grandes en archivos aparte: cambian poco y el navegador las reutiliza
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-'))
            return 'charts'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
