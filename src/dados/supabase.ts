import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente único do Supabase.
 *
 * A tentativa anterior deste app morreu aqui: sem as variáveis configuradas, o
 * cliente era criado mesmo assim e falhava lá na frente com um erro de rede que
 * não dizia nada. Agora a falta de configuração é um estado nomeado, que a tela
 * de entrar sabe mostrar com o passo a passo do conserto.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export interface Diagnostico {
  ok: boolean
  faltando: string[]
  /** Só o host, para conferir de olho se é o projeto certo. */
  host: string | null
}

function diagnosticar(): Diagnostico {
  const faltando: string[] = []

  if (!url || url.includes('SEU-PROJETO')) faltando.push('VITE_SUPABASE_URL')
  if (!chave) faltando.push('VITE_SUPABASE_ANON_KEY')

  let host: string | null = null
  if (url && !url.includes('SEU-PROJETO')) {
    try {
      host = new URL(url).host
    } catch {
      faltando.push('VITE_SUPABASE_URL (não é uma URL válida)')
    }
  }

  return { ok: faltando.length === 0, faltando, host }
}

export const diagnostico = diagnosticar()

export const supabase: SupabaseClient | null = diagnostico.ok
  ? createClient(url, chave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // A sessão mora no localStorage para o app abrir já logado no celular,
        // inclusive sem rede — que é o caso normal no meio do serviço.
        storageKey: 'all-big-chef-sessao',
      },
    })
  : null

/** Para o código que só roda depois do login e não deveria se preocupar com nulo. */
export function exigirSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'O Supabase não está configurado neste app. Veja docs/SETUP_SUPABASE.md.',
    )
  }
  return supabase
}
