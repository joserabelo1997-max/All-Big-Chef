import { NavLink, Outlet } from 'react-router-dom'

import { IndicadorSync } from './IndicadorSync'

/** Navegação inferior: alcance do polegar com o aparelho na mão, sem menu escondido. */
const ABAS = [
  { para: '/', rotulo: 'Painel', icone: '🏠', fim: true },
  { para: '/pastas', rotulo: 'Produtos', icone: '📦', fim: false },
  { para: '/imprimir', rotulo: 'Imprimir', icone: '🖨️', fim: false },
  { para: '/baixa', rotulo: 'Dar baixa', icone: '📷', fim: false },
  { para: '/config', rotulo: 'Ajustes', icone: '⚙️', fim: false },
] as const

export function Layout() {
  return (
    <div className="flex h-full flex-col">
      <IndicadorSync />

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <ul className="mx-auto flex max-w-2xl">
          {ABAS.map((aba) => (
            <li key={aba.para} className="flex-1">
              <NavLink
                to={aba.para}
                end={aba.fim}
                className={({ isActive }) =>
                  [
                    'flex min-h-toque flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition',
                    isActive ? 'text-slate-900' : 'text-slate-400',
                  ].join(' ')
                }
              >
                <span aria-hidden className="text-xl leading-none">
                  {aba.icone}
                </span>
                {aba.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
