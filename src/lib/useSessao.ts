import { useEffect, useState } from 'react'

import { motorSync } from './sync/engine'
import { obterOrgId, semearSeVazio } from './sessao'

interface Sessao {
  orgId: string | null
  carregando: boolean
}

/**
 * Resolve a organização do aparelho, semeia as pastas na primeira execução e
 * liga o motor de sincronização.
 *
 * Fica num hook próprio para que as telas nunca precisem lidar com "ainda não
 * sei qual é o restaurante" — elas só recebem o orgId quando ele existe.
 */
export function useSessao(): Sessao {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false

    void (async () => {
      const id = await obterOrgId()
      if (cancelado) return

      await semearSeVazio(id)
      if (cancelado) return

      setOrgId(id)
      setCarregando(false)
      motorSync.iniciar(id)
    })()

    return () => {
      cancelado = true
      motorSync.parar()
    }
  }, [])

  return { orgId, carregando }
}
