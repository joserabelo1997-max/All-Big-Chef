import { useEffect, useState } from 'react'

import { motorSync, type StatusSync } from '../lib/sync/engine'

/**
 * Indicador de sincronização.
 *
 * Fica visível o tempo todo por um motivo operacional: quem imprimiu uma
 * etiqueta offline precisa saber que ela ainda não subiu. Sem esse aviso, a
 * pessoa fecha o app achando que registrou, e o dado se perde se o aparelho for
 * limpo antes de reconectar.
 *
 * Some da tela quando está tudo sincronizado — no dia a dia normal, nenhuma
 * informação é a informação certa.
 */
export function IndicadorSync() {
  const [status, setStatus] = useState<StatusSync | null>(null)

  useEffect(() => motorSync.assinar(setStatus), [])

  if (!status) return null
  if (status.estado === 'ocioso' && status.pendentes === 0) return null
  if (status.estado === 'desligado') return null

  const { texto, classe } = descrever(status)

  return (
    <div
      className={`px-4 py-1.5 text-center text-xs font-semibold ${classe}`}
      role="status"
    >
      {texto}
    </div>
  )
}

function descrever(status: StatusSync): { texto: string; classe: string } {
  const pendentes =
    status.pendentes > 0
      ? ` · ${status.pendentes} ${status.pendentes === 1 ? 'alteração' : 'alterações'} a enviar`
      : ''

  switch (status.estado) {
    case 'offline':
      return {
        texto: `Sem conexão — o app continua funcionando${pendentes}`,
        classe: 'bg-slate-700 text-white',
      }
    case 'sincronizando':
      return { texto: 'Sincronizando…', classe: 'bg-sky-600 text-white' }
    case 'erro':
      return {
        texto: `Falha ao sincronizar${pendentes}`,
        classe: 'bg-validade-vencido text-white',
      }
    default:
      return {
        texto: `Enviando${pendentes}`,
        classe: 'bg-amber-500 text-white',
      }
  }
}
