import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { formatarDataHora } from '../domain/expiry'
import type { Produto, RequisicaoEstoque, UnidadeMovimento } from '../domain/types'
import { db, registrarMovimento, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { SeletorMembro } from '../ui/SeletorMembro'

import { formatar } from './Estoque'

/**
 * Requisições de retirada do estoque, com aprovação.
 *
 * Quem prepara pede; quem tem permissão libera. Duas decisões sustentam a tela:
 *
 * 1. **A saída só existe na aprovação.** Pedir não mexe no saldo. O saldo é o
 *    que está na prateleira, e o pedido ainda não tirou nada de lá.
 * 2. **Quem pode aprovar aprova o próprio pedido num toque.** Sem isso, o
 *    preparo esperaria o responsável aparecer no meio do serviço — e a saída
 *    acabaria sendo lançada de qualquer jeito, ou não lançada.
 *
 * `movimento_id` na requisição impede que aprovar duas vezes (dois aparelhos,
 * dois toques) tire o produto duas vezes do estoque.
 */
export function Requisicoes() {
  const { orgId, carregando } = useSessao()
  const navegar = useNavigate()

  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [ocupada, setOcupada] = useState<string | null>(null)

  const requisicoes = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.stock_requests.where('org_id').equals(orgId).toArray()
      return todas
        .filter((r) => !r.deleted_at)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    },
    [orgId],
    [],
  )

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos
        .filter((p) => !p.deleted_at && p.ativo && p.controla_estoque)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  const membro = useLiveQuery(
    async () => (membroId ? db.team_members.get(membroId) : undefined),
    [membroId],
  )

  const podeAprovar = Boolean(membro?.pode_aprovar)

  const { pendentes, decididas } = useMemo(
    () => ({
      pendentes: requisicoes.filter((r) => r.status === 'pendente'),
      decididas: requisicoes.filter((r) => r.status !== 'pendente').slice(0, 20),
    }),
    [requisicoes],
  )

  const nomeDoProduto = useMemo(() => {
    const mapa = new Map(produtos.map((p) => [p.id, p.nome]))
    return (id: string) => mapa.get(id) ?? 'Produto removido'
  }, [produtos])

  async function pedir(dados: {
    produto: Produto
    quantidade: number
    unidade: UnidadeMovimento
    motivo: string
    aprovarJa: boolean
  }) {
    if (!orgId) return
    const agora = new Date().toISOString()

    const requisicao: RequisicaoEstoque = {
      id: novoId(),
      org_id: orgId,
      product_id: dados.produto.id,
      quantidade: dados.quantidade,
      unidade: dados.unidade,
      motivo: dados.motivo.trim() || null,
      solicitante_id: membroId,
      solicitante_snapshot: membroNome,
      status: 'pendente',
      created_at: agora,
      updated_at: agora,
    }

    await salvarESincronizar('stock_requests', requisicao)
    setCriando(false)

    // Quem tem permissão libera o próprio pedido no mesmo gesto: o controle
    // continua existindo (fica registrado quem pediu e quem liberou), mas o
    // preparo não para esperando alguém aparecer.
    if (dados.aprovarJa && podeAprovar) await aprovar(requisicao)
  }

  async function aprovar(requisicao: RequisicaoEstoque) {
    if (!orgId || ocupada) return

    // Relê antes de decidir: o outro aparelho pode ter aprovado enquanto esta
    // tela estava aberta, e `movimento_id` é o que impede a saída em dobro.
    const atual = await db.stock_requests.get(requisicao.id)
    if (!atual || atual.status !== 'pendente' || atual.movimento_id) return

    setOcupada(requisicao.id)
    const agora = new Date().toISOString()
    const movimentoId = novoId()

    try {
      await registrarMovimento({
        id: movimentoId,
        org_id: orgId,
        product_id: atual.product_id,
        tipo: 'saida',
        quantidade: atual.quantidade,
        unidade: atual.unidade,
        member_id: atual.solicitante_id ?? null,
        member_snapshot: atual.solicitante_snapshot ?? null,
        motivo: atual.motivo ?? 'Requisição aprovada',
        ocorrido_em: agora,
        created_at: agora,
      })

      await salvarESincronizar('stock_requests', {
        ...atual,
        status: 'aprovada',
        decidido_por_id: membroId,
        decidido_por_snapshot: membroNome,
        decidido_em: agora,
        movimento_id: movimentoId,
        updated_at: agora,
      })
    } finally {
      setOcupada(null)
    }
  }

  async function recusar(requisicao: RequisicaoEstoque) {
    const atual = await db.stock_requests.get(requisicao.id)
    if (!atual || atual.status !== 'pendente') return

    const agora = new Date().toISOString()
    await salvarESincronizar('stock_requests', {
      ...atual,
      status: 'recusada',
      decidido_por_id: membroId,
      decidido_por_snapshot: membroNome,
      decidido_em: agora,
      updated_at: agora,
    })
  }

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque')}>
        ‹ Estoque
      </button>

      <h1 className="text-2xl font-bold">Requisições</h1>
      <p className="mb-5 text-sm text-slate-500">
        Retirada do estoque com liberação do responsável.
      </p>

      <section className="mb-5">
        <span className="rotulo block">Quem está pedindo</span>
        <SeletorMembro
          orgId={orgId}
          selecionado={membroId}
          aoSelecionar={(id, nome) => {
            setMembroId(id)
            setMembroNome(nome)
            selecionarMembro(id)
          }}
        />
        {membro && (
          <p className="mt-1 text-xs text-slate-500">
            {podeAprovar
              ? 'Você pode liberar requisições — inclusive a sua.'
              : 'Seus pedidos ficam pendentes até alguém com permissão liberar.'}
          </p>
        )}
      </section>

      {criando ? (
        <FormularioRequisicao
          produtos={produtos}
          podeAprovar={podeAprovar}
          aoCancelar={() => setCriando(false)}
          aoConfirmar={pedir}
        />
      ) : (
        <button
          className="btn-primario mb-6 w-full"
          onClick={() => setCriando(true)}
          disabled={produtos.length === 0}
        >
          + Nova requisição
        </button>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Pendentes ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <p className="cartao p-6 text-center text-slate-500">
            Nenhuma requisição esperando liberação.
          </p>
        ) : (
          <ul className="grid gap-2">
            {pendentes.map((r) => (
              <li key={r.id} className="cartao p-4">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 font-semibold">{nomeDoProduto(r.product_id)}</span>
                  <span className="font-bold tabular-nums">
                    {formatar(r.quantidade)} {r.unidade}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {r.solicitante_snapshot ?? 'Sem responsável'}
                  {r.motivo && ` · ${r.motivo}`} · {formatarDataHora(r.created_at)}
                </p>

                {podeAprovar ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn-primario flex-1"
                      onClick={() => void aprovar(r)}
                      disabled={ocupada === r.id}
                    >
                      {ocupada === r.id ? 'Liberando…' : '✓ Liberar'}
                    </button>
                    <button className="btn-secundario" onClick={() => void recusar(r)}>
                      Recusar
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Aguardando liberação.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {decididas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Decididas
          </h2>
          <ul className="cartao divide-y divide-slate-100">
            {decididas.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 px-4 py-3">
                <span
                  className={`font-semibold ${
                    r.status === 'aprovada' ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {r.status === 'aprovada' ? '✓' : '✕'}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{nomeDoProduto(r.product_id)}</span>
                  <span className="block text-sm text-slate-500">
                    {formatar(r.quantidade)} {r.unidade} ·{' '}
                    {r.solicitante_snapshot ?? '—'}
                    {r.decidido_por_snapshot && ` · por ${r.decidido_por_snapshot}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {r.decidido_em && formatarDataHora(r.decidido_em)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FormularioRequisicao({
  produtos,
  podeAprovar,
  aoCancelar,
  aoConfirmar,
}: {
  produtos: Produto[]
  podeAprovar: boolean
  aoCancelar: () => void
  aoConfirmar: (dados: {
    produto: Produto
    quantidade: number
    unidade: UnidadeMovimento
    motivo: string
    aprovarJa: boolean
  }) => Promise<void>
}) {
  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? '')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState<UnidadeMovimento>('un')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const produto = produtos.find((p) => p.id === produtoId)
  const unidades: UnidadeMovimento[] =
    produto?.unidade_estoque === 'ambos'
      ? ['kg', 'un']
      : [(produto?.unidade_estoque as UnidadeMovimento) ?? 'un']

  // Se o produto só conta de um jeito, a unidade escolhida segue esse jeito.
  const unidadeEfetiva = unidades.includes(unidade) ? unidade : (unidades[0] ?? 'un')

  const numero = Number(quantidade.replace(',', '.'))
  const valida = Boolean(produto) && Number.isFinite(numero) && numero > 0

  return (
    <div className="cartao mb-6 p-4">
      <h2 className="mb-3 text-lg font-bold">Nova requisição</h2>

      <label className="rotulo" htmlFor="produto-req">
        Produto
      </label>
      <select
        id="produto-req"
        className="campo mb-3"
        value={produtoId}
        onChange={(e) => setProdutoId(e.target.value)}
      >
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="rotulo" htmlFor="qtd-req">
            Quantidade
          </label>
          <input
            id="qtd-req"
            className="campo text-lg"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="0"
          />
        </div>
        {unidades.length > 1 && (
          <div>
            <span className="rotulo block">Unidade</span>
            <div className="flex gap-1">
              {unidades.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  className={[
                    'min-h-toque w-14 rounded-xl border-2 font-semibold transition',
                    unidadeEfetiva === u
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <label className="rotulo" htmlFor="motivo-req">
        Para quê <span className="font-normal">(opcional)</span>
      </label>
      <input
        id="motivo-req"
        className="campo mb-4"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ex.: mise en place do jantar"
      />

      <div className="flex gap-2">
        <button
          className="btn-primario flex-1"
          disabled={!valida || salvando}
          onClick={() => {
            if (!produto) return
            setSalvando(true)
            void aoConfirmar({
              produto,
              quantidade: numero,
              unidade: unidadeEfetiva,
              motivo,
              aprovarJa: podeAprovar,
            }).finally(() => setSalvando(false))
          }}
        >
          {salvando ? 'Enviando…' : podeAprovar ? 'Pedir e liberar' : 'Pedir'}
        </button>
        <button className="btn-secundario" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>

      {podeAprovar && (
        <p className="mt-2 text-xs text-slate-500">
          Fica registrado quem pediu e quem liberou, mesmo sendo a mesma pessoa.
        </p>
      )}
    </div>
  )
}
