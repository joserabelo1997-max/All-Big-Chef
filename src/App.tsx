import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './ui/Layout'
import { Configuracoes } from './screens/Configuracoes'
import { DiagnosticoImpressora } from './screens/DiagnosticoImpressora'
import { DarBaixa } from './screens/DarBaixa'
import { EmBreve } from './screens/EmBreve'
import { Equipe } from './screens/Equipe'
import { EtiquetaDetalhe } from './screens/EtiquetaDetalhe'
import { Fornecedores } from './screens/Fornecedores'
import { Imprimir } from './screens/Imprimir'
import { Painel } from './screens/Painel'
import { Pastas } from './screens/Pastas'
import { ProdutoForm } from './screens/ProdutoForm'
import { Produtos } from './screens/Produtos'

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

          <Route path="pastas" element={<Pastas />} />
          <Route path="produtos" element={<Produtos />} />
          {/* `novo` antes de `:produtoId` para não ser capturado como um id. */}
          <Route path="produtos/novo" element={<ProdutoForm />} />
          <Route path="produtos/:produtoId" element={<ProdutoForm />} />

          <Route path="imprimir" element={<Imprimir />} />
          <Route path="lote" element={<EmBreve titulo="Impressão em lote" />} />
          <Route path="etiquetas" element={<EmBreve titulo="Etiquetas ativas" />} />
          <Route path="baixa" element={<DarBaixa />} />
          {/* Destino do QR impresso: abre direto a etiqueta escaneada. */}
          <Route path="l/:labelId" element={<EtiquetaDetalhe />} />

          <Route path="editor" element={<EmBreve titulo="Editor de etiqueta" />} />
          <Route path="relatorios" element={<EmBreve titulo="Relatórios" />} />

          <Route path="config" element={<Configuracoes />} />
          <Route path="config/impressora" element={<DiagnosticoImpressora />} />
          <Route path="config/alertas" element={<EmBreve titulo="Alertas de validade" />} />
          <Route path="config/equipe" element={<Equipe />} />
          <Route path="config/fornecedores" element={<Fornecedores />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
