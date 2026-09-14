import { useMemo, useState } from 'react'
import { useEspacos } from '@/dados/espacos'
import {
  useComprasDaOrigem,
  useContextoArvore,
  useItensDoMenu,
  useMenus,
  useServicos,
} from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { formatarDataCurta, limparMarcasDeCompra, marcarCompra } from '@/dados/repositorio'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { explodirFicha } from '@/dominio/arvore'
import type { NoArvore } from '@/dominio/arvore'
import { achatarParaInsumos, agrupar, custoTotal, listaEmTexto } from '@/dominio/compras'
import type { ChaveAgrupamento } from '@/dominio/compras'
import { formatarMedida, formatarReais } from '@/dominio/unidades'
import type { OrigemCompra, Uuid } from '@/dominio/tipos'

interface Origem {
  tipo: OrigemCompra
  id: Uuid
  rotulo: string
}

export default function Compras() {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const menus = useMenus(espacoAtivo?.id ?? null)
  const servicos = useServicos(espacoAtivo?.id ?? null)
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const origens: Origem[] = useMemo(
    () => [
      ...(servicos ?? []).map((s) => ({
        tipo: 'servico' as const,
        id: s.id,
        rotulo: `Serviço de ${formatarDataCurta(s.data)}${s.nome ? ` · ${s.nome}` : ''}`,
      })),
      ...(menus ?? []).map((m) => ({
        tipo: 'menu' as const,
        id: m.id,
        rotulo: `Menu · ${m.nome || 'Sem nome'}`,
      })),
    ],
    [servicos, menus],
  )

  const [origemId, setOrigemId] = useState<Uuid | ''>('')
  const [agrupamento, setAgrupamento] = useState<ChaveAgrupamento>('categoria')
  const [copiado, setCopiado] = useState(false)

  const origem = origens.find((o) => o.id === origemId) ?? origens[0] ?? null
  const marcas = useComprasDaOrigem(origem?.id ?? null)
  const itensDoMenu = useItensDoMenu(origem?.tipo === 'menu' ? origem.id : null)
  const servico = servicos?.find((s) => s.id === origem?.id)

  const linhas = useMemo(() => {
    if (!ctx || !origem) return []

    // Menu e serviço entram na mesma conta: os dois são só uma lista de pratos
    // com porções. Daí para a frente, é a mesma árvore achatada até as folhas.
    const pedidos =
      origem.tipo === 'menu'
        ? (itensDoMenu ?? []).map((i) => ({ fichaId: i.ficha_id, porcoes: i.porcoes_previstas }))
        : (servico?.itens ?? []).map((i) => ({ fichaId: i.ficha_id, porcoes: i.porcoes }))

    const raizes = pedidos
      .map(({ fichaId, porcoes }) => {
        const ficha = ctx.fichas.get(fichaId)
        if (!ficha) return null
        return { rotulo: ficha.nome, no: explodirFicha(ctx, fichaId, { porcoes }).raiz }
      })
      .filter((r): r is { rotulo: string; no: NoArvore } => r !== null)

    return achatarParaInsumos(raizes, ctx.insumos)
  }, [ctx, origem, itensDoMenu, servico])

  const grupos = useMemo(() => agrupar(linhas, agrupamento), [linhas, agrupamento])
  const total = custoTotal(linhas)
  const comprados = linhas.filter((l) => marcas?.get(l.insumoId)?.comprado).length

  async function alternar(insumoId: Uuid, comprado: boolean) {
    if (!origem || !usuario || !espacoAtivo) return
    await marcarCompra(
      { donoId: usuario.id, espacoId: espacoAtivo.id },
      { tipo: origem.tipo, id: origem.id },
      insumoId,
      comprado,
    )
  }

  async function copiar() {
    const texto = listaEmTexto(grupos, {
      titulo: `Compras — ${origem?.rotulo ?? ''}`,
      incluirCusto: false,
    })
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sem permissão de área de transferência: abrir o WhatsApp ainda funciona.
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    }
  }

  return (
    <>
      <TituloTela
        titulo="Compras"
        subtitulo="Sai sozinha das receitas do menu, já somada e já corrigida pelo fator de correção — é o peso bruto, o que você de fato compra."
      />

      {origens.length === 0 ? (
        <Vazio
          titulo="Nada para comprar ainda"
          texto="A lista nasce de um menu ou de um dia de serviço. Monte um menu com os pratos e volte aqui: cada ingrediente aparece uma vez só, com a soma de tudo que o menu exige."
        />
      ) : (
        <>
          <div className="mb-3">
            <label className="rotulo" htmlFor="origem-compras">
              Comprar para
            </label>
            <select
              id="origem-compras"
              className="campo"
              value={origem?.id ?? ''}
              onChange={(e) => setOrigemId(e.target.value)}
            >
              {origens.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex gap-1 rounded-xl bg-painel p-1">
            {(['categoria', 'fornecedor'] as const).map((chave) => (
              <button
                key={chave}
                type="button"
                onClick={() => setAgrupamento(chave)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize transition ${
                  agrupamento === chave ? 'bg-painel2 font-medium text-brasa' : 'text-texto2'
                }`}
              >
                Por {chave}
              </button>
            ))}
          </div>

          {linhas.length === 0 ? (
            <Vazio
              titulo="Sem ingredientes nesta lista"
              texto="Os pratos deste menu ainda não têm insumos nas fichas, ou o menu está vazio."
            />
          ) : (
            <>
              <div className="cartao mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-texto2">
                    {comprados} de {linhas.length} itens marcados
                  </p>
                  <p className="text-lg font-semibold">
                    {total !== null ? formatarReais(total) : 'custo em aberto'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {comprados > 0 ? (
                    <button
                      type="button"
                      className="botao-secundario px-3 py-1.5 text-sm"
                      onClick={() => origem && void limparMarcasDeCompra(origem.id)}
                    >
                      Limpar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="botao-principal px-3 py-1.5 text-sm"
                    onClick={copiar}
                  >
                    {copiado ? 'Copiado!' : 'Copiar lista'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {grupos.map((grupo) => (
                  <section key={grupo.titulo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                      <h2 className="text-xs uppercase tracking-wide text-texto2">{grupo.titulo}</h2>
                      <span className="text-xs text-texto2">
                        {grupo.custo !== null ? formatarReais(grupo.custo) : '—'}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {grupo.linhas.map((linha) => {
                        const comprado = marcas?.get(linha.insumoId)?.comprado ?? false
                        return (
                          <li key={linha.insumoId}>
                            <button
                              type="button"
                              onClick={() => void alternar(linha.insumoId, !comprado)}
                              className="flex w-full items-start gap-3 rounded-xl bg-painel px-3 py-2.5 text-left"
                            >
                              <span
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                                  comprado
                                    ? 'border-erva bg-erva text-fundo'
                                    : 'border-borda text-transparent'
                                }`}
                                aria-hidden="true"
                              >
                                ✓
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span
                                    className={`truncate font-medium ${
                                      comprado ? 'text-texto2 line-through' : ''
                                    }`}
                                  >
                                    {linha.nome}
                                  </span>
                                  <span className="shrink-0 text-sm">
                                    {linha.quantidadeCompra !== null
                                      ? formatarMedida(linha.quantidadeCompra, linha.unidadeCompra)
                                      : formatarMedida(linha.quantidadeBruta, linha.unidadeUso)}
                                  </span>
                                </span>
                                <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-texto2">
                                  <span className="truncate">para {linha.usadoEm.join(', ')}</span>
                                  <span className="shrink-0">
                                    {linha.custo !== null ? formatarReais(linha.custo) : '—'}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>

              <p className="mt-4 text-xs leading-relaxed text-texto2">
                As quantidades já vêm em peso bruto: o fator de correção de cada insumo foi aplicado,
                então é isto que você pede ao fornecedor, não o que entra na panela. O que já estiver
                na despensa, você desconta na hora de pedir.
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}
