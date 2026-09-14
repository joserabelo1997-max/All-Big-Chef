import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/ui/AppShell'
import { ExigirSessao } from '@/ui/ExigirSessao'
import Entrar from '@/telas/Entrar'
import Inicio from '@/telas/Inicio'
import Cmv from '@/telas/Cmv'
import Receitas from '@/telas/Receitas'
import Insumos from '@/telas/Insumos'
import Producao from '@/telas/Producao'
import Menus from '@/telas/Menus'
import Servicos from '@/telas/Servicos'
import Compras from '@/telas/Compras'
import Config from '@/telas/Config'

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />

      <Route element={<ExigirSessao />}>
        <Route element={<AppShell />}>
          <Route index element={<Inicio />} />
          <Route path="cmv" element={<Cmv />} />
          <Route path="receitas" element={<Receitas />} />
          <Route path="insumos" element={<Insumos />} />
          <Route path="producao" element={<Producao />} />
          <Route path="menus" element={<Menus />} />
          <Route path="servicos" element={<Servicos />} />
          <Route path="compras" element={<Compras />} />
          <Route path="config" element={<Config />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
