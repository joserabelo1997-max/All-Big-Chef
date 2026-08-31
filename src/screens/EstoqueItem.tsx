import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  lotesPorValidade,
  situacaoDeEstoque,
  valorMedioPago,
  type LoteEmEstoque,
} from '../domain/estoque'
import { classificar, formatarData, formatarDataHora } from '../domain/expiry'
import type { TipoMovimento, UnidadeMovimento } from '../domain/types'
import { db, registrarMovimento } from '../lib/db'
import { novoId } from '../lib/ids'
import { membroSelecionado } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { SeletorMembro } from '../ui/SeletorMembro'

import { formatar } from './Estoque'

/**
 * Detalhe de um item do estoque.
 *
 * O saldo mostrado é o cacheado no produto, mas os lotes e o valor médio são
 * calculados aqui a partir do livro-razão — a verdade está sempre nos
 * movimentos, e o cache existe só para a lista abrir rápido.
 */
export function EstoqueItem() {
  const { produtoId } = useParams()
  const navegar = useNavigate()
  const { orgId } = useSessao()

  const [aberto, setAberto] = useState<TipoMovimento | null>(null)
  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)

  const produto = useLiveQuery(
    async () => (produtoId ? db.products.get(produtoId) : undefined),
    [produtoId],
  )

  const movimentos = useLiveQuery(
    async () => {
      if (!produtoId) return []
      const todos = await db.stock_movements.where('product_id').equals(produtoId).toArray()
      return todos.sort((a, b) => (a.ocorrido_em < b.ocorrido_em ? 1 : -1))
    },
    [produtoId],
    [],
  )

  const unidades = useMemo<UnidadeMovimento[]>(() => {
    if (!produto) return []
    if (produto.unidade_estoque === 'ambos') return ['kg', 'un']
    return [produto.unidade_estoque]
  }, [produto])

  const lotes = useMemo(() => {
    const porUnidade = new Map<UnidadeMovimento, LoteEmEstoque[]>()
    for (const u of unidades) {
      // Só lotes que ainda têm saldo: listar um lote zerado transformaria a
      // ordem de uso numa lista de histórico, que é outra coisa.
      porUnidade.set(
        u,
        lotesPorValidade(movimentos, u).filter((l) => l.restanteEstimado > 0),
      )
    }
    return porUnidade
  }, [movimentos, unidades])

  if (!produto) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-5xl">📦</p>
        <h1 className="mt-4 text-xl font-bold">Item não encontrado</h1>
        <Link to="/estoque" className="btn-secundario mt-6 inline-flex">
          Voltar ao estoque
        </Link>
      </div>
    )
  }

  const situacao = situacaoDeEstoque(produto)

  async function lancar(dados: {
    tipo: TipoMovimento
    quantidade: number
    unidade: UnidadeMovimento
    lote: string
    validade: string
    valorUnitario: number | null
    motivo: string
  }) {
    if (!orgId || !produto) return
    const agora = new Date().toISOString()

    await registrarMovimento({
      id: novoId(),
      org_id: orgId,
      product_id: produto.id,
      tipo: dados.tipo,
      quantidade: dados.quantidade,
      unidade: dados.unidade,
      lote: dados.lote.trim() || null,
      validade: dados.validade || null,
      valor_unitario: dados.valorUnitario,
      supplier_id: produto.supplier_id ?? null,
      member_id: membroId,
      member_snapshot: membroNome,
      motivo: dados.motivo.trim() || null,
      ocorrido_em: agora,
      created_at: agora,
    })

    setAberto(null)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque')}>
        ‹ Estoque
      </button>

      <h1 className="text-2xl font-bold">{produto.nome}</h1>

      <div className="mb-5 mt-3 grid gap-2">
        {unidades.map((u) => {
          const saldo = u === 'kg' ? situacao.saldoKg : situacao.saldoUn
          const minimo = u === 'kg' ? produto.estoque_minimo_kg : produto.estoque_minimo_un
          const abaixo = u === 'kg' ? situacao.abaixoKg : situacao.abaixoUn
          const medio = valorMedioPago(movimentos, u)

          return (
            <div
              key={u}
              className={`cartao p-4 ${abaixo ? 'border-amber-300 bg-amber-50' : ''}`}
            >
              <span className="block text-3xl font-bold tabular-nums">
                {formatar(saldo)}{' '}
                <span className="text-lg font-semibold text-slate-400">
                  {u === 'kg' ? 'kg' : 'un'}
                </span>
              </span>
              <span className="block text-sm text-slate-500">
                {minimo > 0 ? `mínimo ${formatar(minimo)}` : 'sem mínimo definido'}
                {medio != null && ` · médio pago ${moeda(medio)}`}
              </span>
              {abaixo && (
                <span className="mt-1 block text-sm font-semibold text-amber-800">
                  Faltam {formatar(u === 'kg' ? situacao.faltaKg : situacao.faltaUn)} para o
                  mínimo
                </span>
              )}
            </div>
          )
        })}
      </div>

      {aberto ? (
        <FormularioMovimento
          tipo={aberto}
          unidades={unidades}
          loteSugerido={produto.lote_atual ?? ''}
          orgId={orgId}
          membroId={membroId}
          aoSelecionarMembro={(id, nome) => {
            setMembroId(id)
            setMembroNome(nome)
          }}
          aoCancelar={() => setAberto(null)}
          aoConfirmar={lancar}
        />
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-2">
          <button className="btn-primario" onClick={() => setAberto('entrada')}>
            ↓ Entrada
          </button>
          <button className="btn-secundario" onClick={() => setAberto('saida')}>
            ↑ Saída
          </button>
          <button className="btn-secundario" onClick={() => setAberto('perda')}>
            🗑 Perda
          </button>
          <button className="btn-secundario" onClick={() => setAberto('ajuste')}>
            ✎ Ajuste
          </button>
        </div>
      )}

      {unidades.map((u) => {
        const doLote = lotes.get(u) ?? []
        if (doLote.length === 0) return null
        return (
          <section key={u} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Ordem de uso {unidades.length > 1 && `· ${u}`}
            </h2>
            {/* O que vence antes sai antes. Quando a saída não seguiu essa
                ordem, o restante estimado mostra o que DEVERIA ter saído. */}
            <ol className="cartao divide-y divide-slate-100">
              {doLote.map((lote, i) => (
                <li key={`${lote.lote}-${lote.validade}`} className="flex items-center gap-3 p-3">
                  <span className="w-6 shrink-0 text-center font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">
                      {lote.lote ? `Lote ${lote.lote}` : 'Sem lote'}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {lote.validade ? (
                        <>
                          vence {formatarData(lote.validade)} ·{' '}
                          {classificar(lote.validade).descricao}
                        </>
                      ) : (
                        'sem validade informada'
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatar(lote.restanteEstimado)} {u}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )
      })}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Movimentos
        </h2>
        {movimentos.length === 0 ? (
          <p className="cartao p-6 text-center text-slate-500">
            Nenhum movimento ainda. Comece dando entrada no que já está na
            prateleira.
          </p>
        ) : (
          <ol className="cartao divide-y divide-slate-100">
            {movimentos.slice(0, 30).map((m) => (
              <li key={m.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className={`font-semibold ${COR_DO_TIPO[m.tipo]}`}>
                  {SINAL[m.tipo]}
                  {formatar(m.quantidade)} {m.unidade}
                </span>
                <span className="flex-1 text-sm text-slate-500">
                  {ROTULO_DO_TIPO[m.tipo]}
                  {m.member_snapshot && ` · ${m.member_snapshot}`}
                  {m.motivo && ` · ${m.motivo}`}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatarDataHora(m.ocorrido_em)}
                </span>
              </li>
            ))}
          </ol>
        )}
        {movimentos.length > 30 && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Mostrando os 30 mais recentes de {movimentos.length}.
          </p>
        )}
      </section>
    </div>
  )
}

const ROTULO_DO_TIPO: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  perda: 'Perda',
}

const SINAL: Record<TipoMovimento, string> = {
  entrada: '+',
  ajuste: '+',
  saida: '−',
  perda: '−',
}

const COR_DO_TIPO: Record<TipoMovimento, string> = {
  entrada: 'text-emerald-700',
  ajuste: 'text-slate-700',
  saida: 'text-slate-700',
  perda: 'text-red-700',
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Formulário de um movimento.
 *
 * Muda de campo conforme o tipo, em vez de mostrar tudo sempre: lote, validade
 * e preço só fazem sentido numa entrada; motivo é obrigatório em ajuste e
 * perda, porque um número que ninguém consegue explicar na auditoria seguinte
 * não serve como controle.
 */
function FormularioMovimento({
  tipo,
  unidades,
  loteSugerido,
  orgId,
  membroId,
  aoSelecionarMembro,
  aoCancelar,
  aoConfirmar,
}: {
  tipo: TipoMovimento
  unidades: UnidadeMovimento[]
  loteSugerido: string
  orgId: string | null
  membroId: string | null
  aoSelecionarMembro: (id: string | null, nome: string | null) => void
  aoCancelar: () => void
  aoConfirmar: (dados: {
    tipo: TipoMovimento
    quantidade: number
    unidade: UnidadeMovimento
    lote: string
    validade: string
    valorUnitario: number | null
    motivo: string
  }) => Promise<void>
}) {
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState<UnidadeMovimento>(unidades[0] ?? 'un')
  const [lote, setLote] = useState(tipo === 'entrada' ? loteSugerido : '')
  const [validade, setValidade] = useState('')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const numero = Number(quantidade.replace(',', '.'))
  const quantidadeValida = Number.isFinite(numero) && numero > 0
  const motivoObrigatorio = tipo === 'ajuste' || tipo === 'perda'
  const podeConfirmar = quantidadeValida && (!motivoObrigatorio || motivo.trim().length > 0)

  return (
    <div className="cartao mb-6 p-4">
      <h2 className="mb-3 text-lg font-bold">{ROTULO_DO_TIPO[tipo]}</h2>

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="rotulo" htmlFor="quantidade">
            Quantidade
          </label>
          <input
            id="quantidade"
            className="campo text-lg"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="0"
            autoFocus
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
                    unidade === u
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

      {tipo === 'ajuste' && (
        <p className="mb-3 rounded-lg bg-slate-100 p-2 text-xs text-slate-600">
          O ajuste SOMA ao saldo. Para diminuir, use uma saída ou uma perda — o
          histórico precisa dizer para onde o produto foi.
        </p>
      )}

      {tipo === 'entrada' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="rotulo" htmlFor="lote-mov">
                Lote
              </label>
              <input
                id="lote-mov"
                className="campo font-mono"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                placeholder="Da embalagem"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="validade-mov">
                Validade
              </label>
              <input
                id="validade-mov"
                type="date"
                className="campo"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="rotulo" htmlFor="valor-mov">
              Preço por {unidade} <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="valor-mov"
              className="campo"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            <p className="mt-1 text-xs text-slate-500">
              Alimenta o valor médio pago, ponderado pela quantidade.
            </p>
          </div>
        </>
      )}

      <div className="mb-3">
        <label className="rotulo" htmlFor="motivo-mov">
          Motivo{' '}
          <span className="font-normal">{motivoObrigatorio ? '' : '(opcional)'}</span>
        </label>
        <input
          id="motivo-mov"
          className="campo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={
            tipo === 'perda' ? 'Vencido, quebrou, molhou…' : 'Contagem, correção…'
          }
        />
      </div>

      <div className="mb-4">
        <span className="rotulo block">Responsável</span>
        <SeletorMembro orgId={orgId} selecionado={membroId} aoSelecionar={aoSelecionarMembro} />
      </div>

      <div className="flex gap-2">
        <button
          className="btn-primario flex-1"
          disabled={!podeConfirmar || salvando}
          onClick={() => {
            setSalvando(true)
            void aoConfirmar({
              tipo,
              quantidade: numero,
              unidade,
              lote,
              validade,
              valorUnitario: valor.trim() ? Number(valor.replace(',', '.')) : null,
              motivo,
            }).finally(() => setSalvando(false))
          }}
        >
          {salvando ? 'Registrando…' : 'Confirmar'}
        </button>
        <button className="btn-secundario" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
