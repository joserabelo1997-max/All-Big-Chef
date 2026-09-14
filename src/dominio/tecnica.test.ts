import { describe, expect, it } from 'vitest'
import {
  cruNecessarioParaCozido,
  fatorCorrecao,
  fatorEscala,
  indiceCoccao,
  pesoBrutoNecessario,
  pesoLiquidoEsperado,
} from './tecnica'

describe('fatorCorrecao', () => {
  it('calcula o fator e a perda de uma cebola', () => {
    const r = fatorCorrecao(1000, 850)
    expect(r.fator).toBeCloseTo(1.1765, 4)
    expect(r.perda).toBeCloseTo(0.15, 4)
  })

  it('dá fator 1 quando não há perda', () => {
    expect(fatorCorrecao(500, 500).fator).toBe(1)
    expect(fatorCorrecao(500, 500).perda).toBe(0)
  })

  it('recusa peso zero ou negativo', () => {
    expect(() => fatorCorrecao(0, 100)).toThrow()
    expect(() => fatorCorrecao(100, 0)).toThrow()
  })

  it('vai e volta entre bruto e líquido', () => {
    const { fator } = fatorCorrecao(1000, 800)
    expect(pesoBrutoNecessario(800, fator)).toBeCloseTo(1000, 6)
    expect(pesoLiquidoEsperado(1000, fator)).toBeCloseTo(800, 6)
  })
})

describe('indiceCoccao', () => {
  it('enxerga o arroz ganhando peso', () => {
    const r = indiceCoccao(750, 300)
    expect(r.indice).toBeCloseTo(2.5, 6)
    expect(r.sentido).toBe('ganhou')
    expect(r.variacao).toBeCloseTo(1.5, 6)
  })

  it('enxerga a carne perdendo peso', () => {
    const r = indiceCoccao(700, 1000)
    expect(r.indice).toBeCloseTo(0.7, 6)
    expect(r.sentido).toBe('perdeu')
    expect(r.variacao).toBeCloseTo(-0.3, 6)
  })

  it('diz quanto de cru comprar para a porção cozida prometida', () => {
    // 180 g de carne no prato, com índice 0,7, exigem ~257 g de carne crua limpa.
    expect(cruNecessarioParaCozido(180, 0.7)).toBeCloseTo(257.14, 2)
  })
})

describe('fatorEscala', () => {
  it('multiplica a receita para o rendimento desejado', () => {
    expect(fatorEscala(10, 35)).toBe(3.5)
    expect(fatorEscala(4, 2)).toBe(0.5)
  })

  it('recusa rendimento original inválido', () => {
    expect(() => fatorEscala(0, 10)).toThrow()
  })
})
