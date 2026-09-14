import { describe, expect, it } from 'vitest'
import { explodirFicha, fichasDaArvore, montarContexto, percorrer } from './arvore'
import { comFicha, comInsumo, ficha, insumo } from './testes/fabricas'
import { cozinhaDeTeste } from './testes/cozinha'
import type { NoArvore } from './arvore'

function acharPorNome(raiz: NoArvore, nome: string): NoArvore | undefined {
  let achado: NoArvore | undefined
  percorrer(raiz, (no) => {
    if (!achado && no.nome === nome) achado = no
  })
  return achado
}

describe('explodirFicha', () => {
  it('aninha o preparo dentro do prato', () => {
    const { raiz } = explodirFicha(cozinhaDeTeste().ctx, 'sopa')

    expect(raiz.nome).toBe('Sopa do dia')
    expect(raiz.filhos.map((f) => f.nome)).toEqual(['Fundo de legumes', 'Cebola'])

    const fundoNo = raiz.filhos[0]!
    expect(fundoNo.tipo).toBe('ficha')
    expect(fundoNo.filhos.map((f) => f.nome)).toEqual(['Cebola', 'Azeite'])
  })

  it('soma o custo de baixo para cima', () => {
    const { raiz, avisos } = explodirFicha(cozinhaDeTeste().ctx, 'sopa')

    expect(avisos).toEqual([])
    expect(raiz.filhos[0]!.custo).toBeCloseTo(1.9, 6)
    expect(raiz.filhos[1]!.custo).toBeCloseTo(0.6, 6)
    expect(raiz.custo).toBeCloseTo(2.5, 6)
  })

  it('escala o preparo pela fração do rendimento que o prato consome', () => {
    const { raiz } = explodirFicha(cozinhaDeTeste().ctx, 'sopa')
    const fundoNo = raiz.filhos[0]!

    // A sopa usa 1000 dos 2000 ml do fundo, então tudo dentro dele vale metade.
    expect(fundoNo.filhos[0]!.quantidade).toBeCloseTo(150, 6)
    expect(fundoNo.filhos[1]!.quantidade).toBeCloseTo(25, 6)
  })

  it('dobra a receita inteira quando se pede o dobro de porções', () => {
    const { raiz } = explodirFicha(cozinhaDeTeste().ctx, 'sopa', { porcoes: 8 })

    expect(raiz.custo).toBeCloseTo(5, 6)
    expect(raiz.filhos[0]!.quantidade).toBeCloseTo(2000, 6)
    expect(raiz.filhos[1]!.quantidade).toBeCloseTo(200, 6)

    // Com o fundo inteiro sendo usado, o conteúdo dele volta ao tamanho cheio.
    expect(raiz.filhos[0]!.filhos[0]!.quantidade).toBeCloseTo(300, 6)
  })

  it('aplica o fator de correção na quantidade bruta, não na líquida', () => {
    const { raiz } = explodirFicha(cozinhaDeTeste().ctx, 'sopa')
    const cebolaDireta = raiz.filhos[1]!

    expect(cebolaDireta.quantidade).toBeCloseTo(100, 6)
    expect(cebolaDireta.quantidadeBruta).toBeCloseTo(120, 6)
  })

  it('converte a unidade da receita para a unidade de uso do insumo', () => {
    const ctx = montarContexto(
      [ficha('bolo', 'prato', { rendimento_quantidade: 1, rendimento_unidade: 'un', porcoes: 1 })],
      [comInsumo('bolo', 'farinha', 0.5, 'kg')],
      [
        insumo('farinha', {
          quantidade_compra: 1,
          unidade_compra: 'kg',
          preco_compra: 4,
          unidade_uso: 'g',
        }),
      ],
    )
    const { raiz, avisos } = explodirFicha(ctx, 'bolo')

    expect(avisos).toEqual([])
    expect(raiz.filhos[0]!.quantidade).toBeCloseTo(500, 6)
    expect(raiz.filhos[0]!.unidade).toBe('g')
    expect(raiz.custo).toBeCloseTo(2, 6)
  })
})

describe('explodirFicha diante de cadastro incompleto', () => {
  it('deixa o custo desconhecido em vez de fingir zero quando falta preço', () => {
    const ctx = montarContexto(
      [ficha('prato', 'prato', { porcoes: 1 })],
      [comInsumo('prato', 'sal', 10, 'g')],
      [insumo('sal', { nome: 'Sal', preco_compra: 0 })],
    )
    const { raiz, avisos } = explodirFicha(ctx, 'prato')

    expect(raiz.filhos[0]!.custo).toBeNull()
    expect(raiz.custo).toBeNull()
    expect(avisos[0]).toContain('não tem preço')
  })

  it('avisa quando a receita pede volume de um insumo cadastrado em massa', () => {
    const ctx = montarContexto(
      [ficha('prato', 'prato', { porcoes: 1 })],
      [comInsumo('prato', 'manteiga', 100, 'ml')],
      [insumo('manteiga', { nome: 'Manteiga', unidade_uso: 'g' })],
    )
    const { raiz, avisos } = explodirFicha(ctx, 'prato')

    expect(raiz.custo).toBeNull()
    expect(avisos[0]).toContain('densidade')
  })

  it('corta o laço quando um preparo acaba contendo a si mesmo', () => {
    const ctx = montarContexto(
      [ficha('a', 'preparo'), ficha('b', 'preparo')],
      [comFicha('a', 'b', 100, 'g'), comFicha('b', 'a', 100, 'g')],
      [],
    )
    const { raiz, avisos } = explodirFicha(ctx, 'a')

    expect(avisos.some((a) => a.includes('contém a si mesma'))).toBe(true)
    // Parou no reencontro: a → b → a (sem filhos), e não mais fundo que isso.
    expect(acharPorNome(raiz, 'b')?.filhos).toHaveLength(1)
    expect(acharPorNome(raiz, 'b')?.filhos[0]!.filhos).toHaveLength(0)
  })

  it('avisa quando a ficha referenciada sumiu', () => {
    const ctx = montarContexto(
      [ficha('prato', 'prato')],
      [comFicha('prato', 'fantasma', 100, 'g')],
      [],
    )
    const { avisos } = explodirFicha(ctx, 'prato')
    expect(avisos[0]).toContain('não existe mais')
  })
})

describe('fichasDaArvore', () => {
  it('lista prato e preparos, que são o que vira tarefa, e ignora insumos', () => {
    const { raiz } = explodirFicha(cozinhaDeTeste().ctx, 'sopa')
    expect(fichasDaArvore(raiz).map((f) => f.nome)).toEqual(['Sopa do dia', 'Fundo de legumes'])
  })
})
