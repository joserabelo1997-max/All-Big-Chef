import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Um conceito e a calculadora dele, no mesmo lugar.
 *
 * A aba de CMV existe para duas coisas ao mesmo tempo: fazer a conta rápido e
 * lembrar o que a conta significa quando a memória falha. Separar em "ajuda" e
 * "ferramenta" obrigaria a ir e voltar — então cada verbete traz a explicação, a
 * fórmula e o campo, um embaixo do outro.
 */
export function Verbete({
  titulo,
  resumo,
  formula,
  children,
  comecaAberto = false,
}: {
  titulo: string
  resumo: string
  formula?: string
  children?: ReactNode
  comecaAberto?: boolean
}) {
  const [aberto, setAberto] = useState(comecaAberto)

  return (
    <section className="cartao">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-medium">{titulo}</span>
          <span className="mt-1 block text-sm leading-relaxed text-texto2">{resumo}</span>
        </span>
        <span className="mt-0.5 shrink-0 text-texto2" aria-hidden="true">
          {aberto ? '−' : '+'}
        </span>
      </button>

      {aberto ? (
        <div className="mt-4 space-y-4 border-t border-borda pt-4">
          {formula ? <Formula>{formula}</Formula> : null}
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-painel2 px-3 py-2.5 text-center font-mono text-sm leading-relaxed text-brasa2">
      {children}
    </p>
  )
}

/** Texto explicativo dentro de um verbete. */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-texto2">{children}</p>
}

/** O número que a calculadora produziu, com destaque e uma leitura em palavras. */
export function Resultado({
  rotulo,
  valor,
  leitura,
  tom = 'neutro',
}: {
  rotulo: string
  valor: string
  leitura?: ReactNode
  tom?: 'neutro' | 'bom' | 'atencao' | 'ruim'
}) {
  const cores = {
    neutro: 'border-borda',
    bom: 'border-erva/50',
    atencao: 'border-alerta/50',
    ruim: 'border-perigo/50',
  }[tom]

  const corValor = {
    neutro: 'text-texto',
    bom: 'text-erva',
    atencao: 'text-alerta',
    ruim: 'text-perigo',
  }[tom]

  return (
    <div className={`rounded-xl border bg-painel2 px-3 py-3 ${cores}`}>
      <p className="text-xs text-texto2">{rotulo}</p>
      <p className={`text-2xl font-semibold ${corValor}`}>{valor}</p>
      {leitura ? <p className="mt-1.5 text-sm leading-relaxed text-texto2">{leitura}</p> : null}
    </div>
  )
}
