import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import './index.css'

// autoUpdate: o Workbox troca o service worker sozinho. Numa cozinha ninguém vai
// parar para confirmar diálogo de atualização, então recarregamos quando a nova
// versão assume o controle.
registerSW({ immediate: true })

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
