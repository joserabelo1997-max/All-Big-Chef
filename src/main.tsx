import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import './index.css'

/**
 * Atualização automática do app.
 *
 * O `sw.ts` chama `skipWaiting()` e `clientsClaim()`, então o service worker
 * novo assume sozinho. Só que isso troca o worker, e não a PÁGINA já aberta:
 * ela continua rodando o JavaScript velho até alguém recarregar. Numa PWA
 * instalada, "recarregar" não é algo que se faça — a pessoa fecha e abre, e o
 * sistema costuma restaurar a mesma página. Resultado: o app fica semanas
 * atrasado sem nenhum sinal, e uma correção publicada parece não ter saído.
 *
 * Daí a recarga explícita quando o worker novo assume o controle. Ninguém na
 * cozinha vai responder a um diálogo de "nova versão disponível" no meio do
 * serviço.
 */
registerSW({ immediate: true })

if ('serviceWorker' in navigator) {
  // A primeira instalação também dispara `controllerchange`, e ali não há nada
  // de velho para trocar — recarregar seria um susto à toa na primeira abertura.
  // `controller` só existe quando JÁ havia um worker no comando.
  const jaControlado = Boolean(navigator.serviceWorker.controller)
  let recarregando = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaControlado || recarregando) return
    recarregando = true
    window.location.reload()
  })
}

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
