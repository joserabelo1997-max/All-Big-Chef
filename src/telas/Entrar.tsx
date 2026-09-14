import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '@/dados/sessao'
import { diagnostico } from '@/dados/supabase'

type Modo = 'entrar' | 'cadastrar' | 'recuperar'

/**
 * A porta do app. Nada é visível sem sessão, e é isso que responde ao pedido de
 * "só eu ter acesso ao link" — o endereço é público, os dados não.
 */
export default function Entrar() {
  const { usuario, carregando, entrar, cadastrar, recuperarSenha } = useSessao()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!diagnostico.ok) return <FaltaConfigurar />
  if (carregando) return <Aguardando />
  if (usuario) return <Navigate to="/" replace />

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setRecado(null)
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        await entrar(email, senha)
      } else if (modo === 'cadastrar') {
        const { precisaConfirmarEmail } = await cadastrar(email, senha)
        setRecado(
          precisaConfirmarEmail
            ? 'Conta criada. Confirme pelo link que o Supabase mandou no seu e-mail e depois entre.'
            : 'Conta criada e sessão aberta.',
        )
        setModo('entrar')
      } else {
        await recuperarSenha(email)
        setRecado('Se existe conta com esse e-mail, o link de nova senha já está a caminho.')
        setModo('entrar')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Moldura>
      <form onSubmit={enviar} className="cartao space-y-4">
        <div>
          <label className="rotulo" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            className="campo"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {modo !== 'recuperar' ? (
          <div>
            <label className="rotulo" htmlFor="senha">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              className="campo"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
        ) : null}

        {erro ? (
          <p className="rounded-xl border border-perigo/40 bg-perigo/10 px-3 py-2 text-sm text-perigo">
            {erro}
          </p>
        ) : null}

        {recado ? (
          <p className="rounded-xl border border-erva/40 bg-erva/10 px-3 py-2 text-sm text-erva">
            {recado}
          </p>
        ) : null}

        <button type="submit" className="botao-principal w-full" disabled={enviando}>
          {enviando
            ? 'Um instante…'
            : modo === 'entrar'
              ? 'Entrar'
              : modo === 'cadastrar'
                ? 'Criar conta'
                : 'Mandar link de nova senha'}
        </button>

        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {modo === 'entrar' ? (
            <>
              <button
                type="button"
                className="text-texto2 hover:text-texto"
                onClick={() => setModo('recuperar')}
              >
                Esqueci a senha
              </button>
              <button
                type="button"
                className="text-brasa hover:text-brasa2"
                onClick={() => setModo('cadastrar')}
              >
                Criar minha conta
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-texto2 hover:text-texto"
              onClick={() => setModo('entrar')}
            >
              ← Voltar para entrar
            </button>
          )}
        </div>
      </form>

      {modo === 'cadastrar' ? (
        <p className="mt-4 text-center text-xs leading-relaxed text-texto2">
          Crie a sua conta uma vez e depois desligue novos cadastros no painel do Supabase
          (Authentication → Sign In / Providers → <em>Allow new users to sign up</em>). A partir daí,
          o endereço pode ser público que ninguém mais entra.
        </p>
      ) : null}
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">All Big Chef</h1>
          <p className="mt-1 text-sm text-texto2">Fichas técnicas, produção, CMV e compras.</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Aguardando() {
  return (
    <Moldura>
      <p className="text-center text-sm text-texto2">Conferindo a sessão…</p>
    </Moldura>
  )
}

/**
 * O app publicado sem as chaves não pode fazer nada — mas pode explicar exatamente
 * o que falta. Era essa tela que não existia na primeira tentativa deste projeto.
 */
function FaltaConfigurar() {
  return (
    <Moldura>
      <div className="cartao space-y-4 text-sm">
        <p className="font-medium text-alerta">O app ainda não está ligado a um banco.</p>

        <div>
          <p className="mb-2 text-texto2">Falta configurar:</p>
          <ul className="space-y-1">
            {diagnostico.faltando.map((item) => (
              <li key={item} className="rounded-lg bg-painel2 px-3 py-2 font-mono text-xs">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 text-texto2">
          <p className="font-medium text-texto">Como resolver</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Crie um projeto em <span className="text-texto">supabase.com</span> (o plano grátis dá
              conta deste app).
            </li>
            <li>
              Cole <span className="font-mono text-xs text-texto">supabase/schema.sql</span> no SQL
              Editor e rode.
            </li>
            <li>
              Copie a URL e a anon key em <span className="text-texto">Project Settings → Data API</span>.
            </li>
            <li>
              Rodando no seu computador: ponha as duas num arquivo{' '}
              <span className="font-mono text-xs text-texto">.env</span>.
            </li>
            <li>
              Publicado no GitHub Pages: ponha as duas em{' '}
              <span className="text-texto">Settings → Secrets and variables → Actions</span> e rode o
              deploy de novo.
            </li>
          </ol>
          <p className="pt-1">
            O passo a passo com telas está em{' '}
            <span className="font-mono text-xs text-texto">docs/SETUP_SUPABASE.md</span>.
          </p>
        </div>
      </div>
    </Moldura>
  )
}
