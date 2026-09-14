import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface ValorSessao {
  /** Enquanto true, ainda não dá para saber se tem sessão — não redirecione. */
  carregando: boolean
  usuario: User | null
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (email: string, senha: string) => Promise<{ precisaConfirmarEmail: boolean }>
  recuperarSenha: (email: string) => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<ValorSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setCarregando(false)
      return
    }

    let vivo = true

    // A sessão vem do localStorage antes de qualquer rede: o app abre logado
    // mesmo com o celular offline, que é o caso normal dentro da cozinha.
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      setCarregando(false)
    })

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova)
    })

    return () => {
      vivo = false
      assinatura.subscription.unsubscribe()
    }
  }, [])

  const valor = useMemo<ValorSessao>(
    () => ({
      carregando,
      usuario: sessao?.user ?? null,

      async entrar(email, senha) {
        const cliente = exigir()
        const { error } = await cliente.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        })
        if (error) throw new Error(traduzir(error.message))
      },

      async cadastrar(email, senha) {
        const cliente = exigir()
        const { data, error } = await cliente.auth.signUp({
          email: email.trim(),
          password: senha,
        })
        if (error) throw new Error(traduzir(error.message))
        // Com confirmação de e-mail ligada, o Supabase devolve usuário sem sessão.
        return { precisaConfirmarEmail: !data.session }
      },

      async recuperarSenha(email) {
        const cliente = exigir()
        const { error } = await cliente.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        })
        if (error) throw new Error(traduzir(error.message))
      },

      async sair() {
        await supabase?.auth.signOut()
        setSessao(null)
      },
    }),
    [carregando, sessao],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao(): ValorSessao {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useSessao precisa estar dentro de <ProvedorSessao>')
  return valor
}

function exigir() {
  if (!supabase) {
    throw new Error('O app ainda não está ligado a um projeto Supabase.')
  }
  return supabase
}

/** As mensagens do Supabase vêm em inglês e técnicas demais para a tela de entrada. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha não conferem.'
  if (m.includes('email not confirmed')) {
    return 'Falta confirmar o e-mail. Procure a mensagem do Supabase na sua caixa de entrada.'
  }
  if (m.includes('user already registered')) {
    return 'Já existe conta com esse e-mail. É só entrar.'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Novos cadastros estão desligados neste projeto — que é como deve ficar depois que você criou a sua conta.'
  }
  if (m.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com o servidor agora. Confira a internet e tente de novo.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Tentativas demais em pouco tempo. Espere um minuto e tente de novo.'
  }
  return mensagem
}
