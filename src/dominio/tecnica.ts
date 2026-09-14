/**
 * Técnica dietética: as duas contas que explicam por que a nota do mercado nunca
 * bate com o peso que entra na panela.
 */

export interface ResultadoFatorCorrecao {
  fator: number
  /** Fração do bruto que vai para o lixo: 0,2 significa 20% de perda. */
  perda: number
}

/**
 * Fator de correção = peso bruto ÷ peso líquido.
 *
 * Cebola de 1 kg que rende 850 g limpos tem FC 1,18: para ter 100 g na receita
 * você precisa comprar 118 g. É o número que separa a receita da lista de compras.
 */
export function fatorCorrecao(pesoBruto: number, pesoLiquido: number): ResultadoFatorCorrecao {
  if (pesoBruto <= 0) throw new Error('O peso bruto precisa ser maior que zero.')
  if (pesoLiquido <= 0) throw new Error('O peso líquido precisa ser maior que zero.')
  const fator = pesoBruto / pesoLiquido
  return { fator, perda: 1 - pesoLiquido / pesoBruto }
}

/** Quanto comprar para ter `pesoLiquido` depois de limpar. */
export function pesoBrutoNecessario(pesoLiquido: number, fator: number): number {
  return pesoLiquido * (fator > 0 ? fator : 1)
}

/** Quanto sobra limpo a partir do que foi comprado. */
export function pesoLiquidoEsperado(pesoBruto: number, fator: number): number {
  return fator > 0 ? pesoBruto / fator : pesoBruto
}

export interface ResultadoIndiceCoccao {
  indice: number
  /** Positivo é ganho de peso (arroz, feijão), negativo é perda (carne, legume). */
  variacao: number
  sentido: 'ganhou' | 'perdeu' | 'igual'
}

/**
 * Índice de cocção = peso depois de cozido ÷ peso líquido cru.
 *
 * Acima de 1 o alimento absorveu água (cereais). Abaixo de 1 perdeu (carnes).
 * Importa no custo porque é ele que diz quanto de cru comprar para servir a porção
 * cozida prometida no menu.
 */
export function indiceCoccao(pesoCozido: number, pesoLiquidoCru: number): ResultadoIndiceCoccao {
  if (pesoLiquidoCru <= 0) throw new Error('O peso cru precisa ser maior que zero.')
  if (pesoCozido <= 0) throw new Error('O peso cozido precisa ser maior que zero.')
  const indice = pesoCozido / pesoLiquidoCru
  const variacao = indice - 1
  const sentido = Math.abs(variacao) < 1e-9 ? 'igual' : variacao > 0 ? 'ganhou' : 'perdeu'
  return { indice, variacao, sentido }
}

/** Quanto de cru comprar para entregar `pesoCozido` no prato. */
export function cruNecessarioParaCozido(pesoCozido: number, indice: number): number {
  if (indice <= 0) throw new Error('O índice de cocção precisa ser maior que zero.')
  return pesoCozido / indice
}

/**
 * Fator para multiplicar toda a receita. Rende 10 porções e você precisa de 35?
 * Fator 3,5 em cada ingrediente.
 */
export function fatorEscala(rendimentoOriginal: number, rendimentoDesejado: number): number {
  if (rendimentoOriginal <= 0) throw new Error('O rendimento original precisa ser maior que zero.')
  return rendimentoDesejado / rendimentoOriginal
}
