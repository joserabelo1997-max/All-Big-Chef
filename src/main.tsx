import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ProvedorSessao } from './dados/sessao'
import './index.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    {/* O basename vem do Vite para o app funcionar publicado em subpasta do Pages. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
