import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'

import type { MovimentoEstoque, Produto, UnidadeMovimento } from './types'

/**
 * Cálculo de estoque a partir do livro-razão.
 *
 * Fica separado das telas porque erro aqui não aparece na hora: vira compra a
 * menos no meio do serviço, ou comida parada até vencer. Tudo aqui é função
 * pura sobre a lista de movimentos — nenhum estado, nenhum banco —, então cada
 * regra pode ser testada com o caso exato que a cozinha vive.
 *
 * A regra que atravessa o arquivo: **kg e unidade são contagens independentes**,
 * sem conversão entre elas. Um saco fechado de arroz e o arroz a granel são
 * coisas diferentes para quem confere a prateleira, e inventar um fator de
 * conversão faria o sistema afirmar um saldo que ninguém consegue conferir.
 */

/**
 * Casas decimais do banco (`numeric(12,3)`).
 *
 * Somar float sem arredondar produz 9.999999999999998 kg depois de meia dúzia
 * de movimentos, e um saldo assim vaza para a tela e para a comparação com o
 * mínimo.
 */
const CASAS = 3

function arredondar(valor: number): number {
  const fator = 10 ** CASAS
  return Math.round(valor * fator) / fator
}

/** O sinal de cada tipo de movimento. `ajuste` corrige nos dois sentidos. */
function sinal(movimento: MovimentoEstoque): number {
  return movimento.tipo === 'entrada' || movimento.tipo === 'ajuste' ? 1 : -1
}

/**
 * Saldo de uma unidade a partir dos movimentos.
 *
 * Soma o livro inteiro, sem depender da ordem em que os movimentos chegaram: o
 * sync offline entrega fora de ordem, e um acumulador incremental erraria em
 * silêncio. É a mesma conta do gatilho no Postgres e da `registrarMovimento` no
 * Dexie — os três precisam chegar ao mesmo número.
 */
export function saldoDe(
  movimentos: MovimentoEstoque[],
  unidade: UnidadeMovimento,
): number {
  const total = movimentos
    .filter((m) => m.unidade === unidade)
    .reduce((soma, m) => soma + sinal(m) * m.quantidade, 0)

  return arredondar(total)
}

/**
 * Preço médio pago por unidade, ponderado pela quantidade.
 *
 * Ponderado, e não a média simples dos preços: comprar 100 kg a R$ 10 e 1 kg a
 * R$ 30 não faz o produto valer R$ 20. Também não é o último preço — uma compra
 * pequena de emergência distorceria todo o custo da ficha técnica.
 *
 * Só entradas com preço entram na conta. Entrada sem `valor_unitario` (uma
 * doação, um acerto de contagem) é ignorada em vez de contar como preço zero,
 * que puxaria a média para baixo sem que nada tivesse ficado mais barato.
 *
 * Devolve `null` quando não há nenhuma entrada com preço: "sem informação" e
 * "custa zero" são coisas diferentes, e a tela precisa poder distinguir.
 */
export function valorMedioPago(
  movimentos: MovimentoEstoque[],
  unidade: UnidadeMovimento,
): number | null {
  const comPreco = movimentos.filter(
    (m) =>
      m.tipo === 'entrada' &&
      m.unidade === unidade &&
      m.valor_unitario != null &&
      m.quantidade > 0,
  )

  if (comPreco.length === 0) return null

  const quantidade = comPreco.reduce((soma, m) => soma + m.quantidade, 0)
  if (quantidade === 0) return null

  const gasto = comPreco.reduce((soma, m) => soma + m.quantidade * (m.valor_unitario ?? 0), 0)

  // Quatro casas porque é dinheiro por unidade, e arredondar para centavos aqui
  // acumularia erro ao multiplicar pela quantidade da ficha técnica.
  return Math.round((gasto / quantidade) * 10_000) / 10_000
}

/** Um lote que entrou no estoque, com o que se estima restar dele. */
export interface LoteEmEstoque {
  lote: string | null
  /** Data de validade da embalagem, em ISO. */
  validade: string | null
  /** Quanto entrou neste lote, somando as entradas com o mesmo lote e validade. */
  entrada: number
  /**
   * Quanto se estima restar. É ESTIMATIVA: a saída não aponta para um lote, então
   * consumimos os lotes na ordem em que vencem, que é justamente a ordem que a
   * cozinha deve seguir. Quando o serviço seguiu o FEFO, o número bate; quando
   * não seguiu, ele mostra o que deveria ter sido usado.
   */
  restanteEstimado: number
}

/**
 * Lotes em ordem de uso: o que vence antes sai antes (FEFO).
 *
 * Lote sem validade vai para o fim da fila, e não para o começo: mandar usar
 * primeiro aquilo cuja validade ninguém sabe é o contrário do controle que a
 * etiqueta existe para dar.
 *
 * Só `saida` e `perda` consomem lote. `ajuste` fica de fora porque não pertence
 * a lote nenhum — é correção do saldo total, e descontá-lo de um lote específico
 * inventaria uma informação que o movimento não tem.
 */
export function lotesPorValidade(
  movimentos: MovimentoEstoque[],
  unidade: UnidadeMovimento,
): LoteEmEstoque[] {
  const daUnidade = movimentos.filter((m) => m.unidade === unidade)

  // Agrupa por lote + validade: duas compras do mesmo lote são a mesma pilha na
  // prateleira, e listá-las separadas só faria a conferência contar duas vezes.
  const porChave = new Map<string, LoteEmEstoque>()
  for (const m of daUnidade) {
    if (m.tipo !== 'entrada') continue
    const chave = `${m.lote ?? ''}|${m.validade ?? ''}`
    const atual = porChave.get(chave)
    if (atual) {
      atual.entrada = arredondar(atual.entrada + m.quantidade)
    } else {
      porChave.set(chave, {
        lote: m.lote ?? null,
        validade: m.validade ?? null,
        entrada: arredondar(m.quantidade),
        restanteEstimado: 0,
      })
    }
  }

  const lotes = [...porChave.values()].sort((a, b) => {
    if (a.validade === b.validade) return 0
    if (!a.validade) return 1
    if (!b.validade) return -1
    return a.validade < b.validade ? -1 : 1
  })

  let aConsumir = daUnidade
    .filter((m) => m.tipo === 'saida' || m.tipo === 'perda')
    .reduce((soma, m) => soma + m.quantidade, 0)

  for (const lote of lotes) {
    const tirado = Math.min(lote.entrada, aConsumir)
    lote.restanteEstimado = arredondar(lote.entrada - tirado)
    aConsumir = arredondar(aConsumir - tirado)
  }

  return lotes
}

/** Situação de um produto frente ao estoque mínimo. */
export interface SituacaoEstoque {
  saldoKg: number
  saldoUn: number
  abaixoKg: boolean
  abaixoUn: boolean
  /** Verdadeiro se qualquer uma das unidades acompanhadas está abaixo. */
  abaixo: boolean
  /** Quanto falta para voltar ao mínimo. Zero quando não falta nada. */
  faltaKg: number
  faltaUn: number
}

/** As unidades que este produto realmente acompanha. */
function acompanha(produto: Produto, unidade: UnidadeMovimento): boolean {
  return produto.unidade_estoque === 'ambos' || produto.unidade_estoque === unidade
}

/**
 * Compara o saldo com o mínimo, unidade por unidade.
 *
 * Duas regras que evitam alerta falso, que é o que faz a cozinha parar de olhar
 * para os alertas: um produto contado só em unidade nunca é cobrado em kg, e
 * mínimo zero significa "não acompanho", não "avise sempre".
 *
 * A comparação é `<=`: chegar exatamente no mínimo já é hora de repor. O mínimo
 * é o ponto de pedido, não o ponto de acabar.
 */
export function situacaoDeEstoque(produto: Produto): SituacaoEstoque {
  const saldoKg = arredondar(produto.saldo_kg ?? 0)
  const saldoUn = arredondar(produto.saldo_un ?? 0)
  const minimoKg = produto.estoque_minimo_kg ?? 0
  const minimoUn = produto.estoque_minimo_un ?? 0

  const abaixoKg =
    produto.controla_estoque && acompanha(produto, 'kg') && minimoKg > 0 && saldoKg <= minimoKg
  const abaixoUn =
    produto.controla_estoque && acompanha(produto, 'un') && minimoUn > 0 && saldoUn <= minimoUn

  return {
    saldoKg,
    saldoUn,
    abaixoKg,
    abaixoUn,
    abaixo: abaixoKg || abaixoUn,
    faltaKg: abaixoKg ? arredondar(Math.max(0, minimoKg - saldoKg)) : 0,
    faltaUn: abaixoUn ? arredondar(Math.max(0, minimoUn - saldoUn)) : 0,
  }
}

/** Atalho para filtrar listas: o produto precisa ser reposto? */
export function abaixoDoMinimo(produto: Produto): boolean {
  return situacaoDeEstoque(produto).abaixo
}

/**
 * Lotes que já venceram ou vencem dentro de `dias`, e ainda têm saldo estimado.
 *
 * Serve para a tela de detalhe apontar o que precisa sair primeiro. Usa
 * `differenceInCalendarDays` pelo mesmo motivo do resto do sistema: a cozinha
 * raciocina em dias de calendário, não em janelas de 24 horas.
 */
export function lotesVencendo(
  lotes: LoteEmEstoque[],
  dias: number,
  agora: Date = new Date(),
): LoteEmEstoque[] {
  return lotes.filter((lote) => {
    if (!lote.validade || lote.restanteEstimado <= 0) return false
    const restam = differenceInCalendarDays(startOfDay(parseISO(lote.validade)), startOfDay(agora))
    return restam <= dias
  })
}
