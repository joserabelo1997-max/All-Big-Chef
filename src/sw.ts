/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

/** Payload que a Edge Function `check-expiries` envia no Web Push. */
interface PayloadValidade {
  titulo: string
  corpo: string
  /** Rota (com hash) que deve abrir ao tocar na notificação. */
  rota?: string
  /** Quantidade de etiquetas afetadas — vira o badge do ícone do app. */
  total?: number
}

/**
 * `renotify` faz parte da especificação de Notifications, mas ainda não está no
 * `lib.dom` do TypeScript. Sem ele, o aviso novo entra silencioso quando reusa a
 * mesma `tag` — que é justamente o caso aqui.
 */
type OpcoesNotificacao = NotificationOptions & { renotify?: boolean }

const BASE = '/All-Big-Chef/'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

/**
 * Cache sob demanda do leitor de QR.
 *
 * Esse pedaço fica fora do precache porque são ~410 KB que o Chrome no Android
 * nunca usa — lá o QR é lido pela BarcodeDetector nativa. Mas quem depende dele
 * (Safari e Bluefy, no iPhone) precisa conseguir dar baixa offline, então na
 * primeira vez que for buscado ele é guardado.
 *
 * Cache-first sem revalidação é seguro aqui: o nome do arquivo carrega o hash
 * do conteúdo, então uma versão nova sempre vem com outra URL.
 */
const CACHE_SOB_DEMANDA = 'abc-sob-demanda-v1'

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url)
  if (evento.request.method !== 'GET') return
  if (!/\/assets\/leitor-qr-[^/]+\.js$/.test(url.pathname)) return

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_SOB_DEMANDA)
      const guardado = await cache.match(evento.request)
      if (guardado) return guardado

      const resposta = await fetch(evento.request)
      if (resposta.ok) await cache.put(evento.request, resposta.clone())
      return resposta
    })(),
  )
})

self.addEventListener('push', (evento) => {
  // Um push sem corpo legível ainda deve notificar: melhor um aviso genérico do
  // que um alerta de validade silenciosamente perdido.
  let dados: PayloadValidade = {
    titulo: 'All Big Chef',
    corpo: 'Há etiquetas precisando de atenção.',
  }

  try {
    if (evento.data) dados = { ...dados, ...(evento.data.json() as PayloadValidade) }
  } catch {
    const texto = evento.data?.text()
    if (texto) dados.corpo = texto
  }

  const rota = dados.rota ?? '#/etiquetas?filtro=vencendo'

  evento.waitUntil(
    (async () => {
      const opcoes: OpcoesNotificacao = {
        body: dados.corpo,
        icon: `${BASE}icons/icon-192.png`,
        badge: `${BASE}icons/icon-192.png`,
        // Uma tag fixa faz o aviso novo substituir o anterior em vez de empilhar
        // dezenas de notificações ao longo do dia.
        tag: 'validade',
        renotify: true,
        requireInteraction: true,
        data: { rota },
      }

      await self.registration.showNotification(dados.titulo, opcoes)

      if (typeof dados.total === 'number' && 'setAppBadge' in navigator) {
        await navigator.setAppBadge?.(dados.total).catch(() => {})
      }
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const rota = (evento.notification.data?.rota as string | undefined) ?? '#/'
  const destino = `${BASE}${rota}`

  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reaproveita a aba já aberta em vez de abrir uma nova a cada alerta.
      for (const janela of janelas) {
        if (janela.url.includes(BASE)) {
          await janela.focus()
          await janela.navigate?.(destino).catch(() => {})
          return
        }
      }

      await self.clients.openWindow(destino)
    })(),
  )
})
