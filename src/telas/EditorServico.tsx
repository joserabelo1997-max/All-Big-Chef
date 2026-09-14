import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { useContextoArvore, useFichas, useServico } from '@/dados/consultas'
import {
  apagarServico,
  formatarDataCurta,
  registrarNoHistorico,
  salvarServico,
} from '@/dados/repositorio'
import { Busca, CampoNumero, CampoTexto, combina } from '@/ui/Campos'
import { Folha } from '@/ui/SeletorEspaco'
import { IconeMais } from '@/ui/Icones'
import { explodirFicha } from '@/dominio/arvore'
import { formatarMedida, formatarReais } from '@/dominio/unidades'
import type { ServicoItem, SnapshotNo, SnapshotServico } from '@/dominio/tipos'

export default function EditorServico() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { espacoAtivo } = useEspacos()
  const servico = useServico(id ?? null)
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const [adicionando, setAdicionando] = useState(false)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  const [vendo, setVendo] = useState<SnapshotServico | null>(null)

  if (servico === undefined) return <p className="text-sm text-texto2">Carregando…</p>
  if (servico === null) {
    return (
      <div className="cartao">
        <p className="text-sm text-texto2">Esse serviço não existe mais.</p>
        <button type="button" className="botao-secundario mt-3" onClick={() => navegar('/servicos')}>
          Voltar
        </button>
      </div>
    )
  }

  const nomeDaFicha = (fichaId: string) => fichas.find((f) => f.id === fichaId)?.nome ?? 'Prato apagado'

  const custoAtual = servico.itens.reduce<number | null>((total, item) => {
    if (total === null || !ctx) return null
    const { raiz } = explodirFicha(ctx, item.ficha_id, { porcoes: item.porcoes })
    return raiz.custo === null ? null : total + raiz.custo
  }, 0)

  const jaNoServico = new Set(servico.itens.map((i) => i.ficha_id))
  const disponiveis = fichas.filter(
    (f) => f.tipo === 'prato' && !jaNoServico.has(f.id) && combina(`${f.nome} ${f.categoria}`, busca),
  )

  async function mudarItens(itens: ServicoItem[]) {
    await salvarServico({ ...servico!, itens })
  }

  // Registrar é o gesto que fecha o dia. Enquanto não se registra, o serviço é um
  // rascunho; depois de registrado, aquela versão fica guardada para sempre.
  async function registrar() {
    if (!ctx) return
    setSalvando(true)
    try {
      const atualizado = await registrarNoHistorico(servico!, ctx)
      const versao = atualizado.snapshots[atualizado.snapshots.length - 1]?.versao ?? 1
      setRecado(
        versao === 1
          ? 'Dia registrado no histórico.'
          : `Versão ${versao} guardada. As anteriores continuam lá.`,
      )
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => navegar('/servicos')}
          className="botao-fantasma -ml-2 px-2 py-1 text-sm"
        >
          ← Serviços
        </button>
        <button
          type="button"
          onClick={() => navegar(`/producao?servico=${servico.id}`)}
          className="botao-secundario px-3 py-1.5 text-sm"
        >
          Ir para a produção
        </button>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{formatarDataCurta(servico.data)}</h1>
        <p className="text-sm text-texto2">
          {servico.snapshots.length === 0
            ? 'Rascunho — ainda não registrado no histórico.'
            : `${servico.snapshots.length} ${servico.snapshots.length === 1 ? 'versão registrada' : 'versões registradas'}.`}
        </p>
      </div>

      <CampoTexto
        rotulo="Nome do serviço"
        valor={servico.nome}
        aoMudar={(v) => void salvarServico({ ...servico, nome: v })}
        placeholder="Almoço"
      />

      <div className="cartao space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Pratos do dia</p>
          <button
            type="button"
            className="botao-secundario px-3 py-1.5 text-sm"
            onClick={() => setAdicionando(true)}
          >
            <IconeMais className="h-4 w-4" />
            Adicionar
          </button>
        </div>

        {servico.itens.length === 0 ? (
          <p className="py-3 text-center text-sm text-texto2">
            Nenhum prato no dia ainda. Adicione um a um, ou abra outro dia a partir de um menu.
          </p>
        ) : (
          <ul className="space-y-2">
            {servico.itens.map((item, indice) => (
              <li key={`${item.ficha_id}-${indice}`} className="rounded-xl bg-painel2 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{nomeDaFicha(item.ficha_id)}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${nomeDaFicha(item.ficha_id)}`}
                    className="shrink-0 text-texto2 hover:text-perigo"
                    onClick={() =>
                      void mudarItens(servico.itens.filter((_, i) => i !== indice))
                    }
                  >
                    ×
                  </button>
                </div>
                <CampoNumero
                  rotulo="Porções"
                  valor={item.porcoes}
                  aoMudar={(v) =>
                    void mudarItens(
                      servico.itens.map((atual, i) =>
                        i === indice ? { ...atual, porcoes: v } : atual,
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {servico.itens.length > 0 ? (
          <p className="rounded-xl bg-painel px-3 py-2.5 text-sm">
            Custo de insumo do dia:{' '}
            <span className="font-semibold text-brasa">
              {custoAtual !== null ? formatarReais(custoAtual) : 'em aberto'}
            </span>
          </p>
        ) : null}
      </div>

      <CampoTexto
        rotulo="Observação do dia"
        valor={servico.observacao}
        aoMudar={(v) => void salvarServico({ ...servico, observacao: v })}
        placeholder="Faltou alcaparra, troquei por azeitona"
      />

      <div className="cartao space-y-3">
        <button
          type="button"
          className="botao-principal w-full"
          disabled={salvando || servico.itens.length === 0}
          onClick={registrar}
        >
          {salvando ? 'Registrando…' : 'Registrar no histórico'}
        </button>
        <p className="text-xs leading-relaxed text-texto2">
          Registrar congela uma cópia do dia — nomes, quantidades e modo de preparo escritos por
          extenso. Mudar a receita amanhã não altera o que ficou guardado aqui. Cada novo registro
          acrescenta uma versão em vez de substituir a anterior.
        </p>
        {recado ? <p className="text-sm text-erva">{recado}</p> : null}
      </div>

      {servico.snapshots.length > 0 ? (
        <div className="cartao space-y-2">
          <p className="text-sm font-medium">Histórico deste dia</p>
          <ul className="space-y-1.5">
            {[...servico.snapshots].reverse().map((snapshot) => (
              <li key={snapshot.versao}>
                <button
                  type="button"
                  onClick={() => setVendo(snapshot)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-painel2 px-3 py-2.5 text-left hover:bg-borda"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Versão {snapshot.versao}</span>
                    <span className="block text-xs text-texto2">
                      {new Date(snapshot.gerado_em).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {snapshot.pratos.length}{' '}
                      {snapshot.pratos.length === 1 ? 'prato' : 'pratos'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm">
                    {snapshot.custo_total !== null ? formatarReais(snapshot.custo_total) : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        className="botao-fantasma w-full text-sm text-perigo"
        onClick={() => setConfirmandoApagar(true)}
      >
        Apagar serviço
      </button>

      {adicionando ? (
        <Folha titulo="Adicionar prato ao dia" aoFechar={() => setAdicionando(false)}>
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar prato…" />
          <ul className="mt-3 space-y-1">
            {disponiveis.length === 0 ? (
              <li className="rounded-xl bg-painel2 px-3 py-3 text-sm text-texto2">
                Nenhum prato disponível com esse nome.
              </li>
            ) : (
              disponiveis.map((prato) => (
                <li key={prato.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-painel2 px-3 py-2.5 text-left hover:bg-borda"
                    onClick={async () => {
                      await mudarItens([
                        ...servico.itens,
                        { ficha_id: prato.id, porcoes: prato.porcoes },
                      ])
                      setAdicionando(false)
                    }}
                  >
                    <span className="block text-sm font-medium">{prato.nome || 'Sem nome'}</span>
                    <span className="block text-xs text-texto2">
                      A ficha rende {prato.porcoes} {prato.porcoes === 1 ? 'porção' : 'porções'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Folha>
      ) : null}

      {vendo ? <VerVersao snapshot={vendo} aoFechar={() => setVendo(null)} /> : null}

      {confirmandoApagar ? (
        <Folha titulo="Apagar serviço" aoFechar={() => setConfirmandoApagar(false)}>
          <p className="text-sm text-texto2">
            O histórico deste dia some junto, e com ele a cópia das receitas como estavam. Isso não
            tem volta.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => setConfirmandoApagar(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao flex-1 bg-perigo text-fundo"
              onClick={async () => {
                await apagarServico(servico.id)
                navegar('/servicos')
              }}
            >
              Apagar
            </button>
          </div>
        </Folha>
      ) : null}
    </div>
  )
}

/**
 * A versão congelada, como ela foi guardada. Nada aqui é lido do cadastro atual —
 * é justamente esse o ponto.
 */
function VerVersao({
  snapshot,
  aoFechar,
}: {
  snapshot: SnapshotServico
  aoFechar: () => void
}) {
  return (
    <Folha titulo={`Versão ${snapshot.versao}`} aoFechar={aoFechar}>
      <p className="mb-3 text-xs text-texto2">
        Registrado em{' '}
        {new Date(snapshot.gerado_em).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
        . Esta é a cópia guardada, não o cadastro de hoje.
      </p>

      <div className="space-y-3">
        {snapshot.pratos.map((prato) => (
          <div key={prato.ficha_id} className="rounded-xl bg-painel2 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-medium">{prato.nome}</span>
              <span className="shrink-0 text-sm text-texto2">
                {prato.porcoes} {prato.porcoes === 1 ? 'porção' : 'porções'}
              </span>
            </div>
            {prato.custo_total !== null ? (
              <p className="mb-2 text-xs text-texto2">
                Custou {formatarReais(prato.custo_total)} naquele dia.
              </p>
            ) : null}
            <ArvoreCongelada nos={prato.arvore} />
          </div>
        ))}
      </div>
    </Folha>
  )
}

function ArvoreCongelada({ nos, nivel = 0 }: { nos: SnapshotNo[]; nivel?: number }) {
  return (
    <ul className={nivel > 0 ? 'mt-1 space-y-1 border-l border-borda pl-3' : 'space-y-1'}>
      {nos.map((no, indice) => (
        <li key={`${no.ref_id}-${indice}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className={no.tipo === 'ficha' ? 'font-medium' : 'text-texto2'}>{no.nome}</span>
            <span className="shrink-0 text-xs text-texto2">
              {formatarMedida(no.quantidade, no.unidade)}
            </span>
          </div>
          {no.modo_preparo && no.modo_preparo.length > 0 ? (
            <ol className="mt-1 space-y-0.5 pl-3 text-xs text-texto2">
              {no.modo_preparo.map((passo, i) => (
                <li key={i}>
                  {i + 1}. {passo}
                </li>
              ))}
            </ol>
          ) : null}
          {no.filhos && no.filhos.length > 0 ? (
            <ArvoreCongelada nos={no.filhos} nivel={nivel + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
