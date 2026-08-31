import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  classificar,
  COR_DO_NIVEL,
  formatarDataHora,
  ROTULO_DO_NIVEL,
} from '../domain/expiry'
import { criarEventoBaixa } from '../domain/labelData'
import type { TipoEvento } from '../domain/types'
import { db, registrarEvento } from '../lib/db'
import { membroSelecionado } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { SeletorMembro } from '../ui/SeletorMembro'

/**
 * Detalhe da etiqueta — o destino do QR impresso.
 *
 * Escanear com a câmera nativa do celular cai direto aqui, sem precisar abrir o
 * app antes. É onde a etiqueta é encerrada, então o estado da validade é a
 * primeira coisa visível: quem chegou aqui precisa decidir se o produto ainda
 * serve.
 */
export function EtiquetaDetalhe() {
  const { labelId } = useParams()
  const navegar = useNavigate()
  const { orgId } = useSessao()

  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState<'consumida' | 'descartada' | null>(null)
  const [salvando, setSalvando] = useState(false)

  const etiqueta = useLiveQuery(
    async () => (labelId ? db.labels.get(labelId) : undefined),
    [labelId],
  )

  const eventos = useLiveQuery(
    async () => {
      if (!labelId) return []
      const todos = await db.label_events.where('label_id').equals(labelId).toArray()
      return todos.sort((a, b) => b.ocorrido_em.localeCompare(a.ocorrido_em))
    },
    [labelId],
    [],
  )

  async function darBaixa(tipo: 'consumida' | 'descartada') {
    if (!etiqueta || salvando) return
    setSalvando(true)

    const evento = criarEventoBaixa(etiqueta, tipo, {
      motivo,
      membroId,
      membroNome,
    })
    await registrarEvento(evento, tipo)

    setSalvando(false)
    setConfirmando(null)
    setMotivo('')
  }

  if (etiqueta === undefined) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  if (etiqueta === null || !etiqueta) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-5xl">🔍</p>
        <h1 className="mt-4 text-xl font-bold">Etiqueta não encontrada</h1>
        <p className="mt-2 text-slate-500">
          Ela pode ter sido impressa em outro aparelho e ainda não ter
          sincronizado com este.
        </p>
        <Link to="/escanear" className="btn-secundario mt-6 inline-flex">
          Voltar
        </Link>
      </div>
    )
  }

  const situacao = classificar(etiqueta.expires_at)
  const ativa = etiqueta.status === 'ativa'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className={`${COR_DO_NIVEL[situacao.nivel]} mb-5 rounded-2xl p-5 text-white`}>
        <p className="text-sm font-semibold uppercase tracking-wide opacity-90">
          {ativa ? ROTULO_DO_NIVEL[situacao.nivel] : rotuloStatus(etiqueta.status)}
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          {etiqueta.produto_snapshot}
        </h1>
        <p className="mt-1 text-lg opacity-90">{situacao.descricao}</p>
      </div>

      <dl className="cartao mb-5 divide-y divide-slate-100">
        <Linha rotulo="Validade" valor={formatarDataHora(etiqueta.expires_at)} />
        <Linha rotulo="Aberto em" valor={formatarDataHora(etiqueta.opened_at)} />
        <Linha rotulo="Fornecedor" valor={etiqueta.fornecedor_snapshot ?? '—'} />
        <Linha rotulo="Pasta" valor={etiqueta.pasta_snapshot ?? '—'} />
        <Linha rotulo="Lote" valor={etiqueta.lote ?? '—'} />
        <Linha rotulo="Impresso por" valor={etiqueta.printed_by_snapshot ?? '—'} />
        <Linha rotulo="Código" valor={etiqueta.short_code} mono />
      </dl>

      {ativa && (
        <section className="mb-6">
          <h2 className="rotulo">Responsável</h2>
          <div className="mb-4">
            <SeletorMembro
              orgId={orgId}
              selecionado={membroId}
              aoSelecionar={(id, nome) => {
                setMembroId(id)
                setMembroNome(nome)
              }}
            />
          </div>

          {confirmando ? (
            <div className="cartao p-4">
              <p className="mb-3 font-semibold">
                Confirmar{' '}
                {confirmando === 'consumida' ? 'consumo' : 'descarte'} desta etiqueta?
              </p>
              {confirmando === 'descartada' && (
                <>
                  <label className="rotulo" htmlFor="motivo">
                    Motivo
                  </label>
                  <input
                    id="motivo"
                    className="campo mb-3"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Vencido, sobra, avaria…"
                  />
                </>
              )}
              <div className="flex gap-2">
                <button
                  className="btn-primario flex-1"
                  onClick={() => void darBaixa(confirmando)}
                  disabled={salvando}
                >
                  {salvando ? 'Registrando…' : 'Confirmar'}
                </button>
                <button className="btn-secundario" onClick={() => setConfirmando(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <button
                className="btn-primario"
                onClick={() => setConfirmando('consumida')}
              >
                ✓ Consumido
              </button>
              <button
                className="btn-perigo"
                onClick={() => {
                  // O motivo mais comum de descarte é o vencimento; pré-preencher
                  // poupa digitação justamente quando a pessoa está com pressa.
                  setMotivo(situacao.nivel === 'vencido' ? 'Vencido' : '')
                  setConfirmando('descartada')
                }}
              >
                🗑 Descartar
              </button>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Histórico
        </h2>
        <ol className="cartao divide-y divide-slate-100">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex items-baseline gap-3 px-4 py-3">
              <span className="font-semibold">{rotuloEvento(evento.tipo)}</span>
              <span className="flex-1 text-sm text-slate-500">
                {evento.member_snapshot ?? '—'}
                {evento.motivo && ` · ${evento.motivo}`}
              </span>
              <span className="text-xs text-slate-400">
                {formatarDataHora(evento.ocorrido_em)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <button className="btn-secundario mt-6 w-full" onClick={() => navegar("/escanear")}>
        Escanear outra
      </button>
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
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-slate-500">{rotulo}</dt>
      <dd className={`text-right font-semibold ${mono ? 'font-mono tracking-wider' : ''}`}>
        {valor}
      </dd>
    </div>
  )
}

function rotuloStatus(status: string): string {
  return status === 'consumida' ? 'Consumida' : 'Descartada'
}

const ROTULOS_EVENTO: Record<TipoEvento, string> = {
  impressa: 'Impressa',
  reimpressa: 'Reimpressa',
  consumida: 'Consumida',
  descartada: 'Descartada',
  vencida_auto: 'Venceu',
}

function rotuloEvento(tipo: TipoEvento): string {
  return ROTULOS_EVENTO[tipo] ?? tipo
}
