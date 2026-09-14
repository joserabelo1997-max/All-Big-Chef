import { describe, expect, it } from 'vitest'
import {
  custoDoInsumo,
  custoPorPorcao,
  custoPorUnidadeDeRendimento,
  precoPorUnidadeDeUso,
  somarCustos,
} from './custo'
import { insumo } from './testes/fabricas'

describe('precoPorUnidadeDeUso', () => {
  it('converte o preço da embalagem para a unidade da receita', () => {
    const farinha = insumo('farinha', {
      quantidade_compra: 5,
      unidade_compra: 'kg',
      preco_compra: 20,
      unidade_uso: 'g',
    })
    expect(precoPorUnidadeDeUso(farinha)).toBeCloseTo(0.004, 9)
  })

  it('devolve nulo enquanto não há preço, para não fingir que o prato é de graça', () => {
    expect(precoPorUnidadeDeUso(insumo('x', { preco_compra: 0 }))).toBeNull()
    expect(precoPorUnidadeDeUso(insumo('x', { quantidade_compra: 0 }))).toBeNull()
  })

  it('devolve nulo quando compra em volume e usa em massa', () => {
    const leite = insumo('leite', { unidade_compra: 'L', unidade_uso: 'g' })
    expect(precoPorUnidadeDeUso(leite)).toBeNull()
  })
})

describe('custoDoInsumo', () => {
  it('cobra o bruto, não o líquido — é o bruto que você paga', () => {
    const cebola = insumo('cebola', {
      nome: 'Cebola',
      quantidade_compra: 1,
      unidade_compra: 'kg',
      preco_compra: 5,
      unidade_uso: 'g',
      fator_correcao: 1.2,
    })
    const r = custoDoInsumo(cebola, 100, 'g')

    expect(r.quantidadeLiquida).toBe(100)
    expect(r.quantidadeBruta).toBeCloseTo(120, 6)
    expect(r.custo).toBeCloseTo(0.6, 6)
  })

  it('sem perda, bruto e líquido são a mesma coisa', () => {
    const sal = insumo('sal', {
      quantidade_compra: 1,
      unidade_compra: 'kg',
      preco_compra: 4,
      unidade_uso: 'g',
      fator_correcao: 1,
    })
    const r = custoDoInsumo(sal, 250, 'g')
    expect(r.quantidadeBruta).toBe(250)
    expect(r.custo).toBeCloseTo(1, 6)
  })

  it('trata fator de correção zerado como 1, em vez de zerar a receita', () => {
    const item = insumo('item', { fator_correcao: 0 })
    expect(custoDoInsumo(item, 100, 'g').quantidadeBruta).toBe(100)
  })
})

describe('custoPorPorcao', () => {
  it('divide o custo total pelo rendimento em porções', () => {
    expect(custoPorPorcao(25, 10)).toBeCloseTo(2.5, 6)
  })

  it('não divide por zero nem inventa custo desconhecido', () => {
    expect(custoPorPorcao(25, 0)).toBeNull()
    expect(custoPorPorcao(null, 10)).toBeNull()
  })
})

describe('custoPorUnidadeDeRendimento', () => {
  it('diz quanto custa um mililitro do fundo', () => {
    expect(custoPorUnidadeDeRendimento(3.8, 2, 'L', 'ml')).toBeCloseTo(0.0019, 9)
  })
})

describe('somarCustos', () => {
  it('soma quando tudo é conhecido', () => {
    expect(somarCustos([1, 2, 3.5])).toBeCloseTo(6.5, 6)
  })

  it('um ingrediente sem preço torna o total incerto, não menor', () => {
    expect(somarCustos([1, null, 3])).toBeNull()
  })
})
