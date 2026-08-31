import { useCallback, useEffect, useState } from 'react'

import { obterOrgId, semearSeVazio } from './sessao'
import { supabase } from './supabase'
import { motorSync } from './sync/engine'

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
 *
 * Reage a entrar e sair da conta. Sem isso, entrar não teria efeito nenhum até
 * alguém recarregar a página — e o operador não tem por que saber que precisa
 * recarregar. É também o gancho que dispara a adoção do cadastro local pela
 * organização do servidor, dentro de `obterOrgId`.
 */
export function useSessao(): Sessao {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const resolver = useCallback(async (cancelado: () => boolean) => {
    const id = await obterOrgId()
    if (cancelado()) return

    await semearSeVazio(id)
    if (cancelado()) return

    setOrgId(id)
    setCarregando(false)

    // `iniciar` já para o motor anterior antes de subir o novo, então trocar de
    // organização não deixa dois laços de sincronização rodando ao mesmo tempo.
    motorSync.iniciar(id)
  }, [])

  useEffect(() => {
    let cancelado = false
    const foiCancelado = () => cancelado

    void resolver(foiCancelado)

    // `onAuthStateChange` dispara em INITIAL_SESSION, SIGNED_IN, SIGNED_OUT e
    // na renovação do token. Refazer a resolução em todos é barato e evita
    // decorar quais eventos importam — a renovação, por exemplo, mantém a mesma
    // organização e o trabalho extra é desprezível.
    const { data } = supabase?.auth.onAuthStateChange(() => {
      void resolver(foiCancelado)
    }) ?? { data: null }

    return () => {
      cancelado = true
      data?.subscription.unsubscribe()
      motorSync.parar()
    }
  }, [resolver])

  return { orgId, carregando }
}
