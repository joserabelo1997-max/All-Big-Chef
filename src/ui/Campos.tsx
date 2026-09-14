import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { UNIDADES } from '@/dominio/tipos'
import type { Unidade } from '@/dominio/tipos'

/**
 * Rótulo, campo e dica, ligados por id.
 *
 * O jeito curto seria embrulhar o input dentro do <label>. Mas aí o nome acessível
 * do campo passa a ser TODO o texto de dentro do rótulo — a dica junto e, num
 * <select>, a lista inteira de opções. Quem usa leitor de tela ouve um parágrafo
 * no lugar do nome do campo. Associar por id custa três linhas e deixa o nome ser
 * só o nome.
 */
export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string
  dica?: ReactNode
  children: (props: { id: string; 'aria-describedby': string | undefined }) => ReactNode
}) {
  const id = useId()
  const idDica = `${id}-dica`

  return (
    <div>
      <label className="rotulo" htmlFor={id}>
        {rotulo}
      </label>
      {children({ id, 'aria-describedby': dica ? idDica : undefined })}
      {dica ? (
        <p id={idDica} className="mt-1.5 text-xs leading-relaxed text-texto2">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  dica,
  ...resto
}: {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  dica?: ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      {(props) => (
        <input
          className="campo"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          {...props}
          {...resto}
        />
      )}
    </Campo>
  )
}

/**
 * Campo numérico que aceita vírgula.
 *
 * No Brasil se digita 1,5 — e um `<input type="number">` simplesmente descarta a
 * vírgula, transformando 1,5 em 15 sem avisar ninguém. Aqui o texto fica livre
 * enquanto se digita e só vira número quando dá para virar, o que também deixa o
 * campo ficar vazio no meio da edição sem pular para zero.
 */
export function CampoNumero({
  rotulo,
  valor,
  aoMudar,
  dica,
  sufixo,
  ...resto
}: {
  rotulo: string
  valor: number
  aoMudar: (valor: number) => void
  dica?: ReactNode
  sufixo?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [texto, setTexto] = useState(() => paraTexto(valor))

  // Quando o valor muda por fora (outra tela, sync), o campo acompanha — mas só
  // se o que está escrito já não representa esse mesmo número, para não atrapalhar
  // quem está no meio de digitar "1," a caminho de "1,5".
  useEffect(() => {
    setTexto((atual) => (paraNumero(atual) === valor ? atual : paraTexto(valor)))
  }, [valor])

  return (
    <Campo rotulo={rotulo} dica={dica}>
      {(props) => (
        <div className="relative">
          <input
            className="campo"
            inputMode="decimal"
            value={texto}
            onChange={(e) => {
              const bruto = e.target.value
              setTexto(bruto)
              const numero = paraNumero(bruto)
              if (numero !== null) aoMudar(numero)
            }}
            onBlur={() => setTexto(paraTexto(valor))}
            {...props}
            {...resto}
          />
          {sufixo ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-texto2">
              {sufixo}
            </span>
          ) : null}
        </div>
      )}
    </Campo>
  )
}

/**
 * O rótulo é obrigatório e específico de propósito. Uma tela com três selects
 * chamados só "Unidade" é ambígua para quem lê com os olhos e pior ainda para
 * quem lê com leitor de tela.
 */
export function SeletorUnidade({
  rotulo,
  valor,
  aoMudar,
  dica,
  ...resto
}: {
  rotulo: string
  valor: Unidade
  aoMudar: (u: Unidade) => void
  dica?: ReactNode
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      {(props) => (
        <select
          className="campo"
          value={valor}
          onChange={(e) => aoMudar(e.target.value as Unidade)}
          {...props}
          {...resto}
        >
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      )}
    </Campo>
  )
}

export function CampoTextoLongo({
  rotulo,
  valor,
  aoMudar,
  dica,
  ...resto
}: {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  dica?: ReactNode
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      {(props) => (
        <textarea
          className="campo min-h-[5rem] resize-y"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          {...props}
          {...resto}
        />
      )}
    </Campo>
  )
}

export function Busca({
  valor,
  aoMudar,
  placeholder = 'Buscar…',
}: {
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="search"
      className="campo"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  )
}

function paraTexto(valor: number): string {
  if (!Number.isFinite(valor)) return ''
  return String(valor).replace('.', ',')
}

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, '').replace(',', '.')
  if (limpo === '' || limpo === '-') return null
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : null
}

/** Busca sem acento e sem caixa: "purê" acha "PURE" e vice-versa. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function combina(texto: string, busca: string): boolean {
  if (!busca.trim()) return true
  return normalizar(texto).includes(normalizar(busca))
}
