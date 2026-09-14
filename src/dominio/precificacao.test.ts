import { describe, expect, it } from 'vitest'
import {
  arredondarPreco,
  cmvDoPrato,
  margemContribuicao,
  markupDivisor,
  precoPorCmvAlvo,
  precoPorMarkup,
} from './precificacao'

describe('precoPorCmvAlvo', () => {
  it('sobe do custo ao preço pelo CMV desejado', () => {
    expect(precoPorCmvAlvo(12, 0.3)).toBeCloseTo(40, 6)
    expect(precoPorCmvAlvo(12, 0.35)).toBeCloseTo(34.2857, 4)
  })

  it('recusa alvo impossível em vez de devolver número sem sentido', () => {
    expect(precoPorCmvAlvo(12, 0)).toBeNull()
    expect(precoPorCmvAlvo(12, 1)).toBeNull()
    expect(precoPorCmvAlvo(null, 0.3)).toBeNull()
  })
})

describe('markupDivisor', () => {
  it('soma as fatias que o preço precisa cobrir', () => {
    // 25% de custo fixo, 12% de despesa variável, 15% de lucro desejado.
    const r = markupDivisor([0.25, 0.12, 0.15])
    expect(r?.totalPercentuais).toBeCloseTo(0.52, 6)
    expect(r?.markup).toBeCloseTo(2.0833, 4)
    expect(precoPorMarkup(12, r!.markup)).toBeCloseTo(25, 2)
  })

  it('recusa quando os percentuais consomem o preço inteiro', () => {
    expect(markupDivisor([0.5, 0.5])).toBeNull()
    expect(markupDivisor([0.6, 0.5])).toBeNull()
  })
})

describe('margemContribuicao', () => {
  it('mostra o que sobra de cada venda', () => {
    const r = margemContribuicao(40, 12)
    expect(r.valor).toBe(28)
    expect(r.percentual).toBeCloseTo(0.7, 6)
  })

  it('enxerga o prato que vende no prejuízo', () => {
    const r = margemContribuicao(20, 26)
    expect(r.valor).toBe(-6)
    expect(r.percentual).toBeCloseTo(-0.3, 6)
  })
})

describe('cmvDoPrato', () => {
  it('faz o caminho inverso, do preço de menu para o percentual', () => {
    expect(cmvDoPrato(12, 40)).toBeCloseTo(0.3, 6)
    expect(cmvDoPrato(12, 0)).toBeNull()
  })
})

describe('arredondarPreco', () => {
  it('deixa o preço com cara de menu', () => {
    expect(arredondarPreco(38.4615, 'inteiro')).toBe(39)
    expect(arredondarPreco(38.4615, 'noventa')).toBeCloseTo(38.9, 6)
    expect(arredondarPreco(38.4615, 'meio')).toBe(38.5)
    expect(arredondarPreco(38.4615, 'nenhum')).toBeCloseTo(38.4615, 6)
  })

  it('não mexe no desconhecido', () => {
    expect(arredondarPreco(null, 'inteiro')).toBeNull()
  })
})
