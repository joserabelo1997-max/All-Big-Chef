import { NavLink, Outlet } from 'react-router-dom'

import { BarraCarrinho } from './BarraCarrinho'
import { IndicadorSync } from './IndicadorSync'
import { LeitorGlobal } from './LeitorGlobal'

/**
 * Navegação inferior: alcance do polegar com o aparelho na mão, sem menu
 * escondido.
 *
 * Não há aba "Imprimir". A impressão começa nos produtos e é concluída pela
 * BarraCarrinho, que aparece só quando há algo na fila — em vez de uma aba fixa
 * ocupando espaço mesmo quando não há nada para imprimir.
 */
const ABAS = [
  { para: '/', rotulo: 'Painel', icone: '🏠', fim: true },
  { para: '/pastas', rotulo: 'Produtos', icone: '🏷️', fim: false },
  { para: '/estoque', rotulo: 'Estoque', icone: '📦', fim: false },
  { para: '/escanear', rotulo: 'Escanear', icone: '📷', fim: false },
  { para: '/config', rotulo: 'Ajustes', icone: '⚙️', fim: false },
] as const

export function Layout() {
  return (
    <div className="flex h-full flex-col">
      {/* Escuta o leitor de código de barras em qualquer tela. */}
      <LeitorGlobal />
      <IndicadorSync />

      {/* pb-40 e não pb-24: a barra do carrinho fica acima da navegação, e sem
          essa folga ela cobriria o último item da lista. */}
      <main className="flex-1 overflow-y-auto pb-40">
        <Outlet />
      </main>

      <BarraCarrinho />

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
