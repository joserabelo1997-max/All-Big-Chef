import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'

import { formatarDataHora } from '../domain/expiry'
import {
  agruparDesperdicio,
  montarCsv,
  resumir,
  ultimosDias,
  type LinhaDesperdicio,
} from '../domain/relatorios'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
] as const

export function Relatorios() {
  const { orgId, carregando } = useSessao()
  const [dias, setDias] = useState<number>(30)
  const [agrupamento, setAgrupamento] = useState<'produto' | 'pasta'>('produto')

  const etiquetas = useLiveQuery(
    async () => {
      if (!orgId) return []
      return db.labels.where('org_id').equals(orgId).toArray()
    },
    [orgId],
    [],
  )

  const eventos = useLiveQuery(
    async () => {
      if (!orgId) return []
      return db.label_events.where('org_id').equals(orgId).toArray()
    },
    [orgId],
    [],
  )

  const periodo = useMemo(() => ultimosDias(dias), [dias])
  const resumo = useMemo(
    () => resumir(etiquetas, eventos, periodo),
    [etiquetas, eventos, periodo],
  )
  const linhas = useMemo(
    () => agruparDesperdicio(etiquetas, eventos, periodo, agrupamento),
    [etiquetas, eventos, periodo, agrupamento],
  )

  function baixarResumo() {
    const csv = montarCsv(
      ['Agrupamento', 'Consumidas', 'Descartadas', 'Taxa de descarte'],
      linhas.map((l) => [
        l.rotulo,
        l.consumidas,
        l.descartadas,
        `${(l.taxaDescarte * 100).toFixed(1)}%`,
      ]),
    )
    baixar(csv, `desperdicio-${dias}dias.csv`)
  }

  function baixarDetalhado() {
    // Um registro por etiqueta, com a trilha completa: é o formato que a
    // vigilância sanitária pede numa fiscalização — cada item precisa ser
    // rastreável até quem manipulou e quando.
    const porId = new Map(etiquetas.map((e) => [e.id, e]))
    const noPeriodo = eventos
      .filter((ev) => {
        const t = new Date(ev.ocorrido_em).getTime()
        return t >= periodo.de.getTime() && t <= periodo.ate.getTime()
      })
      .sort((a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em))

    const csv = montarCsv(
      [
        'Data/hora',
        'Ação',
        'Produto',
        'Fornecedor',
        'Pasta',
        'Lote',
        'Código',
        'Aberto em',
        'Validade',
        'Responsável',
        'Motivo',
      ],
      noPeriodo.map((ev) => {
        const et = porId.get(ev.label_id)
        return [
          formatarDataHora(ev.ocorrido_em),
          ev.tipo,
          et?.produto_snapshot ?? '',
          et?.fornecedor_snapshot ?? '',
          et?.pasta_snapshot ?? '',
          et?.lote ?? '',
          et?.short_code ?? '',
          et ? formatarDataHora(et.opened_at) : '',
          et ? formatarDataHora(et.expires_at) : '',
          ev.member_snapshot ?? '',
          ev.motivo ?? '',
        ]
      }),
    )
    baixar(csv, `rastreabilidade-${dias}dias.csv`)
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Relatórios</h1>

      <div className="mb-6 flex gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            onClick={() => setDias(p.dias)}
            className={[
              'min-h-toque flex-1 rounded-xl border-2 font-semibold transition',
              dias === p.dias
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Cartao rotulo="Etiquetas impressas" valor={resumo.impressas} />
        <Cartao rotulo="Ativas agora" valor={resumo.ativas} />
        <Cartao rotulo="Consumidas" valor={resumo.consumidas} cor="text-validade-ok" />
        <Cartao
          rotulo="Descartadas"
          valor={resumo.descartadas}
          cor="text-validade-vencido"
        />
      </div>

      <div className="cartao mb-8 p-4">
        <p className="text-sm text-slate-500">Aproveitamento</p>
        {resumo.aproveitamento === null ? (
          <p className="mt-1 text-slate-400">
            Ainda não há etiquetas finalizadas neste período.
          </p>
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums">
              {(resumo.aproveitamento * 100).toFixed(0)}%
            </p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-validade-ok transition-all"
                style={{ width: `${resumo.aproveitamento * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Do que foi finalizado, quanto acabou consumido em vez de
              descartado. Etiquetas ainda na geladeira não entram na conta.
            </p>
          </>
        )}
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Onde se perde comida
          </h2>
          <div className="flex gap-1">
            {(['produto', 'pasta'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAgrupamento(a)}
                className={[
                  'rounded-lg border-2 px-3 py-1.5 text-xs font-semibold capitalize',
                  agrupamento === a
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {linhas.length === 0 ? (
          <p className="cartao p-6 text-center text-slate-500">
            Nenhuma etiqueta finalizada neste período.
          </p>
        ) : (
          <ul className="grid gap-2">
            {linhas.map((linha) => (
              <Linha key={linha.chave} linha={linha} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Exportar
        </h2>
        <button className="btn-secundario" onClick={baixarResumo}>
          📊 Resumo de desperdício (CSV)
        </button>
        <button className="btn-secundario" onClick={baixarDetalhado}>
          📋 Rastreabilidade completa (CSV)
        </button>
        <button className="btn-secundario" onClick={() => window.print()}>
          🖨️ Imprimir esta página
        </button>
        <p className="mt-1 text-xs text-slate-500">
          A rastreabilidade traz um registro por movimentação, com produto,
          fornecedor, lote, datas e responsável — o formato pedido numa
          fiscalização sanitária.
        </p>
      </section>
    </div>
  )
}

function Cartao({
  rotulo,
  valor,
  cor = 'text-slate-900',
}: {
  rotulo: string
  valor: number
  cor?: string
}) {
  return (
    <div className="cartao p-4">
      <p className="text-sm text-slate-500">{rotulo}</p>
      <p className={`text-3xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  )
}

function Linha({ linha }: { linha: LinhaDesperdicio }) {
  const pct = Math.round(linha.taxaDescarte * 100)
  return (
    <li className="cartao p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-semibold">{linha.rotulo}</span>
        <span className="text-sm tabular-nums text-slate-500">
          {linha.descartadas} descartada{linha.descartadas === 1 ? '' : 's'} · {pct}%
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className="bg-validade-ok" style={{ width: `${100 - pct}%` }} />
        <div className="bg-validade-vencido" style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

/**
 * Entrega o arquivo ao usuário.
 *
 * `URL.revokeObjectURL` no fim libera a memória do blob: sem isso, exportar
 * várias vezes na mesma sessão acumula os arquivos inteiros na memória do
 * aparelho até a aba ser fechada.
 */
function baixar(conteudo: string, nomeArquivo: string): void {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}
