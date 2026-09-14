import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { useContextoArvore, useProducaoDoServico, useServicos } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import {
  PROXIMO_STATUS,
  anotarProducao,
  formatarDataCurta,
  mudarStatusProducao,
} from '@/dados/repositorio'
import { CampoNumero, CampoTexto } from '@/ui/Campos'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { Folha } from '@/ui/SeletorEspaco'
import { explodirFicha } from '@/dominio/arvore'
import type { NoArvore } from '@/dominio/arvore'
import { calcularProgresso, consolidarProducao } from '@/dominio/producao'
import type { TarefaConsolidada } from '@/dominio/producao'
import { formatarMedida } from '@/dominio/unidades'
import type { ProducaoItem, StatusProducao, Uuid } from '@/dominio/tipos'

type Visao = 'prato' | 'preparo'

export default function Producao() {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const [parametros, setParametros] = useSearchParams()
  const servicos = useServicos(espacoAtivo?.id ?? null)
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const [visao, setVisao] = useState<Visao>('prato')
  const [detalhando, setDetalhando] = useState<{ fichaId: Uuid; nome: string } | null>(null)

  const servicoId = parametros.get('servico') ?? servicos?.[0]?.id ?? null
  const servico = servicos?.find((s) => s.id === servicoId) ?? null
  const producao = useProducaoDoServico(servicoId)

  // A explosão das árvores é a mesma coisa que alimenta o custo e as compras.
  // Aqui ela é lida como lista de trabalho.
  const { raizes, tarefas } = useMemo(() => {
    if (!ctx || !servico) return { raizes: [] as { rotulo: string; no: NoArvore }[], tarefas: [] }
    const lista = servico.itens
      .map((item) => {
        const ficha = ctx.fichas.get(item.ficha_id)
        if (!ficha) return null
        return {
          rotulo: ficha.nome,
          no: explodirFicha(ctx, item.ficha_id, { porcoes: item.porcoes }).raiz,
        }
      })
      .filter((r): r is { rotulo: string; no: NoArvore } => r !== null)
    return { raizes: lista, tarefas: consolidarProducao(lista, ctx) }
  }, [ctx, servico])

  const statusPorFicha = useMemo(() => {
    const mapa = new Map<Uuid, string>()
    for (const [fichaId, item] of producao ?? []) mapa.set(fichaId, item.status)
    return mapa
  }, [producao])

  const progresso = calcularProgresso(
    tarefas.map((t) => t.fichaId),
    statusPorFicha,
  )

  async function alternar(fichaId: Uuid) {
    if (!servicoId || !usuario || !espacoAtivo) return
    const atual = (producao?.get(fichaId)?.status ?? 'a_fazer') as StatusProducao
    await mudarStatusProducao(
      { donoId: usuario.id, espacoId: espacoAtivo.id },
      servicoId,
      fichaId,
      PROXIMO_STATUS[atual],
    )
  }

  return (
    <>
      <TituloTela
        titulo="Produção"
        subtitulo="A mise en place do serviço, ramificada a partir dos pratos. Toque para avançar: a fazer → fazendo → feito."
      />

      {servicos === undefined ? (
        <p className="text-sm text-texto2">Carregando…</p>
      ) : servicos.length === 0 ? (
        <Vazio
          titulo="Nenhum serviço aberto"
          texto="A produção sai de um dia de serviço. Abra o dia em Serviços, carregando um menu, e ele aparece aqui com todos os preparos já ramificados."
        />
      ) : (
        <>
          <div className="mb-3">
            <label className="rotulo" htmlFor="servico-producao">
              Serviço
            </label>
            <select
              id="servico-producao"
              className="campo"
              value={servicoId ?? ''}
              onChange={(e) => setParametros({ servico: e.target.value })}
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatarDataCurta(s.data)}
                  {s.nome ? ` · ${s.nome}` : ''}
                </option>
              ))}
            </select>
          </div>

          <BarraDeProgresso feitos={progresso.feitos} total={progresso.total} />

          <div className="mb-4 mt-4 flex gap-1 rounded-xl bg-painel p-1">
            <BotaoVisao atual={visao} valor="prato" aoEscolher={setVisao}>
              Por prato
            </BotaoVisao>
            <BotaoVisao atual={visao} valor="preparo" aoEscolher={setVisao}>
              Por preparo
            </BotaoVisao>
          </div>

          <p className="mb-3 text-xs leading-relaxed text-texto2">
            {visao === 'prato'
              ? 'Cada prato abrindo seus preparos, como a receita é escrita. Serve para ver a estrutura e conferir se não falta nada.'
              : 'Cada preparo uma vez só, com a soma de tudo que o serviço exige e a ordem de trabalho — o que está mais embaixo vem primeiro. Serve para produzir.'}
          </p>

          {tarefas.length === 0 ? (
            <Vazio
              titulo="Este dia ainda não tem pratos"
              texto="Abra o serviço e adicione os pratos do dia. Os preparos aparecem aqui sozinhos."
            />
          ) : visao === 'prato' ? (
            <ul className="space-y-3">
              {raizes.map(({ no }) => (
                <li key={no.caminho} className="cartao">
                  <ArvoreDeTarefas
                    no={no}
                    producao={producao}
                    aoAlternar={alternar}
                    aoDetalhar={(fichaId, nome) => setDetalhando({ fichaId, nome })}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {tarefas.map((tarefa) => (
                <li key={tarefa.fichaId}>
                  <LinhaConsolidada
                    tarefa={tarefa}
                    item={producao?.get(tarefa.fichaId)}
                    aoAlternar={() => void alternar(tarefa.fichaId)}
                    aoDetalhar={() => setDetalhando({ fichaId: tarefa.fichaId, nome: tarefa.nome })}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {detalhando && servicoId ? (
        <DetalheDaTarefa
          servicoId={servicoId}
          fichaId={detalhando.fichaId}
          nome={detalhando.nome}
          item={producao?.get(detalhando.fichaId)}
          aoFechar={() => setDetalhando(null)}
        />
      ) : null}
    </>
  )
}

function BotaoVisao({
  atual,
  valor,
  aoEscolher,
  children,
}: {
  atual: Visao
  valor: Visao
  aoEscolher: (v: Visao) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => aoEscolher(valor)}
      className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
        atual === valor ? 'bg-painel2 font-medium text-brasa' : 'text-texto2'
      }`}
    >
      {children}
    </button>
  )
}

function BarraDeProgresso({ feitos, total }: { feitos: number; total: number }) {
  const fracao = total > 0 ? feitos / total : 0
  return (
    <div className="cartao">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-texto2">Preparos prontos</span>
        <span className="text-sm font-medium">
          {feitos} de {total}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-painel2"
        role="progressbar"
        aria-valuenow={feitos}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Progresso da produção"
      >
        <div
          className={`h-full rounded-full transition-all ${fracao === 1 ? 'bg-erva' : 'bg-brasa'}`}
          style={{ width: `${fracao * 100}%` }}
        />
      </div>
    </div>
  )
}

/** A visão por prato: a árvore como a receita foi escrita, com caixas de marcar. */
function ArvoreDeTarefas({
  no,
  producao,
  aoAlternar,
  aoDetalhar,
  nivel = 0,
}: {
  no: NoArvore
  producao: Map<Uuid, ProducaoItem> | undefined
  aoAlternar: (fichaId: Uuid) => void
  aoDetalhar: (fichaId: Uuid, nome: string) => void
  nivel?: number
}) {
  if (no.tipo === 'insumo') {
    return (
      <div className="flex items-baseline justify-between gap-2 py-1 pl-7 text-sm text-texto2">
        <span className="truncate">{no.nome}</span>
        <span className="shrink-0 text-xs">{formatarMedida(no.quantidade, no.unidade)}</span>
      </div>
    )
  }

  const status = (producao?.get(no.refId)?.status ?? 'a_fazer') as StatusProducao
  const filhosFicha = no.filhos.filter((f) => f.tipo === 'ficha')
  const filhosInsumo = no.filhos.filter((f) => f.tipo === 'insumo')

  return (
    <div className={nivel > 0 ? 'border-l border-borda pl-3' : ''}>
      <div className="flex items-center gap-2">
        <MarcaDeStatus status={status} aoTocar={() => aoAlternar(no.refId)} nome={no.nome} />
        <button
          type="button"
          onClick={() => aoDetalhar(no.refId, no.nome)}
          className="flex min-w-0 flex-1 items-baseline justify-between gap-2 py-1.5 text-left"
        >
          <span
            className={`truncate ${nivel === 0 ? 'font-medium' : 'text-sm'} ${
              status === 'feito' ? 'text-texto2 line-through' : ''
            }`}
          >
            {no.nome}
          </span>
          <span className="shrink-0 text-xs text-texto2">
            {formatarMedida(no.quantidade, no.unidade)}
          </span>
        </button>
      </div>

      {filhosFicha.length > 0 || filhosInsumo.length > 0 ? (
        <div className="ml-3 mt-1">
          {filhosFicha.map((filho) => (
            <ArvoreDeTarefas
              key={filho.caminho}
              no={filho}
              producao={producao}
              aoAlternar={aoAlternar}
              aoDetalhar={aoDetalhar}
              nivel={nivel + 1}
            />
          ))}
          {filhosInsumo.map((filho) => (
            <ArvoreDeTarefas
              key={filho.caminho}
              no={filho}
              producao={producao}
              aoAlternar={aoAlternar}
              aoDetalhar={aoDetalhar}
              nivel={nivel + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A visão por preparo: o trabalho real, sem repetição e na ordem de fazer. */
function LinhaConsolidada({
  tarefa,
  item,
  aoAlternar,
  aoDetalhar,
}: {
  tarefa: TarefaConsolidada
  item: ProducaoItem | undefined
  aoAlternar: () => void
  aoDetalhar: () => void
}) {
  const status = (item?.status ?? 'a_fazer') as StatusProducao
  const quantidade = item?.quantidade_ajustada ?? tarefa.quantidade

  return (
    <div className="cartao flex items-start gap-3">
      <MarcaDeStatus status={status} aoTocar={aoAlternar} nome={tarefa.nome} />
      <button type="button" onClick={aoDetalhar} className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate font-medium ${status === 'feito' ? 'text-texto2 line-through' : ''}`}
          >
            {tarefa.nome}
          </span>
          <span className="shrink-0 text-sm">
            {formatarMedida(quantidade, tarefa.unidade)}
            {item?.quantidade_ajustada !== null && item?.quantidade_ajustada !== undefined ? (
              <span className="ml-1 text-xs text-alerta">ajustado</span>
            ) : null}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-texto2">
          {tarefa.tipo === 'prato' ? 'Montagem · ' : ''}
          {tarefa.usadoEm.length > 1 || tarefa.tipo === 'preparo'
            ? `usado em ${tarefa.usadoEm.join(', ')}`
            : 'prato do dia'}
        </span>
        {tarefa.incerta ? (
          <span className="mt-1 block text-xs text-alerta">
            Alguma quantidade está em unidade que não converte; confira antes de produzir.
          </span>
        ) : null}
        {item?.nota ? (
          <span className="mt-1 block text-xs text-brasa2">{item.nota}</span>
        ) : null}
      </button>
    </div>
  )
}

const ROTULO_STATUS: Record<StatusProducao, string> = {
  a_fazer: 'a fazer',
  fazendo: 'fazendo',
  feito: 'feito',
}

function MarcaDeStatus({
  status,
  aoTocar,
  nome,
}: {
  status: StatusProducao
  aoTocar: () => void
  nome: string
}) {
  const estilo =
    status === 'feito'
      ? 'border-erva bg-erva text-fundo'
      : status === 'fazendo'
        ? 'border-alerta text-alerta'
        : 'border-borda text-transparent'

  return (
    <button
      type="button"
      onClick={aoTocar}
      aria-label={`${nome}: ${ROTULO_STATUS[status]}. Tocar para avançar.`}
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold transition active:scale-90 ${estilo}`}
    >
      {status === 'feito' ? '✓' : status === 'fazendo' ? '•' : '✓'}
    </button>
  )
}

/**
 * Ajuste pontual sem sair da tela: hoje sai meia receita do molho, ou fica um
 * recado para quem pega o turno seguinte.
 */
function DetalheDaTarefa({
  servicoId,
  fichaId,
  nome,
  item,
  aoFechar,
}: {
  servicoId: Uuid
  fichaId: Uuid
  nome: string
  item: ProducaoItem | undefined
  aoFechar: () => void
}) {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const autor = { donoId: usuario!.id, espacoId: espacoAtivo!.id }

  const [quantidade, setQuantidade] = useState(item?.quantidade_ajustada ?? 0)
  const [nota, setNota] = useState(item?.nota ?? '')

  return (
    <Folha titulo={nome} aoFechar={aoFechar}>
      <div className="space-y-4">
        <CampoNumero
          rotulo="Quantidade ajustada"
          valor={quantidade}
          aoMudar={setQuantidade}
          dica="Só para hoje. Deixe em zero para usar a quantidade que veio da receita."
        />
        <CampoTexto
          rotulo="Nota"
          valor={nota}
          aoMudar={setNota}
          placeholder="Faltou alcaparra, usei azeitona"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="botao-principal flex-1"
            onClick={async () => {
              await anotarProducao(autor, servicoId, fichaId, {
                quantidade_ajustada: quantidade > 0 ? quantidade : null,
                nota,
              })
              aoFechar()
            }}
          >
            Salvar
          </button>
          {item?.quantidade_ajustada !== null && item?.quantidade_ajustada !== undefined ? (
            <button
              type="button"
              className="botao-secundario"
              onClick={async () => {
                await anotarProducao(autor, servicoId, fichaId, { quantidade_ajustada: null })
                aoFechar()
              }}
            >
              Voltar à receita
            </button>
          ) : null}
        </div>
      </div>
    </Folha>
  )
}
