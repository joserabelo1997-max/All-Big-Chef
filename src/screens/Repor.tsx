import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { situacaoDeEstoque } from '../domain/estoque'
import type { Produto } from '../domain/types'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

/**
 * Por qual fornecedor começar o pedido.
 *
 * Agrupado por fornecedor porque é assim que o pedido é feito de verdade: uma
 * conversa por fornecedor, com tudo o que se compra dele. Uma lista plana
 * obrigaria a pessoa a separar os itens de cabeça, toda semana.
 *
 * Esta tela só ESCOLHE; quem monta o pedido é `PedidoFornecedor`. Antes ela
 * fazia as duas coisas e mandava tudo o que estava no mínimo, sem escolha —
 * mas o pedido de verdade tem itens somados e itens tirados, e isso precisa de
 * uma tela com espaço.
 */
export function Repor() {
  const { orgId, carregando } = useSessao()
  const navegar = useNavigate()

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos.filter((p) => !p.deleted_at && p.ativo && p.controla_estoque)
    },
    [orgId],
    [],
  )

  const fornecedores = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.suppliers.where('org_id').equals(orgId).toArray()
      return todos.filter((f) => !f.deleted_at && f.ativo)
    },
    [orgId],
    [],
  )

  const grupos = useMemo(() => {
    const contagem = new Map<string, { total: number; faltando: number }>()

    for (const produto of produtos) {
      if (!produto.supplier_id) continue
      const atual = contagem.get(produto.supplier_id) ?? { total: 0, faltando: 0 }
      atual.total++
      if (situacaoDeEstoque(produto).abaixo) atual.faltando++
      contagem.set(produto.supplier_id, atual)
    }

    return fornecedores
      .map((fornecedor) => ({
        fornecedor,
        ...(contagem.get(fornecedor.id) ?? { total: 0, faltando: 0 }),
      }))
      .filter((g) => g.total > 0)
      .sort(
        (a, b) =>
          b.faltando - a.faltando || a.fornecedor.nome.localeCompare(b.fornecedor.nome, 'pt-BR'),
      )
  }, [produtos, fornecedores])

  const semFornecedor = produtos.filter(
    (p) => !p.supplier_id && situacaoDeEstoque(p).abaixo,
  )

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque')}>
        ‹ Estoque
      </button>

      <h1 className="text-2xl font-bold">Repor</h1>
      <p className="mb-5 text-sm text-slate-500">
        Escolha o fornecedor para montar o pedido.
      </p>

      {grupos.length === 0 ? (
        <div className="cartao p-6 text-center">
          <p className="text-slate-500">
            Nenhum produto está ligado a um fornecedor ainda. Sem isso não dá para
            montar pedido.
          </p>
          <Link to="/config/fornecedores" className="btn-primario mt-4 inline-flex">
            Ligar produtos a um fornecedor
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {grupos.map(({ fornecedor, total, faltando }) => (
            <li key={fornecedor.id}>
              <Link
                to={`/estoque/repor/${fornecedor.id}`}
                className={`cartao flex items-center gap-3 p-4 ${faltando > 0 ? 'border-amber-300' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{fornecedor.nome}</span>
                  <span className="block text-sm text-slate-500">
                    {total} {total === 1 ? 'produto' : 'produtos'}
                    {faltando > 0 && ` · ${faltando} no mínimo`}
                  </span>
                </span>
                {faltando > 0 && (
                  <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                    repor
                  </span>
                )}
                <span aria-hidden className="text-slate-300">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {semFornecedor.length > 0 && <SemFornecedor produtos={semFornecedor} />}
    </div>
  )
}

/**
 * O que está faltando mas não tem de quem comprar.
 *
 * Some da tela de pedido por não ter fornecedor, e sumir em silêncio é como um
 * item fica esquecido até acabar de vez. Aqui ele aparece nomeado, com o
 * caminho para o conserto.
 */
function SemFornecedor({ produtos }: { produtos: Produto[] }) {
  return (
    <section className="mt-6">
      <h2 className="rotulo text-amber-800">Faltando, mas sem fornecedor</h2>
      <ul className="mt-1 grid gap-2">
        {produtos.map((produto) => (
          <li key={produto.id}>
            <Link
              to={`/produtos/${produto.id}`}
              className="cartao flex items-center gap-3 border-amber-300 bg-amber-50 p-3"
            >
              <span className="flex-1 truncate font-semibold text-amber-900">
                {produto.nome}
              </span>
              <span className="text-xs text-amber-800">definir fornecedor ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

