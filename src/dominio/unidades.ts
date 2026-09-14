import type { Unidade } from './tipos'

export type Dimensao = 'massa' | 'volume' | 'contagem'

/** Cada unidade reduzida à sua base: grama, mililitro ou unidade. */
const TABELA: Record<Unidade, { dimensao: Dimensao; paraBase: number }> = {
  g: { dimensao: 'massa', paraBase: 1 },
  kg: { dimensao: 'massa', paraBase: 1000 },
  ml: { dimensao: 'volume', paraBase: 1 },
  L: { dimensao: 'volume', paraBase: 1000 },
  un: { dimensao: 'contagem', paraBase: 1 },
}

export class ErroConversao extends Error {
  constructor(
    public readonly de: Unidade,
    public readonly para: Unidade,
  ) {
    super(
      `Não dá para converter ${de} em ${para} sozinho: são grandezas diferentes. ` +
        `Um litro de azeite e um quilo de azeite só se equivalem se você informar a densidade, ` +
        `então cadastre o insumo na mesma grandeza que você usa na receita.`,
    )
    this.name = 'ErroConversao'
  }
}

export function dimensaoDe(unidade: Unidade): Dimensao {
  return TABELA[unidade].dimensao
}

export function mesmaDimensao(a: Unidade, b: Unidade): boolean {
  return dimensaoDe(a) === dimensaoDe(b)
}

/**
 * Converte entre unidades da mesma grandeza. Massa vira massa, volume vira volume,
 * contagem vira contagem. Atravessar grandezas exige densidade, que o app não guarda
 * — e inventar um número aqui contaminaria silenciosamente todo custo do restaurante.
 */
export function converter(quantidade: number, de: Unidade, para: Unidade): number {
  if (de === para) return quantidade
  if (!mesmaDimensao(de, para)) throw new ErroConversao(de, para)
  return (quantidade * TABELA[de].paraBase) / TABELA[para].paraBase
}

export type Tentativa =
  | { ok: true; valor: number }
  | { ok: false; motivo: string }

/** Versão que devolve o erro em vez de lançar, para a tela poder mostrar um aviso. */
export function tentarConverter(quantidade: number, de: Unidade, para: Unidade): Tentativa {
  try {
    return { ok: true, valor: converter(quantidade, de, para) }
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) }
  }
}

/**
 * Escolhe a unidade que deixa o número legível: 2400 g vira 2,4 kg, mas 300 g
 * continua 300 g. Serve para a lista de compras não pedir "0,15 kg de alecrim".
 */
export function humanizar(quantidade: number, unidade: Unidade): { quantidade: number; unidade: Unidade } {
  if (unidade === 'g' && quantidade >= 1000) return { quantidade: quantidade / 1000, unidade: 'kg' }
  if (unidade === 'kg' && quantidade < 1) return { quantidade: quantidade * 1000, unidade: 'g' }
  if (unidade === 'ml' && quantidade >= 1000) return { quantidade: quantidade / 1000, unidade: 'L' }
  if (unidade === 'L' && quantidade < 1) return { quantidade: quantidade * 1000, unidade: 'ml' }
  return { quantidade, unidade }
}

/** Número no formato brasileiro, sem casas decimais inúteis. */
export function formatarQuantidade(quantidade: number, casas = 2): string {
  const arredondado = Math.round(quantidade * 10 ** casas) / 10 ** casas
  return arredondado.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

export function formatarMedida(quantidade: number, unidade: Unidade): string {
  const h = humanizar(quantidade, unidade)
  return `${formatarQuantidade(h.quantidade, h.unidade === 'un' ? 0 : 2)} ${h.unidade}`
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Percentual guardado como fração (0,32) e mostrado como 32%. */
export function formatarPercentual(fracao: number, casas = 1): string {
  return `${formatarQuantidade(fracao * 100, casas)}%`
}
