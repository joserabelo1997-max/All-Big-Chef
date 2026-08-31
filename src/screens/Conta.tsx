import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { motivoSemSupabase, supabase } from '../lib/supabase'

/**
 * Entrar na conta do restaurante.
 *
 * **Um login por restaurante, não um por funcionário.** O tablet fica logado na
 * bancada e o operador só toca no próprio nome antes de imprimir — ninguém
 * digita senha com a mão suja no meio do serviço. Quem fez o quê é registrado
 * pela seleção de nome, que é o que a RDC 216 pede.
 *
 * Sem entrar, o app funciona inteiro, só que **sozinho neste aparelho**: o
 * banco recusa toda escrita de quem não está autenticado, então nada
 * sincroniza. É por isso que esta tela existe — antes dela, a sessão era sempre
 * nula e o sync nunca saía do lugar.
 */
export function Conta() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [logadoComo, setLogadoComo] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setVerificando(false)
      return
    }

    let vivo = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setLogadoComo(data.session?.user.email ?? null)
      setVerificando(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      setLogadoComo(sessao?.user.email ?? null)
    })

    return () => {
      vivo = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function entrar() {
    if (!supabase || entrando) return
    setEntrando(true)
    setErro(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })

    if (error) {
      // A mensagem da biblioteca vem em inglês e genérica; traduzir o caso
      // comum evita que alguém na cozinha ache que o app quebrou.
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha não conferem.'
          : error.message,
      )
    } else {
      setSenha('')
    }

    setEntrando(false)
  }

  async function sair() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const semBanco = motivoSemSupabase()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Conta do restaurante</h1>
      <p className="mb-5 text-sm text-slate-500">
        Um login para a casa inteira. Quem fez o quê continua vindo da escolha do
        nome na hora de imprimir.
      </p>

      {semBanco ? (
        <div className="cartao border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{semBanco}</p>
        </div>
      ) : verificando ? (
        <p className="cartao p-6 text-center text-slate-400">Verificando…</p>
      ) : logadoComo ? (
        <>
          <div className="cartao mb-4 border-emerald-300 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Conectado</p>
            <p className="mt-1 break-all text-sm text-emerald-800">{logadoComo}</p>
            <p className="mt-2 text-xs text-emerald-800">
              Este aparelho sincroniza com os outros da cozinha.
            </p>
          </div>
          <button className="btn-secundario w-full text-red-700" onClick={() => void sair()}>
            Sair da conta
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Saindo, o app continua funcionando neste aparelho — mas para de
            sincronizar, e o que for cadastrado fica só aqui.
          </p>
        </>
      ) : (
        <>
          <div className="cartao mb-4 border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Fora da conta</p>
            <p className="mt-1 text-sm text-amber-800">
              O app funciona, mas nada sai deste aparelho: o segundo celular da
              cozinha não vê o que for cadastrado aqui.
            </p>
          </div>

          {erro && (
            <p className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {erro}
            </p>
          )}

          <label className="rotulo" htmlFor="email">
            E-mail do restaurante
          </label>
          <input
            id="email"
            className="campo mb-3"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cozinha@seurestaurante.com.br"
          />

          <label className="rotulo" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            className="campo mb-4"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void entrar()}
          />

          <button
            className="btn-primario w-full"
            onClick={() => void entrar()}
            disabled={entrando || !email.trim() || !senha}
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="mt-3 text-xs text-slate-500">
            O que você já cadastrou neste aparelho não se perde: ao entrar pela
            primeira vez, tudo passa para a conta do restaurante e sobe para o
            servidor.
          </p>
        </>
      )}

      <Link to="/config" className="btn-secundario mt-6 w-full">
        Voltar aos ajustes
      </Link>
    </div>
  )
}
