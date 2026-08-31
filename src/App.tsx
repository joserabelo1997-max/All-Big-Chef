import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './ui/Layout'
// O painel é a primeira tela do turno e fica no pacote inicial: carregá-lo sob
// demanda só acrescentaria espera onde ela é mais visível.
import { Painel } from './screens/Painel'

/**
 * As demais telas são carregadas sob demanda.
 *
 * A cozinha usa tablets modestos em Wi-Fi ruim, e boa parte do peso está em
 * telas abertas raramente — o diagnóstico da impressora, os relatórios, o
 * editor. Dividir por rota mantém a abertura do turno rápida.
 */
const tela = <T extends string>(
  carregar: () => Promise<Record<T, React.ComponentType>>,
  nome: T,
) => lazy(async () => ({ default: (await carregar())[nome] }))

const Alertas = tela(() => import('./screens/Alertas'), 'Alertas')
const Configuracoes = tela(() => import('./screens/Configuracoes'), 'Configuracoes')
const DarBaixa = tela(() => import('./screens/DarBaixa'), 'DarBaixa')
const EditorEtiqueta = tela(() => import('./screens/EditorEtiqueta'), 'EditorEtiqueta')
const DiagnosticoImpressora = tela(
  () => import('./screens/DiagnosticoImpressora'),
  'DiagnosticoImpressora',
)
const Equipe = tela(() => import('./screens/Equipe'), 'Equipe')
const EtiquetaDetalhe = tela(() => import('./screens/EtiquetaDetalhe'), 'EtiquetaDetalhe')
const Etiquetas = tela(() => import('./screens/Etiquetas'), 'Etiquetas')
const Fornecedores = tela(() => import('./screens/Fornecedores'), 'Fornecedores')
const Imprimir = tela(() => import('./screens/Imprimir'), 'Imprimir')
const Lote = tela(() => import('./screens/Lote'), 'Lote')
const Pastas = tela(() => import('./screens/Pastas'), 'Pastas')
const ProdutoForm = tela(() => import('./screens/ProdutoForm'), 'ProdutoForm')
const Produtos = tela(() => import('./screens/Produtos'), 'Produtos')

const EmBreve = lazy(async () => {
  const m = await import('./screens/EmBreve')
  return { default: m.EmBreve }
})

/**
 * HashRouter — e não BrowserRouter — porque o GitHub Pages serve arquivos
 * estáticos e devolve 404 em deep links. O QR das etiquetas aponta para
 * `.../All-Big-Chef/#/l/<uuid>`, então a rota precisa viver no hash.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Painel />} />

          <Route path="pastas" element={<Lazy><Pastas /></Lazy>} />
          <Route path="produtos" element={<Lazy><Produtos /></Lazy>} />
          {/* `novo` antes de `:produtoId` para não ser capturado como um id. */}
          <Route path="produtos/novo" element={<Lazy><ProdutoForm /></Lazy>} />
          <Route path="produtos/:produtoId" element={<Lazy><ProdutoForm /></Lazy>} />

          <Route path="imprimir" element={<Lazy><Imprimir /></Lazy>} />
          <Route path="lote" element={<Lazy><Lote /></Lazy>} />
          <Route path="etiquetas" element={<Lazy><Etiquetas /></Lazy>} />
          <Route path="baixa" element={<Lazy><DarBaixa /></Lazy>} />
          {/* Destino do QR impresso: abre direto a etiqueta escaneada. */}
          <Route path="l/:labelId" element={<Lazy><EtiquetaDetalhe /></Lazy>} />

          <Route path="editor" element={<Lazy><EditorEtiqueta /></Lazy>} />
          <Route path="relatorios" element={<Lazy><EmBreve titulo="Relatórios" /></Lazy>} />

          <Route path="config" element={<Lazy><Configuracoes /></Lazy>} />
          <Route path="config/impressora" element={<Lazy><DiagnosticoImpressora /></Lazy>} />
          <Route path="config/alertas" element={<Lazy><Alertas /></Lazy>} />
          <Route path="config/equipe" element={<Lazy><Equipe /></Lazy>} />
          <Route path="config/fornecedores" element={<Lazy><Fornecedores /></Lazy>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<div className="px-4 py-20 text-center text-slate-400">Carregando…</div>}
    >
      {children}
    </Suspense>
  )
}
