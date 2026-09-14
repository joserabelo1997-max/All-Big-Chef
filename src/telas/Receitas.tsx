import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { useContextoArvore, useFichas } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { fichaEmBranco, salvarFicha } from '@/dados/repositorio'
import { Busca, combina } from '@/ui/Campos'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { Folha } from '@/ui/SeletorEspaco'
import { IconeMais } from '@/ui/Icones'
import { explodirFicha } from '@/dominio/arvore'
import { custoPorPorcao } from '@/dominio/custo'
import { formatarMedida, formatarReais } from '@/dominio/unidades'
import type { Ficha, TipoFicha } from '@/dominio/tipos'

type Aba = 'pratos' | 'preparos' | 'biblioteca'

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'pratos', rotulo: 'Pratos' },
  { valor: 'preparos', rotulo: 'Preparos' },
  { valor: 'biblioteca', rotulo: 'Biblioteca' },
]

export default function Receitas() {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const navegar = useNavigate()
  const fichas = useFichas(espacoAtivo?.id ?? null)
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const [aba, setAba] = useState<Aba>('pratos')
  const [busca, setBusca] = useState('')
  const [escolhendoTipo, setEscolhendoTipo] = useState(false)

  const filtradas = useMemo(() => {
    const lista = fichas ?? []
    return lista.filter((f) => {
      if (!combina(`${f.nome} ${f.categoria}`, busca)) return false
      if (aba === 'biblioteca') return f.espaco_id === null
      if (f.espaco_id === null) return false
      return aba === 'pratos' ? f.tipo === 'prato' : f.tipo === 'preparo'
    })
  }, [fichas, busca, aba])

  async function criar(tipo: TipoFicha) {
    const nova = fichaEmBranco({ donoId: usuario!.id, espacoId: espacoAtivo!.id }, tipo)
    await salvarFicha({ ...nova, nome: tipo === 'prato' ? 'Novo prato' : 'Novo preparo' })
    setEscolhendoTipo(false)
    navegar(`/receitas/${nova.id}`)
  }

  return (
    <>
      <TituloTela
        titulo="Receitas"
        subtitulo="Um prato é feito de preparos, e um preparo pode conter outros. Escreva uma vez e o custo, o checklist e a lista de compras saem daí."
      />

      <div className="mb-3 flex gap-2">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar receita…" />
        <button
          type="button"
          className="botao-principal shrink-0 px-3"
          onClick={() => setEscolhendoTipo(true)}
          aria-label="Nova receita"
        >
          <IconeMais className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-painel p-1">
        {ABAS.map((item) => (
          <button
            key={item.valor}
            type="button"
            onClick={() => setAba(item.valor)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
              aba === item.valor ? 'bg-painel2 font-medium text-brasa' : 'text-texto2'
            }`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {fichas === undefined ? (
        <p className="text-sm text-texto2">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <Vazio titulo={tituloVazio(aba, busca)} texto={textoVazio(aba, busca)} />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((ficha) => (
            <li key={ficha.id}>
              <CartaoFicha
                ficha={ficha}
                custo={ctx ? explodirFicha(ctx, ficha.id).raiz.custo : null}
                aoAbrir={() => navegar(`/receitas/${ficha.id}`)}
              />
            </li>
          ))}
        </ul>
      )}

      {escolhendoTipo ? (
        <Folha titulo="O que você vai escrever?" aoFechar={() => setEscolhendoTipo(false)}>
          <div className="space-y-2">
            <button
              type="button"
              className="cartao w-full bg-painel2 text-left hover:border-brasa/40"
              onClick={() => criar('prato')}
            >
              <span className="block font-medium">Prato</span>
              <span className="mt-1 block text-sm text-texto2">
                O que vai na mesa. Normalmente é a montagem final, juntando vários preparos.
              </span>
            </button>
            <button
              type="button"
              className="cartao w-full bg-painel2 text-left hover:border-brasa/40"
              onClick={() => criar('preparo')}
            >
              <span className="block font-medium">Preparo</span>
              <span className="mt-1 block text-sm text-texto2">
                Fundo, molho, massa, confit. Rende uma quantidade e entra dentro de pratos — ou de
                outros preparos.
              </span>
            </button>
          </div>
        </Folha>
      ) : null}
    </>
  )
}

function CartaoFicha({
  ficha,
  custo,
  aoAbrir,
}: {
  ficha: Ficha
  custo: number | null
  aoAbrir: () => void
}) {
  const porPorcao = custoPorPorcao(custo, ficha.porcoes)

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="cartao flex w-full items-center justify-between gap-3 text-left hover:border-brasa/40"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{ficha.nome || 'Sem nome'}</span>
          {ficha.espaco_id === null ? (
            <span className="shrink-0 rounded bg-painel2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-texto2">
              biblioteca
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-texto2">
          Rende {formatarMedida(ficha.rendimento_quantidade, ficha.rendimento_unidade)}
          {ficha.porcoes > 0 ? ` · ${formatarQuantidadePorcoes(ficha.porcoes)}` : ''}
          {ficha.categoria ? ` · ${ficha.categoria}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {porPorcao !== null ? (
          <>
            <span className="block text-sm font-medium">{formatarReais(porPorcao)}</span>
            <span className="block text-xs text-texto2">por porção</span>
          </>
        ) : (
          <span className="block text-sm text-alerta">custo aberto</span>
        )}
      </span>
    </button>
  )
}

function formatarQuantidadePorcoes(porcoes: number): string {
  return porcoes === 1 ? '1 porção' : `${porcoes} porções`
}

function tituloVazio(aba: Aba, busca: string): string {
  if (busca) return 'Nada com esse nome'
  if (aba === 'pratos') return 'Nenhum prato ainda'
  if (aba === 'preparos') return 'Nenhum preparo ainda'
  return 'Biblioteca vazia'
}

function textoVazio(aba: Aba, busca: string): string {
  if (busca) return 'Tente outro termo, ou crie essa receita agora.'
  if (aba === 'pratos') {
    return 'Prato é o que vai na mesa. Ele junta preparos e ingredientes, e é ele que entra no menu do dia.'
  }
  if (aba === 'preparos') {
    return 'Preparo é o fundo, o molho, a massa. Rende uma quantidade e entra dentro de pratos — ou de outros preparos.'
  }
  return 'A biblioteca guarda as receitas que são suas e não da casa: fundos, molhos mãe, massas. Elas aparecem em todos os restaurantes. Abra uma receita e use "mover para a biblioteca".'
}
