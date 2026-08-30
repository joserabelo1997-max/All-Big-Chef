import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  classificar,
  compararUrgencia,
  COR_DO_NIVEL,
  formatarData,
  type NivelValidade,
} from '../domain/expiry'
import type { Etiqueta } from '../domain/types'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

const FILTROS = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'vencidas', rotulo: 'Vencidas' },
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'vencendo', rotulo: 'Em breve' },
] as const

type Filtro = (typeof FILTROS)[number]['chave']

/** Quais níveis de validade cada filtro deixa passar. */
const NIVEIS_DO_FILTRO: Record<Filtro, NivelValidade[] | null> = {
  todas: null,
  vencidas: ['vencido'],
  hoje: ['hoje'],
  vencendo: ['atencao', 'hoje', 'vencido'],
}

/**
 * Etiquetas ativas, ordenadas por urgência.
 *
 * Mostra só as ativas: uma etiqueta consumida ou descartada não está mais
 * colada em nenhum pote, então não é ação pendente para ninguém. O histórico
 * dela continua acessível pelo QR e pelos relatórios.
 */
export function Etiquetas() {
  const { orgId, carregando } = useSessao()
  const [params, setParams] = useSearchParams()
  const filtro = (params.get('filtro') as Filtro | null) ?? 'todas'

  const etiquetas = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.labels.where('org_id').equals(orgId).toArray()
      return todas.filter((e) => !e.deleted_at && e.status === 'ativa')
    },
    [orgId],
    [],
  )

  const listadas = useMemo(() => {
    const permitidos = NIVEIS_DO_FILTRO[filtro]
    return etiquetas
      .map((etiqueta) => ({ etiqueta, situacao: classificar(etiqueta.expires_at) }))
      .filter(({ situacao }) => !permitidos || permitidos.includes(situacao.nivel))
      .sort((a, b) => compararUrgencia(a.situacao, b.situacao))
  }, [etiquetas, filtro])

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Etiquetas ativas</h1>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            onClick={() => setParams(f.chave === 'todas' ? {} : { filtro: f.chave })}
            className={[
              'min-h-[2.75rem] shrink-0 rounded-xl border-2 px-4 font-semibold transition',
              filtro === f.chave
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {listadas.length === 0 ? (
        <p className="cartao p-6 text-center text-slate-500">
          {filtro === 'todas'
            ? 'Nenhuma etiqueta ativa. Imprima a primeira pela aba Imprimir.'
            : 'Nada nesta faixa — tudo em dia por aqui.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {listadas.map(({ etiqueta, situacao }) => (
            <li key={etiqueta.id}>
              <Link
                to={`/l/${etiqueta.id}`}
                className="cartao flex items-stretch gap-0 overflow-hidden"
              >
                {/* Faixa de cor à esquerda: dá para varrer a lista pela cor sem
                    ler nenhum texto, que é como se usa com o pote na mão. */}
                <span className={`w-2 shrink-0 ${COR_DO_NIVEL[situacao.nivel]}`} />
                <span className="flex flex-1 items-center gap-3 p-4">
                  <span className="flex-1">
                    <span className="block font-semibold leading-tight">
                      {etiqueta.produto_snapshot}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {situacao.descricao} · {formatarData(etiqueta.expires_at)}
                    </span>
                    <Detalhes etiqueta={etiqueta} />
                  </span>
                  <span aria-hidden className="text-slate-300">
                    ›
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Detalhes({ etiqueta }: { etiqueta: Etiqueta }) {
  const partes = [
    etiqueta.lote && `Lote ${etiqueta.lote}`,
    etiqueta.printed_by_snapshot,
    etiqueta.short_code,
  ].filter(Boolean)

  if (partes.length === 0) return null
  return <span className="block text-xs text-slate-400">{partes.join(' · ')}</span>
}
