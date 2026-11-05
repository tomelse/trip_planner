import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets BASE_PATH. Locally it is just "/".
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      // An open copy of the app keeps running its old version until you accept the update prompt.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trip Planner',
        short_name: 'Trip Planner',
        description: 'Plan trips: pin places, track travel, notes and a calendar. Your data stays on your device.',
        theme_color: '#fafaf8',
        background_color: '#fafaf8',
        display: 'standalone',
        // Long-press the icon on Android. Handled in App.svelte from the ?action= parameter.
        shortcuts: [
          { name: 'New trip', short_name: 'New trip', url: './?action=new-trip', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Itinerary', short_name: 'Itinerary', url: './?action=itinerary', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Travel', short_name: 'Travel', url: './?action=travel', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // Appear in Android's Share menu (installed app only). A GET share opens the app with ?title=&text=&url=.
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            // Map tiles you have already looked at, so those areas still show with no signal. Not a bulk download:
            // OpenStreetMap's tile policy forbids that, so this only keeps what the map actually requested.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
