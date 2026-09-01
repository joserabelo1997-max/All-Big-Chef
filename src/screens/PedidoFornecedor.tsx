import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { mediaDoPedido, situacaoDeEstoque } from '../domain/estoque'
import type { MovimentoEstoque, Produto, UnidadeMovimento } from '../domain/types'
import { lerTextosDoPedido } from '../lib/configuracoes'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'
import { linkDoPedido, montarPedido, type ItemDoPedido } from '../lib/whatsapp'

import { formatar } from './Estoque'

/**
 * Montar o pedido de um fornecedor.
 *
 * ## Por que TODOS os produtos, e não só o que está faltando
 *
 * A tela antiga listava apenas o que estava no mínimo e mandava tudo, sem
 * escolha. Mas o pedido de verdade não é uma consequência automática do saldo:
 * quem liga para o fornecedor aproveita o frete e soma o que vai acabar semana
 * que vem, e tira o que ainda tem de sobra. Por isso aqui aparece tudo o que se
 * compra dele, com o que está no mínimo já marcado — desmarcar é não pedir.
 *
 * ## Por que a quantidade é a média, e não o que falta para o mínimo
 *
 * "O que falta para o mínimo" repõe só até o ponto de pedido, e a cozinha volta
 * ao mínimo na semana seguinte. Ninguém compra assim: compra-se a caixa, o
 * saco, o que costuma durar. `mediaDoPedido` olha as entradas anteriores.
 * Na primeira compra não há história, e aí cai no que falta.
 */

/** Uma linha da tela: um produto numa das unidades que ele acompanha. */
interface Linha {
  produto: Produto
  unidade: UnidadeMovimento
  /** Chave estável para marcar/desmarcar, já que um produto pode ter duas linhas. */
  chave: string
  saldo: number
  minimo: number
  abaixo: boolean
  /** O que vem preenchido: a média, ou o que falta quando não há histórico. */
  sugerida: number
  /** Verdadeiro quando a sugestão veio do histórico, e não do mínimo. */
  daMedia: boolean
}

export function PedidoFornecedor() {
  const { fornecedorId } = useParams()
  const navegar = useNavigate()
  const { orgId, carregando } = useSessao()

  const fornecedor = useLiveQuery(
    async () => (fornecedorId ? db.suppliers.get(fornecedorId) : undefined),
    [fornecedorId],
  )

  const textos = useLiveQuery(
    async () => (orgId ? lerTextosDoPedido(orgId) : undefined),
    [orgId],
  )

  const dados = useLiveQuery(
    async () => {
      if (!orgId || !fornecedorId) return { produtos: [], movimentos: [] }

      const todos = await db.products.where('org_id').equals(orgId).toArray()
      const produtos = todos.filter(
        (p) =>
          !p.deleted_at && p.ativo && p.controla_estoque && p.supplier_id === fornecedorId,
      )

      const movimentos = await db.stock_movements.where('org_id').equals(orgId).toArray()
      return { produtos, movimentos }
    },
    [orgId, fornecedorId],
    { produtos: [] as Produto[], movimentos: [] as MovimentoEstoque[] },
  )

  const linhas = useMemo<Linha[]>(() => {
    const porProduto = new Map<string, MovimentoEstoque[]>()
    for (const m of dados.movimentos) {
      const lista = porProduto.get(m.product_id)
      if (lista) lista.push(m)
      else porProduto.set(m.product_id, [m])
    }

    const montadas: Linha[] = []

    for (const produto of dados.produtos) {
      const situacao = situacaoDeEstoque(produto)
      const historico = porProduto.get(produto.id) ?? []

      const unidades: UnidadeMovimento[] =
        produto.unidade_estoque === 'ambos'
          ? ['kg', 'un']
          : [produto.unidade_estoque === 'kg' ? 'kg' : 'un']

      for (const unidade of unidades) {
        const media = mediaDoPedido(historico, unidade)
        const falta = unidade === 'kg' ? situacao.faltaKg : situacao.faltaUn
        const abaixo = unidade === 'kg' ? situacao.abaixoKg : situacao.abaixoUn

        montadas.push({
          produto,
          unidade,
          chave: `${produto.id}:${unidade}`,
          saldo: unidade === 'kg' ? situacao.saldoKg : situacao.saldoUn,
          minimo:
            unidade === 'kg'
              ? (produto.estoque_minimo_kg ?? 0)
              : (produto.estoque_minimo_un ?? 0),
          abaixo,
          // Sem média e sem falta ainda sobra 1: uma linha marcada com
          // quantidade zero mandaria "• Farinha: 0 kg" para o fornecedor.
          sugerida: media ?? (falta > 0 ? falta : 1),
          daMedia: media != null,
        })
      }
    }

    // O que está faltando primeiro: é o que trouxe a pessoa até aqui.
    return montadas.sort(
      (a, b) =>
        Number(b.abaixo) - Number(a.abaixo) ||
        a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'),
    )
  }, [dados])

  /**
   * Marcações e quantidades ajustadas à mão.
   *
   * Guardadas separadas do padrão calculado para que recalcular (o saldo mudou
   * noutro aparelho, a média entrou) não apague o que a pessoa acabou de mexer.
   * `undefined` significa "ainda não mexi nisto", e não "desmarcado".
   */
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [mensagemEditada, setMensagemEditada] = useState<string | null>(null)

  const estaMarcada = (l: Linha) => marcadas[l.chave] ?? l.abaixo
  const quantidadeDe = (l: Linha) => quantidades[l.chave] ?? l.sugerida

  const itens = useMemo<ItemDoPedido[]>(
    () =>
      linhas
        .filter(estaMarcada)
        .map((l) => ({
          nome: l.produto.nome,
          quantidade: quantidadeDe(l),
          unidade: l.unidade,
        }))
        .filter((i) => i.quantidade > 0),
    [linhas, marcadas, quantidades],
  )

  const mensagemMontada = montarPedido(itens, textos ?? { abertura: '', fecho: '' })
  const mensagem = mensagemEditada ?? mensagemMontada

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  if (!fornecedor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-slate-500">Fornecedor não encontrado.</p>
        <button className="btn-secundario mt-4" onClick={() => navegar('/estoque/repor')}>
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque/repor')}>
        ‹ Repor
      </button>

      <h1 className="text-2xl font-bold">{fornecedor.nome}</h1>
      <p className="mb-5 text-sm text-slate-500">
        {itens.length === 0
          ? 'Marque o que quer pedir.'
          : `${itens.length} ${itens.length === 1 ? 'item marcado' : 'itens marcados'}`}
      </p>

      {linhas.length === 0 ? (
        <div className="cartao p-6 text-center">
          <p className="text-slate-500">
            Nenhum produto ligado a este fornecedor ainda. Ligue produtos a ele em
            Ajustes → Fornecedores.
          </p>
        </div>
      ) : (
        <ul className="mb-6 grid gap-2">
          {linhas.map((linha) => {
            const marcada = estaMarcada(linha)
            return (
              <li
                key={linha.chave}
                className={`cartao p-3 ${marcada ? 'border-slate-900' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-slate-900"
                    checked={marcada}
                    onChange={(e) =>
                      setMarcadas((atual) => ({ ...atual, [linha.chave]: e.target.checked }))
                    }
                    aria-label={`Pedir ${linha.produto.nome} em ${linha.unidade}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {linha.produto.nome}
                    </span>
                    <span className="block text-xs text-slate-500">
                      tem {formatar(linha.saldo)} {linha.unidade}
                      {linha.minimo > 0 && ` · mínimo ${formatar(linha.minimo)}`}
                      {linha.abaixo && ' · precisa repor'}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={linha.unidade === 'kg' ? '0.001' : '1'}
                    className="min-h-toque w-24 shrink-0 rounded-lg border-2 border-slate-300 px-2 text-right tabular-nums"
                    value={quantidadeDe(linha)}
                    disabled={!marcada}
                    onChange={(e) =>
                      setQuantidades((atual) => ({
                        ...atual,
                        [linha.chave]: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    aria-label={`Quantidade de ${linha.produto.nome} em ${linha.unidade}`}
                  />
                  <span className="w-6 shrink-0 text-sm text-slate-400">{linha.unidade}</span>
                </div>
                {marcada && (
                  <p className="mt-1 pl-9 text-xs text-slate-400">
                    {linha.daMedia
                      ? 'quanto você costuma pedir'
                      : 'sem histórico ainda — é o que falta para o mínimo'}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <section className="mb-4">
        <label className="rotulo" htmlFor="mensagem-do-pedido">
          Mensagem
        </label>
        {/* Editável aqui e agora, sem mexer no texto padrão: o ajuste de hoje
            ("pode entregar na sexta?") não é uma mudança permanente. */}
        <textarea
          id="mensagem-do-pedido"
          className="campo py-3 text-sm"
          rows={7}
          value={mensagem}
          onChange={(e) => setMensagemEditada(e.target.value)}
        />
        {mensagemEditada != null && (
          <button
            className="mt-1 text-xs text-slate-500 underline"
            onClick={() => setMensagemEditada(null)}
          >
            Desfazer as mudanças desta mensagem
          </button>
        )}
      </section>

      <a
        className={`btn-primario w-full ${itens.length === 0 ? 'pointer-events-none opacity-40' : ''}`}
        href={linkDoPedido(fornecedor.telefone, mensagem)}
        target="_blank"
        rel="noreferrer"
        aria-disabled={itens.length === 0}
      >
        💬 Pedir no WhatsApp
      </a>

      {!fornecedor.telefone && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Sem WhatsApp cadastrado — o app abre a lista de contatos para escolher.
        </p>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        O pedido não é registrado no sistema — o app só abre a conversa com a
        mensagem pronta.
      </p>
    </div>
  )
}
