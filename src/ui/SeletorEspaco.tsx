import { useEffect, useState } from 'react'
import { TIPOS_CASA, useEspacos } from '@/dados/espacos'
import { FAIXAS_CMV } from '@/dominio/cmv'
import { formatarPercentual } from '@/dominio/unidades'
import type { TipoCasa } from '@/dominio/tipos'
import { IconeMais, IconeTrocar } from './Icones'

/**
 * Troca de restaurante, no alto da tela e sempre visível. Fica aqui de propósito:
 * saber em qual casa você está não pode depender de lembrar.
 */
export function SeletorEspaco() {
  const { espacos, espacoAtivo, trocar } = useEspacos()
  const [aberto, setAberto] = useState(false)
  const [criando, setCriando] = useState(false)

  if (!espacoAtivo) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left hover:bg-painel2"
      >
        <span className="truncate text-base font-semibold">{espacoAtivo.nome}</span>
        {espacos.length > 1 ? <IconeTrocar className="h-4 w-4 shrink-0 text-texto2" /> : null}
      </button>

      {aberto ? (
        <Folha aoFechar={() => setAberto(false)} titulo="Restaurante">
          <div className="space-y-1">
            {espacos.map((espaco) => (
              <button
                key={espaco.id}
                type="button"
                onClick={() => {
                  trocar(espaco.id)
                  setAberto(false)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                  espaco.id === espacoAtivo.id ? 'bg-painel2 text-brasa' : 'hover:bg-painel2'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{espaco.nome}</span>
                  <span className="block text-xs text-texto2">
                    {TIPOS_CASA.find((t) => t.valor === espaco.tipo_casa)?.rotulo} · CMV alvo{' '}
                    {formatarPercentual(espaco.cmv_alvo, 0)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="botao-secundario mt-3 w-full"
            onClick={() => {
              setAberto(false)
              setCriando(true)
            }}
          >
            <IconeMais className="h-5 w-5" />
            Novo restaurante
          </button>

          <p className="mt-3 text-xs leading-relaxed text-texto2">
            Cada restaurante tem receitas, menus, serviços e compras próprios. O que você guarda na
            biblioteca aparece em todos.
          </p>
        </Folha>
      ) : null}

      {criando ? <FormularioEspaco aoFechar={() => setCriando(false)} /> : null}
    </>
  )
}

/** Formulário de restaurante, usado tanto no primeiro acesso quanto depois. */
export function FormularioEspaco({
  aoFechar,
  comoBoasVindas = false,
}: {
  aoFechar?: () => void
  comoBoasVindas?: boolean
}) {
  const { criar } = useEspacos()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoCasa>('a_la_carte')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const faixa = FAIXAS_CMV[tipo]
  // Meio da faixa do tipo de casa como ponto de partida — o número é editável
  // depois, mas começar com um palpite razoável é melhor que começar com zero.
  const cmvSugerido = (faixa.min + faixa.max) / 2

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!nome.trim()) {
      setErro('Dê um nome ao restaurante.')
      return
    }
    setErro(null)
    setSalvando(true)
    try {
      await criar({ nome, tipo_casa: tipo, cmv_alvo: cmvSugerido })
      aoFechar?.()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const corpo = (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="nome-espaco">
          Nome do restaurante
        </label>
        <input
          id="nome-espaco"
          className="campo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Casa do Chef"
          autoFocus
        />
      </div>

      <div>
        <label className="rotulo" htmlFor="tipo-casa">
          Tipo de casa
        </label>
        <select
          id="tipo-casa"
          className="campo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoCasa)}
        >
          {TIPOS_CASA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-texto2">
          Define o CMV alvo inicial: {formatarPercentual(faixa.min, 0)} a{' '}
          {formatarPercentual(faixa.max, 0)} é a faixa saudável desse tipo de casa. Dá para mudar
          depois.
        </p>
      </div>

      {erro ? <p className="text-sm text-perigo">{erro}</p> : null}

      <button type="submit" className="botao-principal w-full" disabled={salvando}>
        {salvando ? 'Criando…' : 'Criar restaurante'}
      </button>
    </form>
  )

  if (comoBoasVindas) return corpo

  return (
    <Folha aoFechar={aoFechar ?? (() => {})} titulo="Novo restaurante">
      {corpo}
    </Folha>
  )
}

/** Painel que sobe de baixo — alcance de polegar, que é como o celular se usa. */
export function Folha({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string
  children: React.ReactNode
  aoFechar: () => void
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = ''
    }
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={aoFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-borda bg-painel p-4 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="botao-fantasma px-2 py-1 text-sm">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
