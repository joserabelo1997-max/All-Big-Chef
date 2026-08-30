import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'

import { db } from '../lib/db'

/**
 * Escolha do operador.
 *
 * Botões grandes com o nome, e não um `select`: a pessoa toca no próprio nome
 * com a mão ocupada, no meio do serviço. É o que substitui o login individual
 * sem perder o "quem fez" que a rastreabilidade exige.
 */
export function SeletorMembro({
  orgId,
  selecionado,
  aoSelecionar,
}: {
  orgId: string | null
  selecionado: string | null
  aoSelecionar: (id: string, nome: string) => void
}) {
  const equipe = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.team_members.where('org_id').equals(orgId).toArray()
      return todos
        .filter((m) => !m.deleted_at && m.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  if (equipe.length === 0) {
    return (
      <div className="cartao border-amber-300 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          Ninguém cadastrado na equipe ainda. A etiqueta sai sem responsável.
        </p>
        <Link to="/config/equipe" className="mt-2 inline-block text-sm font-semibold underline">
          Cadastrar equipe
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {equipe.map((membro) => (
        <button
          key={membro.id}
          type="button"
          onClick={() => aoSelecionar(membro.id, membro.nome)}
          className={[
            'min-h-toque rounded-xl border-2 px-4 font-semibold transition',
            selecionado === membro.id
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white',
          ].join(' ')}
        >
          {membro.nome}
        </button>
      ))}
    </div>
  )
}
