import type { TipoCasa } from './tipos'

/**
 * CMV — Custo da Mercadoria Vendida. Quanto do dinheiro que entrou no caixa foi
 * embora só para repor o que saiu da despensa.
 */

export interface EntradaCmvReal {
  estoqueInicial: number
  compras: number
  estoqueFinal: number
  faturamento: number
}

export interface ResultadoCmv {
  /** Em reais. */
  valor: number
  /** Fração do faturamento (0,32 = 32%). `null` sem faturamento informado. */
  percentual: number | null
}

/**
 * CMV real = estoque inicial + compras − estoque final.
 *
 * Mede o que de fato saiu da despensa no período, desperdício e erro incluídos.
 * É a foto honesta: não pergunta o que deveria ter sido usado, olha o que sumiu.
 */
export function cmvReal(e: EntradaCmvReal): ResultadoCmv {
  const valor = e.estoqueInicial + e.compras - e.estoqueFinal
  return { valor, percentual: e.faturamento > 0 ? valor / e.faturamento : null }
}

export interface ItemVendido {
  /** Custo de uma unidade vendida, vindo da ficha técnica. */
  custoUnitario: number | null
  quantidade: number
}

/**
 * CMV teórico = o que as fichas técnicas dizem que aquelas vendas deveriam ter
 * custado. É o padrão contra o qual o real vai ser comparado. Um item sem preço
 * cadastrado torna o total desconhecido em vez de barateá-lo por omissão.
 */
export function cmvTeorico(itens: ItemVendido[], faturamento: number): ResultadoCmv | null {
  let total = 0
  for (const item of itens) {
    if (item.custoUnitario === null) return null
    total += item.custoUnitario * item.quantidade
  }
  return { valor: total, percentual: faturamento > 0 ? total / faturamento : null }
}

export type ClassificacaoDesvio = 'saudavel' | 'atencao' | 'critico'

export interface ResultadoDesvio {
  /** Em pontos percentuais. Positivo = gastou mais do que a ficha previa. */
  pontos: number
  classificacao: ClassificacaoDesvio
  explicacao: string
}

/**
 * A diferença entre teórico e real é o dinheiro que saiu da operação sem virar
 * venda: desperdício, porção fora do padrão, quebra, erro de registro, desvio.
 * Até 2 pontos é a variação normal de uma cozinha. Acima de 4 já não é ruído.
 */
export function desvioCmv(percentualTeorico: number, percentualReal: number): ResultadoDesvio {
  const pontos = (percentualReal - percentualTeorico) * 100
  const magnitude = Math.abs(pontos)

  if (magnitude <= 2) {
    return {
      pontos,
      classificacao: 'saudavel',
      explicacao:
        'Diferença dentro do normal. A cozinha está executando perto do que a ficha técnica manda.',
    }
  }
  if (magnitude <= 4) {
    return {
      pontos,
      classificacao: 'atencao',
      explicacao:
        'Diferença começando a pesar. Vale pesar as porções de alguns pratos e conferir o registro das perdas.',
    }
  }
  return {
    pontos,
    classificacao: 'critico',
    explicacao:
      pontos > 0
        ? 'Está saindo da despensa muito mais do que as fichas preveem. Procure porção fora do padrão, desperdício não anotado, quebra e furo de estoque.'
        : 'O real veio bem abaixo do teórico. Normalmente isso não é boa notícia: costuma significar contagem de estoque errada, compra não lançada ou ficha técnica desatualizada.',
  }
}

export interface FaixaCmv {
  rotulo: string
  min: number
  max: number
}

/**
 * Faixas que o mercado brasileiro considera saudáveis por tipo de casa. São
 * referência para conversar, não lei: a sua estrutura de custo manda mais.
 */
export const FAIXAS_CMV: Record<TipoCasa, FaixaCmv> = {
  a_la_carte: { rotulo: 'Restaurante à la carte', min: 0.3, max: 0.35 },
  pizzaria: { rotulo: 'Pizzaria', min: 0.28, max: 0.32 },
  hamburgueria: { rotulo: 'Hamburgueria', min: 0.3, max: 0.35 },
  fast_food: { rotulo: 'Fast food', min: 0.25, max: 0.3 },
  japones: { rotulo: 'Japonês', min: 0.35, max: 0.4 },
  bistro: { rotulo: 'Bistrô / autoral', min: 0.3, max: 0.35 },
  padaria: { rotulo: 'Padaria / cafeteria', min: 0.28, max: 0.35 },
  outro: { rotulo: 'Outro', min: 0.28, max: 0.35 },
}

export type PosicaoNaFaixa = 'abaixo' | 'dentro' | 'acima'

export function posicaoNaFaixa(percentual: number, tipo: TipoCasa): PosicaoNaFaixa {
  const faixa = FAIXAS_CMV[tipo]
  if (percentual < faixa.min) return 'abaixo'
  if (percentual > faixa.max) return 'acima'
  return 'dentro'
}
