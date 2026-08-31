import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { formatarDataHora } from '../domain/expiry'
import { db, salvarESincronizar } from '../lib/db'

import { formatar } from './Estoque'

/**
 * Destino do QR de inventário — a tela que abre ao escanear `#/i/<uuid>`.
 *
 * Não mostra validade nem alerta de vencimento, e não tem como mostrar: a
 * etiqueta de inventário não carrega data nenhuma. Ela responde a uma pergunta
 * só: este pote ainda está no estoque?
 *
 * Marcar como consumida é o que faz a contagem fechar — e é reversível, porque
 * escanear o pote errado no meio de uma conferência de freezer acontece.
 */
export function EtiquetaInventarioDetalhe() {
  const { tagId } = useParams()
  const [salvando, setSalvando] = useState(false)

  const etiqueta = useLiveQuery(
    async () => (tagId ? db.inventory_tags.get(tagId) : undefined),
    [tagId],
  )

  const produto = useLiveQuery(
    async () => (etiqueta?.product_id ? db.products.get(etiqueta.product_id) : undefined),
    [etiqueta?.product_id],
  )

  if (!etiqueta) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-5xl">🔍</p>
        <h1 className="mt-4 text-xl font-bold">Etiqueta de inventário não encontrada</h1>
        <p className="mt-2 text-slate-500">
          Ela pode ter sido impressa em outro aparelho e ainda não ter
          sincronizado com este.
        </p>
        <Link to="/estoque" className="btn-secundario mt-6 inline-flex">
          Ir para o estoque
        </Link>
      </div>
    )
  }

  const emEstoque = etiqueta.status === 'em_estoque'

  async function alternar() {
    if (!etiqueta || salvando) return
    setSalvando(true)
    try {
      await salvarESincronizar('inventory_tags', {
        ...etiqueta,
        status: emEstoque ? 'consumida' : 'em_estoque',
        updated_at: new Date().toISOString(),
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div
        className={`mb-5 rounded-2xl px-4 py-5 text-center text-white ${
          emEstoque ? 'bg-validade-ok' : 'bg-slate-400'
        }`}
      >
        <span className="block text-sm font-semibold uppercase tracking-wide opacity-90">
          Etiqueta de inventário
        </span>
        <span className="block text-2xl font-bold">
          {emEstoque ? 'Em estoque' : 'Consumida'}
        </span>
      </div>

      <h1 className="text-2xl font-bold">{etiqueta.produto_snapshot}</h1>

      <dl className="cartao mt-4 divide-y divide-slate-100">
        {etiqueta.quantidade != null && (
          <Linha
            rotulo="Quantidade"
            valor={`${formatar(etiqueta.quantidade)} ${etiqueta.unidade ?? ''}`.trim()}
          />
        )}
        {etiqueta.lote && <Linha rotulo="Lote" valor={etiqueta.lote} />}
        <Linha rotulo="Impressa em" valor={formatarDataHora(etiqueta.printed_at)} />
        <Linha rotulo="Por" valor={etiqueta.printed_by_snapshot ?? '—'} />
        <Linha rotulo="Código" valor={etiqueta.short_code} mono />
      </dl>

      {/* Nenhuma validade aqui, de propósito: esta etiqueta serve à contagem, e
          o controle de validade vive na etiqueta própria dele. */}
      <p className="mt-3 text-xs text-slate-500">
        Etiqueta de contagem — não controla validade. O que precisa de validade
        leva a etiqueta de validade, com o QR próprio dela.
      </p>

      <button
        className={emEstoque ? 'btn-primario mt-5 w-full' : 'btn-secundario mt-5 w-full'}
        onClick={() => void alternar()}
        disabled={salvando}
      >
        {salvando
          ? 'Registrando…'
          : emEstoque
            ? '✓ Marcar como consumida'
            : 'Voltar para o estoque'}
      </button>

      {produto && (
        <Link to={`/estoque/${produto.id}`} className="btn-secundario mt-2 w-full">
          Ver {produto.nome} no estoque
        </Link>
      )}
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string
  valor: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-3">
      <dt className="w-28 shrink-0 text-sm text-slate-500">{rotulo}</dt>
      <dd className={`flex-1 font-semibold ${mono ? 'font-mono tracking-wide' : ''}`}>
        {valor}
      </dd>
    </div>
  )
}
