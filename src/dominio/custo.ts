import type { Insumo, Unidade } from './tipos'
import { tentarConverter } from './unidades'

export interface CustoInsumo {
  /** Reais. `null` quando o insumo ainda não tem preço — mentir 0 aqui estragaria o CMV. */
  custo: number | null
  /** O que entra na panela, já convertido para a unidade de uso do insumo. */
  quantidadeLiquida: number
  /** O que você precisa comprar: líquido × fator de correção. */
  quantidadeBruta: number
  unidade: Unidade
  aviso?: string
}

/**
 * Preço de UMA unidade de uso. Você compra saco de 1 kg por R$ 8 e usa em gramas:
 * o preço por grama é 0,008. Devolve `null` se ainda não houver preço, ou se a
 * unidade de compra e a de uso forem de grandezas diferentes.
 */
export function precoPorUnidadeDeUso(insumo: Insumo): number | null {
  if (insumo.preco_compra <= 0 || insumo.quantidade_compra <= 0) return null
  const emUnidadeDeUso = tentarConverter(
    insumo.quantidade_compra,
    insumo.unidade_compra,
    insumo.unidade_uso,
  )
  if (!emUnidadeDeUso.ok || emUnidadeDeUso.valor <= 0) return null
  return insumo.preco_compra / emUnidadeDeUso.valor
}

/**
 * Custo de uma quantidade de insumo dentro de uma receita.
 *
 * A quantidade escrita na ficha é o peso LÍQUIDO — o que vai para a panela. O
 * fator de correção transforma isso no bruto que você compra, e é o bruto que
 * você paga. Ignorar esse passo é o erro que faz o CMV teórico vir sempre
 * otimista demais.
 */
export function custoDoInsumo(
  insumo: Insumo,
  quantidade: number,
  unidade: Unidade,
): CustoInsumo {
  const convertida = tentarConverter(quantidade, unidade, insumo.unidade_uso)
  if (!convertida.ok) {
    return {
      custo: null,
      quantidadeLiquida: quantidade,
      quantidadeBruta: quantidade,
      unidade,
      aviso: `"${insumo.nome}": a receita pede ${unidade} e o insumo está cadastrado em ${insumo.unidade_uso}. ${convertida.motivo}`,
    }
  }

  const fator = insumo.fator_correcao > 0 ? insumo.fator_correcao : 1
  const liquida = convertida.valor
  const bruta = liquida * fator
  const preco = precoPorUnidadeDeUso(insumo)

  if (preco === null) {
    return {
      custo: null,
      quantidadeLiquida: liquida,
      quantidadeBruta: bruta,
      unidade: insumo.unidade_uso,
      aviso: `"${insumo.nome}" ainda não tem preço de compra cadastrado.`,
    }
  }

  return {
    custo: bruta * preco,
    quantidadeLiquida: liquida,
    quantidadeBruta: bruta,
    unidade: insumo.unidade_uso,
  }
}

/** Custo de uma porção. `null` se o custo total ainda é desconhecido. */
export function custoPorPorcao(custoTotal: number | null, porcoes: number): number | null {
  if (custoTotal === null) return null
  if (porcoes <= 0) return null
  return custoTotal / porcoes
}

/** Custo por unidade de rendimento: quanto custa 1 ml do fundo, 1 g da massa. */
export function custoPorUnidadeDeRendimento(
  custoTotal: number | null,
  rendimento: number,
  de: Unidade,
  para: Unidade,
): number | null {
  if (custoTotal === null || rendimento <= 0) return null
  const convertido = tentarConverter(rendimento, de, para)
  if (!convertido.ok || convertido.valor <= 0) return null
  return custoTotal / convertido.valor
}

/** Soma que respeita o desconhecido: um ingrediente sem preço torna o total incerto. */
export function somarCustos(valores: (number | null)[]): number | null {
  let total = 0
  for (const v of valores) {
    if (v === null) return null
    total += v
  }
  return total
}
