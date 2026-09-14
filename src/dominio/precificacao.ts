/**
 * Formação de preço. O custo da ficha técnica é o chão; o preço de menu nasce de
 * decidir quanto desse preço você aceita que seja comida.
 */

/**
 * Preço a partir do CMV alvo: se o prato custa R$ 12 e você quer que a comida seja
 * 30% do preço, o prato sai a R$ 40. É a conta mais direta e a mais usada na cozinha.
 */
export function precoPorCmvAlvo(custo: number | null, cmvAlvo: number): number | null {
  if (custo === null || custo < 0) return null
  if (cmvAlvo <= 0 || cmvAlvo >= 1) return null
  return custo / cmvAlvo
}

export interface ResultadoMarkup {
  markup: number
  /** Soma dos percentuais informados, como fração. */
  totalPercentuais: number
}

/**
 * Markup divisor = 1 ÷ (1 − soma dos percentuais sobre a venda).
 *
 * Entram aqui as fatias que você quer que o preço cubra além da comida: custo fixo,
 * despesa variável (cartão, imposto, delivery) e o lucro desejado. Se a soma chega
 * a 100%, não sobra espaço para o custo e não existe preço possível — o app diz
 * isso em vez de devolver um número absurdo.
 */
export function markupDivisor(percentuais: number[]): ResultadoMarkup | null {
  const totalPercentuais = percentuais.reduce((s, p) => s + p, 0)
  if (totalPercentuais < 0 || totalPercentuais >= 1) return null
  return { markup: 1 / (1 - totalPercentuais), totalPercentuais }
}

export function precoPorMarkup(custo: number | null, markup: number): number | null {
  if (custo === null || custo < 0 || markup <= 0) return null
  return custo * markup
}

export interface ResultadoMargem {
  /** Reais que sobram de cada venda depois de pagar o que varia com ela. */
  valor: number
  /** Fração do preço. */
  percentual: number | null
}

/**
 * Margem de contribuição = preço − custos variáveis. É o que sobra de cada prato
 * vendido para pagar aluguel, folha e, no fim, virar lucro.
 */
export function margemContribuicao(preco: number, custoVariavel: number): ResultadoMargem {
  const valor = preco - custoVariavel
  return { valor, percentual: preco > 0 ? valor / preco : null }
}

/** O caminho inverso: dado o preço que está no menu, qual o CMV daquele prato. */
export function cmvDoPrato(custo: number | null, preco: number): number | null {
  if (custo === null || preco <= 0) return null
  return custo / preco
}

/**
 * Preço já arredondado para terminar em um valor que se escreve num menu.
 * R$ 38,4615 vira R$ 39,00 (ou R$ 38,90, conforme o gosto da casa).
 */
export type EstiloArredondamento = 'inteiro' | 'noventa' | 'meio' | 'nenhum'

export function arredondarPreco(preco: number | null, estilo: EstiloArredondamento): number | null {
  if (preco === null) return null
  switch (estilo) {
    case 'inteiro':
      return Math.ceil(preco)
    case 'noventa':
      return Math.max(0, Math.ceil(preco) - 0.1)
    case 'meio':
      return Math.ceil(preco * 2) / 2
    case 'nenhum':
      return preco
  }
}
