import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import {
  useContextoArvore,
  useFichas,
  useInsumos,
  useProducaoDoServico,
  useServicos,
} from '@/dados/consultas'
import { formatarDataCurta, hojeEmIso } from '@/dados/repositorio'
import { TituloTela } from '@/ui/Cabecalhos'
import { explodirFicha } from '@/dominio/arvore'
import { consolidarProducao } from '@/dominio/producao'
import { precoPorUnidadeDeUso } from '@/dominio/custo'
import { formatarPercentual, formatarReais } from '@/dominio/unidades'
import { FAIXAS_CMV } from '@/dominio/cmv'

/**
 * A tela que abre. Responde a três perguntas, nesta ordem: o que é hoje, o que
 * ainda falta fazer, e o que está impedindo alguma conta de fechar.
 */
export default function Inicio() {
  const { espacoAtivo } = useEspacos()
  const espacoId = espacoAtivo?.id ?? null

  const servicos = useServicos(espacoId)
  const fichas = useFichas(espacoId)
  const insumos = useInsumos(espacoId)
  const ctx = useContextoArvore(espacoId)

  const hoje = hojeEmIso()
  const servicoDeHoje = servicos?.find((s) => s.data === hoje) ?? null
  const proximo = servicoDeHoje ?? servicos?.[0] ?? null
  const producao = useProducaoDoServico(proximo?.id ?? null)

  const tarefas = useMemo(() => {
    if (!ctx || !proximo) return []
    const raizes = proximo.itens
      .map((item) => {
        const ficha = ctx.fichas.get(item.ficha_id)
        if (!ficha) return null
        return {
          rotulo: ficha.nome,
          no: explodirFicha(ctx, item.ficha_id, { porcoes: item.porcoes }).raiz,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    return consolidarProducao(raizes, ctx)
  }, [ctx, proximo])

  const feitos = tarefas.filter((t) => producao?.get(t.fichaId)?.status === 'feito').length

  const semPreco = (insumos ?? []).filter((i) => precoPorUnidadeDeUso(i) === null)
  const pratos = (fichas ?? []).filter((f) => f.tipo === 'prato')

  return (
    <>
      <TituloTela
        titulo={espacoAtivo?.nome ?? 'Cozinha'}
        subtitulo={
          espacoAtivo
            ? `${FAIXAS_CMV[espacoAtivo.tipo_casa].rotulo} · CMV alvo ${formatarPercentual(espacoAtivo.cmv_alvo, 0)}`
            : undefined
        }
      />

      {proximo ? (
        <Link
          to={`/producao?servico=${proximo.id}`}
          className="cartao mb-3 block hover:border-brasa/40"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {proximo.data === hoje ? 'Serviço de hoje' : `Último serviço · ${formatarDataCurta(proximo.data)}`}
            </span>
            <span className="text-sm text-texto2">
              {feitos} de {tarefas.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-painel2">
            <div
              className={`h-full rounded-full transition-all ${
                tarefas.length > 0 && feitos === tarefas.length ? 'bg-erva' : 'bg-brasa'
              }`}
              style={{ width: `${tarefas.length > 0 ? (feitos / tarefas.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-texto2">
            {proximo.itens.length} {proximo.itens.length === 1 ? 'prato' : 'pratos'}
            {tarefas.length > feitos
              ? ` · ${tarefas.length - feitos} ${tarefas.length - feitos === 1 ? 'preparo pendente' : 'preparos pendentes'}`
              : tarefas.length > 0
                ? ' · mise en place fechada'
                : ''}
          </p>
        </Link>
      ) : (
        <div className="cartao mb-3">
          <p className="font-medium">Nenhum serviço aberto</p>
          <p className="mt-1 text-sm leading-relaxed text-texto2">
            {pratos.length === 0
              ? 'Comece escrevendo as fichas dos seus pratos. Delas saem o custo, o checklist de produção e a lista de compras — os três de uma vez.'
              : 'Monte um menu com os pratos do dia e abra o serviço. O checklist e as compras aparecem sozinhos.'}
          </p>
          <Link
            to={pratos.length === 0 ? '/receitas' : '/servicos'}
            className="botao-principal mt-3 w-full"
          >
            {pratos.length === 0 ? 'Escrever a primeira ficha' : 'Abrir o dia'}
          </Link>
        </div>
      )}

      {semPreco.length > 0 ? (
        <Link to="/insumos" className="cartao mb-3 block border-alerta/40 hover:border-alerta">
          <p className="text-sm font-medium text-alerta">
            {semPreco.length} {semPreco.length === 1 ? 'insumo sem preço' : 'insumos sem preço'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-texto2">
            Enquanto faltar preço, o custo dos pratos que usam{' '}
            {semPreco
              .slice(0, 3)
              .map((i) => i.nome)
              .join(', ')}
            {semPreco.length > 3 ? ' e outros' : ''} fica em aberto — e o CMV teórico não fecha.
          </p>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Resumo
          rotulo="Pratos"
          valor={String(pratos.length)}
          para="/receitas"
          detalhe={`${(fichas ?? []).length - pratos.length} preparos`}
        />
        <Resumo
          rotulo="Insumos"
          valor={String((insumos ?? []).length)}
          para="/insumos"
          detalhe={semPreco.length > 0 ? `${semPreco.length} sem preço` : 'todos com preço'}
        />
        <Resumo
          rotulo="Serviços"
          valor={String((servicos ?? []).length)}
          para="/servicos"
          detalhe="no histórico"
        />
        <Resumo
          rotulo="Custo do dia"
          valor={
            proximo && tarefas.length > 0
              ? custoDoServico(tarefas) !== null
                ? formatarReais(custoDoServico(tarefas)!)
                : 'aberto'
              : '—'
          }
          para="/cmv"
          detalhe="em insumo"
        />
      </div>
    </>
  )
}

function custoDoServico(tarefas: { tipo: string; custo: number | null }[]): number | null {
  // Só os pratos entram na soma: o custo do preparo já está dentro do prato que o
  // usa, e contar os dois seria contar duas vezes.
  const pratos = tarefas.filter((t) => t.tipo === 'prato')
  let total = 0
  for (const prato of pratos) {
    if (prato.custo === null) return null
    total += prato.custo
  }
  return total
}

function Resumo({
  rotulo,
  valor,
  detalhe,
  para,
}: {
  rotulo: string
  valor: string
  detalhe: string
  para: string
}) {
  return (
    <Link to={para} className="cartao hover:border-brasa/40">
      <p className="text-xs text-texto2">{rotulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
      <p className="mt-0.5 text-xs text-texto2">{detalhe}</p>
    </Link>
  )
}
