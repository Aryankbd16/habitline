import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Habitline — Habit Tracker',
        short_name: 'Habitline',
        description: 'A personal habit tracker.',
        theme_color: '#151313',
        background_color: '#151313',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: []
      }
    })
  ],
  preview: { proxy: { '/api': process.env.HABITLINE_API_TARGET || 'http://127.0.0.1:3001' } },
  server: {
    host: true,
    https: true,
    proxy: {
      '/api': process.env.HABITLINE_API_TARGET || 'http://127.0.0.1:3001',
    },
  }
})
