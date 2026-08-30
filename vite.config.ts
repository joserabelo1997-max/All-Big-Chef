import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// O app é servido pelo GitHub Pages em /All-Big-Chef/. Esse base entra no bundle,
// no manifest e no escopo do service worker — mudar aqui exige rebuild do QR das
// etiquetas já impressas, então trate como valor estável.
const BASE = '/All-Big-Chef/'

export default defineConfig(({ mode }) => ({
  base: BASE,
  plugins: [
    react(),
    // Web Bluetooth exige contexto seguro. `npm run dev` em localhost já basta;
    // para testar impressão num celular na mesma rede use `npm run dev:https`.
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      // injectManifest (e não generateSW) porque precisamos de um service worker
      // próprio para tratar o evento `push` das notificações de validade.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // O ZXing são ~410 KB que mais da metade dos aparelhos nunca usa: no
        // Chrome do Android o QR é lido pela BarcodeDetector nativa. Precachear
        // isso obrigaria toda cozinha a baixá-lo no primeiro acesso, num Wi-Fi
        // que costuma ser ruim. Fica de fora e é cacheado quando (e se) for
        // buscado — a partir daí a leitura offline funciona normalmente.
        globIgnores: ['**/leitor-qr-*.js'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'All Big Chef — Gestão de Cozinha',
        short_name: 'All Big Chef',
        description:
          'Etiquetas, controle de validade e rastreabilidade para cozinhas profissionais.',
        lang: 'pt-BR',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
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
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Nome estável para o pedaço do ZXing, para que o `globIgnores` acima
        // consiga excluí-lo do precache por padrão de nome.
        manualChunks(id) {
          if (id.includes('@zxing')) return 'leitor-qr'
          return undefined
        },
        chunkFileNames: (info) =>
          info.name === 'leitor-qr'
            ? 'assets/leitor-qr-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
}))
