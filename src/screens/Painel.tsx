import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

import {
  classificar,
  compararUrgencia,
  COR_DO_NIVEL,
  formatarData,
  type NivelValidade,
} from '../domain/expiry'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

/**
 * Painel de validades — a primeira tela que alguém abre no turno.
 *
 * Responde a uma pergunta só: o que precisa de atenção agora? Por isso os
 * contadores vêm antes de qualquer outra coisa, e a lista mostra apenas o que
 * exige ação, com o mais urgente no topo.
 */
export function Painel() {
  const { orgId, carregando } = useSessao()

  const ativas = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.labels.where('org_id').equals(orgId).toArray()
      return todas.filter((e) => !e.deleted_at && e.status === 'ativa')
    },
    [orgId],
    [],
  )

  const { contagens, urgentes } = useMemo(() => {
    const avaliadas = ativas.map((etiqueta) => ({
      etiqueta,
      situacao: classificar(etiqueta.expires_at),
    }))

    const contagens: Record<NivelValidade, number> = {
      vencido: 0,
      hoje: 0,
      atencao: 0,
      ok: 0,
    }
    for (const { situacao } of avaliadas) contagens[situacao.nivel]++

    const urgentes = avaliadas
      .filter(({ situacao }) => situacao.nivel !== 'ok')
      .sort((a, b) => compararUrgencia(a.situacao, b.situacao))
      .slice(0, 8)

    return { contagens, urgentes }
  }, [ativas])

  const totalAlerta = contagens.vencido + contagens.hoje + contagens.atencao

  // O badge no ícone do app deixa a cozinha ver a pendência sem abrir nada.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (totalAlerta > 0) void navigator.setAppBadge?.(totalAlerta).catch(() => {})
    else void navigator.clearAppBadge?.().catch(() => {})
  }, [totalAlerta])

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">All Big Chef</h1>
        <p className="text-slate-500">
          {ativas.length} {ativas.length === 1 ? 'etiqueta ativa' : 'etiquetas ativas'}
        </p>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Contador
          rotulo="Vencidas"
          valor={contagens.vencido}
          nivel="vencido"
          filtro="vencidas"
        />
        <Contador rotulo="Vencem hoje" valor={contagens.hoje} nivel="hoje" filtro="hoje" />
        <Contador
          rotulo="Em breve"
          valor={contagens.atencao}
          nivel="atencao"
          filtro="vencendo"
        />
      </div>

      <div className="mb-8 grid gap-3">
        <Link to="/pastas" className="btn-primario">
          🏷️ Etiquetar produtos
        </Link>
        <Link to="/baixa" className="btn-secundario">
          📷 Dar baixa
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Precisa de atenção
        </h2>

        {urgentes.length === 0 ? (
          <p className="cartao p-6 text-center text-slate-500">
            {ativas.length === 0
              ? 'Nenhuma etiqueta impressa ainda.'
              : 'Nada vencendo. Tudo em dia. 👍'}
          </p>
        ) : (
          <ul className="grid gap-2">
            {urgentes.map(({ etiqueta, situacao }) => (
              <li key={etiqueta.id}>
                <Link to={`/l/${etiqueta.id}`} className="cartao flex overflow-hidden">
                  <span className={`w-2 shrink-0 ${COR_DO_NIVEL[situacao.nivel]}`} />
                  <span className="flex flex-1 items-center gap-3 p-4">
                    <span className="flex-1">
                      <span className="block font-semibold leading-tight">
                        {etiqueta.produto_snapshot}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {situacao.descricao} · {formatarData(etiqueta.expires_at)}
                      </span>
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

        {totalAlerta > urgentes.length && (
          <Link to="/etiquetas?filtro=vencendo" className="btn-secundario mt-3 w-full">
            Ver todas as {totalAlerta}
          </Link>
        )}
      </section>
    </div>
  )
}

function Contador({
  rotulo,
  valor,
  nivel,
  filtro,
}: {
  rotulo: string
  valor: number
  nivel: NivelValidade
  filtro: string
}) {
  // Zerado fica cinza: colorir um contador vazio de vermelho treina a cozinha a
  // ignorar a cor, e aí o alerta de verdade perde o efeito.
  const cor = valor > 0 ? COR_DO_NIVEL[nivel] : 'bg-slate-300'

  return (
    <Link
      to={`/etiquetas?filtro=${filtro}`}
      className={`${cor} rounded-2xl px-3 py-4 text-center text-white shadow-sm transition active:scale-[0.98]`}
    >
      <span className="block text-3xl font-bold tabular-nums">{valor}</span>
      <span className="block text-xs font-semibold uppercase tracking-wide opacity-90">
        {rotulo}
      </span>
    </Link>
  )
}
