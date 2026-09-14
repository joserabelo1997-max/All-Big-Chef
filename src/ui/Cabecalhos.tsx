import type { ReactNode } from 'react'

export function TituloTela({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string
  subtitulo?: string
  acao?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight">{titulo}</h1>
        {subtitulo ? <p className="mt-1 text-sm text-texto2">{subtitulo}</p> : null}
      </div>
      {acao}
    </div>
  )
}

/** Estado vazio com um convite claro, em vez de uma tela em branco sem explicação. */
export function Vazio({
  titulo,
  texto,
  acao,
}: {
  titulo: string
  texto: string
  acao?: ReactNode
}) {
  return (
    <div className="cartao flex flex-col items-center gap-3 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="max-w-sm text-sm text-texto2">{texto}</p>
      {acao}
    </div>
  )
}

export function EmConstrucao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <>
      <TituloTela titulo={titulo} />
      <div className="cartao">
        <p className="text-sm text-texto2">{texto}</p>
      </div>
    </>
  )
}
