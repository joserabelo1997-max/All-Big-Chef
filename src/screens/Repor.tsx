import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { situacaoDeEstoque } from '../domain/estoque'
import type { Fornecedor, Produto } from '../domain/types'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'
import {
  linkDoPedido,
  MENSAGEM_PADRAO,
  montarMensagem,
  type ItemDoPedido,
} from '../lib/whatsapp'

import { formatar } from './Estoque'

/**
 * O que está no mínimo ou abaixo, agrupado por fornecedor.
 *
 * Agrupado por fornecedor porque é assim que o pedido é feito de verdade: uma
 * conversa por fornecedor, com tudo o que se compra dele. Uma lista plana
 * obrigaria a pessoa a separar os itens de cabeça, toda semana.
 *
 * O botão só ABRE o WhatsApp com a mensagem pronta. O pedido não é registrado,
 * como você pediu — quem confirma o que foi combinado é a conversa, e um
 * registro que ninguém confirma vira um histórico que mente.
 */
export function Repor() {
  const { orgId, carregando } = useSessao()
  const navegar = useNavigate()

  const configuracoes = useLiveQuery(
    async () => (orgId ? db.org_settings.get(orgId) : undefined),
    [orgId],
  )

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
      return db.suppliers.where('org_id').equals(orgId).toArray()
    },
    [orgId],
    [],
  )

  const grupos = useMemo(() => {
    const porFornecedor = new Map<
      string,
      { fornecedor: Fornecedor | null; itens: { produto: Produto; pedido: ItemDoPedido[] }[] }
    >()

    for (const produto of produtos) {
      const situacao = situacaoDeEstoque(produto)
      if (!situacao.abaixo) continue

      // A quantidade sugerida é o que falta para voltar ao mínimo. É o piso do
      // pedido, não o pedido inteiro — quem compra ajusta na conversa.
      const pedido: ItemDoPedido[] = []
      if (situacao.abaixoKg) {
        pedido.push({ nome: produto.nome, quantidade: situacao.faltaKg || 1, unidade: 'kg' })
      }
      if (situacao.abaixoUn) {
        pedido.push({ nome: produto.nome, quantidade: situacao.faltaUn || 1, unidade: 'un' })
      }

      const chave = produto.supplier_id ?? 'sem-fornecedor'
      const grupo = porFornecedor.get(chave)
      const fornecedor = fornecedores.find((f) => f.id === produto.supplier_id) ?? null

      if (grupo) grupo.itens.push({ produto, pedido })
      else porFornecedor.set(chave, { fornecedor, itens: [{ produto, pedido }] })
    }

    return [...porFornecedor.values()].sort((a, b) =>
      (a.fornecedor?.nome ?? 'zzz').localeCompare(b.fornecedor?.nome ?? 'zzz', 'pt-BR'),
    )
  }, [produtos, fornecedores])

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  const modelo = configuracoes?.mensagem_pedido || MENSAGEM_PADRAO

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque')}>
        ‹ Estoque
      </button>

      <h1 className="text-2xl font-bold">Repor</h1>
      <p className="mb-5 text-sm text-slate-500">
        O que chegou no mínimo, agrupado por fornecedor.
      </p>

      {grupos.length === 0 ? (
        <p className="cartao p-6 text-center text-slate-500">
          Nada para repor. Tudo acima do mínimo. 👍
        </p>
      ) : (
        <div className="grid gap-4">
          {grupos.map(({ fornecedor, itens }) => {
            const doPedido = itens.flatMap((i) => i.pedido)
            const mensagem = montarMensagem(
              fornecedor?.nome ?? 'tudo bem',
              doPedido,
              modelo,
            )

            return (
              <section key={fornecedor?.id ?? 'sem-fornecedor'} className="cartao p-4">
                <h2 className="font-bold">{fornecedor?.nome ?? 'Sem fornecedor definido'}</h2>

                <ul className="my-3 grid gap-1">
                  {itens.map(({ produto, pedido }) => (
                    <li key={produto.id} className="flex items-baseline gap-2 text-sm">
                      <span className="flex-1">{produto.nome}</span>
                      <span className="font-semibold tabular-nums">
                        {pedido
                          .map((p) => `${formatar(p.quantidade)} ${p.unidade}`)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>

                {fornecedor ? (
                  <>
                    <a
                      className="btn-primario w-full"
                      href={linkDoPedido(fornecedor.telefone, mensagem)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      💬 Pedir no WhatsApp
                    </a>
                    {!fornecedor.telefone && (
                      <p className="mt-2 text-xs text-slate-500">
                        Sem telefone cadastrado — o WhatsApp abre para escolher o
                        contato.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Defina um fornecedor no cadastro destes produtos para montar o
                    pedido.
                  </p>
                )}
              </section>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        O pedido não é registrado no sistema — o app só abre a conversa com a
        mensagem pronta.
      </p>
    </div>
  )
}
