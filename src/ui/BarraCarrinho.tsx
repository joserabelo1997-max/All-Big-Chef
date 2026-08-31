import { useLocation, useNavigate } from 'react-router-dom'

import { useCarrinho } from '../lib/useCarrinho'

/**
 * Barra do carrinho de impressão.
 *
 * É o que substitui a antiga aba "Imprimir": em vez de ocupar um espaço fixo na
 * navegação o tempo todo, ela aparece exatamente quando há algo para imprimir e
 * some quando não há. Fica acima da navegação inferior, ao alcance do polegar.
 *
 * Mostra o total de ETIQUETAS, não de produtos — o número que importa é quanto
 * papel vai sair, não quantos itens diferentes foram escolhidos.
 */
export function BarraCarrinho() {
  const { totalEtiquetas, totalProdutos } = useCarrinho()
  const navegar = useNavigate()
  const { pathname } = useLocation()

  if (totalEtiquetas === 0) return null
  // Na própria fila a barra seria redundante: a tela inteira já é o carrinho.
  if (pathname === '/fila') return null

  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] z-10 px-3">
      <button
        onClick={() => navegar('/fila')}
        className="mx-auto flex min-h-toque w-full max-w-2xl items-center justify-between
          gap-3 rounded-2xl bg-slate-900 px-5 text-white shadow-lg
          transition active:scale-[0.99]"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{totalEtiquetas}</span>
          <span className="text-sm font-semibold">
            {totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'}
            {totalProdutos > 1 && (
              <span className="opacity-70"> · {totalProdutos} produtos</span>
            )}
          </span>
        </span>
        <span className="text-base font-bold">🖨️ Imprimir</span>
      </button>
    </div>
  )
}
