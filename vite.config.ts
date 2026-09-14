import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// `base` precisa casar com o caminho onde o GitHub Pages publica o site.
// Em projeto (usuario.github.io/All-Big-Chef) o caminho é /All-Big-Chef/.
// O workflow define BASE_PATH; localmente cai em '/'.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'All Big Chef',
        short_name: 'Big Chef',
        description: 'Gestão de cozinha: fichas técnicas, produção, CMV e compras',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        // O app lê do Dexie, então a rede só serve para sincronizar.
        // Nada de cachear resposta do Supabase: dado velho aqui confunde.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
