import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase.
 *
 * A anon key é pública por design — vai dentro do bundle JavaScript e qualquer
 * pessoa que abrir o app consegue lê-la. Quem impede um restaurante de acessar
 * os dados de outro são as políticas de RLS no banco, não o sigilo da chave.
 *
 * O cliente é opcional: o app precisa funcionar antes de o Supabase existir (é
 * assim que o usuário começa) e continuar funcionando quando a rede cai. Toda
 * chamada passa por `supabaseDisponivel()` antes.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  URL && CHAVE
    ? createClient(URL, CHAVE, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
        // A cozinha usa poucos aparelhos; limitar os eventos por segundo evita
        // que uma rajada de sincronização consuma a cota do plano gratuito.
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null

export function supabaseDisponivel(): boolean {
  return supabase !== null
}

/** Explica a ausência de configuração de forma acionável. */
export function motivoSemSupabase(): string | null {
  if (supabase) return null
  return (
    'O aplicativo ainda não está ligado ao banco de dados. Ele funciona neste ' +
    'aparelho, mas não sincroniza com os outros. Siga docs/SETUP_SUPABASE.md ' +
    'para criar o projeto e preencher o arquivo .env.'
  )
}
