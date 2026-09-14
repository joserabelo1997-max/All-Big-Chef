import { describe, expect, it } from 'vitest'
import { FAIXAS_CMV, cmvReal, cmvTeorico, desvioCmv, posicaoNaFaixa } from './cmv'

describe('cmvReal', () => {
  it('aplica a fórmula do período', () => {
    // Abriu o mês com R$ 8.000 em estoque, comprou R$ 22.000, fechou com R$ 6.000.
    const r = cmvReal({
      estoqueInicial: 8000,
      compras: 22000,
      estoqueFinal: 6000,
      faturamento: 80000,
    })
    expect(r.valor).toBe(24000)
    expect(r.percentual).toBeCloseTo(0.3, 6)
  })

  it('deixa o percentual indefinido sem faturamento, em vez de dividir por zero', () => {
    const r = cmvReal({ estoqueInicial: 100, compras: 50, estoqueFinal: 20, faturamento: 0 })
    expect(r.valor).toBe(130)
    expect(r.percentual).toBeNull()
  })

  it('enxerga o mês em que se comprou para encher a despensa', () => {
    // Comprou muito e guardou: o estoque final alto derruba o CMV do período.
    const r = cmvReal({
      estoqueInicial: 5000,
      compras: 30000,
      estoqueFinal: 20000,
      faturamento: 50000,
    })
    expect(r.valor).toBe(15000)
    expect(r.percentual).toBeCloseTo(0.3, 6)
  })
})

describe('cmvTeorico', () => {
  it('soma custo de ficha vezes quantidade vendida', () => {
    const r = cmvTeorico(
      [
        { custoUnitario: 12, quantidade: 100 },
        { custoUnitario: 8.5, quantidade: 200 },
      ],
      10000,
    )
    expect(r?.valor).toBeCloseTo(2900, 6)
    expect(r?.percentual).toBeCloseTo(0.29, 6)
  })

  it('devolve nulo se algum prato ainda não tem custo fechado', () => {
    expect(cmvTeorico([{ custoUnitario: null, quantidade: 10 }], 1000)).toBeNull()
  })
})

describe('desvioCmv', () => {
  it('trata até 2 pontos como variação normal de cozinha', () => {
    const r = desvioCmv(0.3, 0.315)
    expect(r.pontos).toBeCloseTo(1.5, 6)
    expect(r.classificacao).toBe('saudavel')
  })

  it('acende o amarelo entre 2 e 4 pontos', () => {
    expect(desvioCmv(0.3, 0.333).classificacao).toBe('atencao')
  })

  it('acende o vermelho acima de 4 pontos e diz o que procurar', () => {
    const r = desvioCmv(0.3, 0.36)
    expect(r.pontos).toBeCloseTo(6, 6)
    expect(r.classificacao).toBe('critico')
    expect(r.explicacao).toContain('desperdício')
  })

  it('desconfia também do desvio para baixo', () => {
    const r = desvioCmv(0.35, 0.28)
    expect(r.pontos).toBeCloseTo(-7, 6)
    expect(r.classificacao).toBe('critico')
    expect(r.explicacao).toContain('contagem de estoque errada')
  })
})

describe('posicaoNaFaixa', () => {
  it('usa a faixa do tipo de casa', () => {
    expect(posicaoNaFaixa(0.3, 'pizzaria')).toBe('dentro')
    expect(posicaoNaFaixa(0.4, 'pizzaria')).toBe('acima')
    expect(posicaoNaFaixa(0.2, 'pizzaria')).toBe('abaixo')
    // O japonês trabalha com CMV mais alto e o mesmo 38% ali está dentro.
    expect(posicaoNaFaixa(0.38, 'japones')).toBe('dentro')
  })

  it('tem faixa cadastrada para todo tipo de casa', () => {
    for (const faixa of Object.values(FAIXAS_CMV)) {
      expect(faixa.min).toBeGreaterThan(0)
      expect(faixa.max).toBeGreaterThan(faixa.min)
    }
  })
})
