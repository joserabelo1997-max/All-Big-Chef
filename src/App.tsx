import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './ui/Layout'
import { Painel } from './screens/Painel'
import { EmBreve } from './screens/EmBreve'
import { DiagnosticoImpressora } from './screens/DiagnosticoImpressora'
import { Configuracoes } from './screens/Configuracoes'

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
          <Route path="pastas" element={<EmBreve titulo="Pastas" />} />
          <Route path="produtos" element={<EmBreve titulo="Produtos" />} />
          <Route path="imprimir" element={<EmBreve titulo="Imprimir etiqueta" />} />
          <Route path="lote" element={<EmBreve titulo="Impressão em lote" />} />
          <Route path="etiquetas" element={<EmBreve titulo="Etiquetas ativas" />} />
          <Route path="baixa" element={<EmBreve titulo="Dar baixa" />} />
          {/* Destino do QR impresso: abre direto a etiqueta escaneada. */}
          <Route path="l/:labelId" element={<EmBreve titulo="Etiqueta" />} />
          <Route path="editor" element={<EmBreve titulo="Editor de etiqueta" />} />
          <Route path="relatorios" element={<EmBreve titulo="Relatórios" />} />
          <Route path="config" element={<Configuracoes />} />
          <Route path="config/impressora" element={<DiagnosticoImpressora />} />
          <Route path="config/alertas" element={<EmBreve titulo="Alertas de validade" />} />
          <Route path="config/equipe" element={<EmBreve titulo="Equipe" />} />
          <Route path="config/fornecedores" element={<EmBreve titulo="Fornecedores" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
