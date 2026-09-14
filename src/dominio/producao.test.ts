import { describe, expect, it } from 'vitest'
import { explodirFicha, montarContexto } from './arvore'
import { calcularProgresso, consolidarProducao } from './producao'
import { comFicha, comInsumo, ficha, insumo } from './testes/fabricas'
import { cozinhaDeTeste } from './testes/cozinha'

function tarefasDoMenu(porcoesSopa = 8) {
  const { ctx } = cozinhaDeTeste()
  const sopa = explodirFicha(ctx, 'sopa', { porcoes: porcoesSopa })
  const salada = explodirFicha(ctx, 'salada')
  return consolidarProducao(
    [
      { rotulo: 'Sopa do dia', no: sopa.raiz },
      { rotulo: 'Salada', no: salada.raiz },
    ],
    ctx,
  )
}

describe('consolidarProducao', () => {
  it('lista pratos e preparos como tarefas, e ignora insumos', () => {
    expect(tarefasDoMenu().map((t) => t.nome).sort()).toEqual([
      'Fundo de legumes',
      'Salada',
      'Sopa do dia',
    ])
  })

  it('põe primeiro o que está mais fundo na árvore', () => {
    // O fundo tem que estar pronto antes da sopa que o usa.
    expect(tarefasDoMenu()[0]!.nome).toBe('Fundo de legumes')
  })

  it('soma o preparo na unidade em que ele rende', () => {
    const fundo = tarefasDoMenu().find((t) => t.nome === 'Fundo de legumes')!
    // Sopa para 8 porções consome 2000 ml do fundo.
    expect(fundo.quantidade).toBeCloseTo(2000, 6)
    expect(fundo.unidade).toBe('ml')
  })

  it('junta num trabalho só o preparo usado em vários pratos', () => {
    const ctx = montarContexto(
      [
        ficha('fundo', 'preparo', {
          nome: 'Fundo',
          rendimento_quantidade: 1000,
          rendimento_unidade: 'ml',
          porcoes: 10,
        }),
        ficha('sopa', 'prato', { nome: 'Sopa', porcoes: 1 }),
        ficha('risoto', 'prato', { nome: 'Risoto', porcoes: 1 }),
      ],
      [comFicha('sopa', 'fundo', 400, 'ml'), comFicha('risoto', 'fundo', 0.6, 'L')],
      [],
    )
    const tarefas = consolidarProducao(
      [
        { rotulo: 'Sopa', no: explodirFicha(ctx, 'sopa').raiz },
        { rotulo: 'Risoto', no: explodirFicha(ctx, 'risoto').raiz },
      ],
      ctx,
    )

    const fundo = tarefas.find((t) => t.nome === 'Fundo')!
    // 400 ml de um prato mais 0,6 L do outro: um litro de fundo, feito uma vez.
    expect(fundo.quantidade).toBeCloseTo(1000, 6)
    expect(fundo.usadoEm).toEqual(['Sopa', 'Risoto'])
    expect(fundo.incerta).toBe(false)
  })

  it('marca a soma como incerta quando as unidades não se convertem', () => {
    const ctx = montarContexto(
      [
        ficha('massa', 'preparo', {
          nome: 'Massa',
          rendimento_quantidade: 1000,
          rendimento_unidade: 'g',
          porcoes: 4,
        }),
        ficha('prato', 'prato', { nome: 'Prato', porcoes: 1 }),
      ],
      [comFicha('prato', 'massa', 500, 'ml')],
      [],
    )
    const tarefas = consolidarProducao(
      [{ rotulo: 'Prato', no: explodirFicha(ctx, 'prato').raiz }],
      ctx,
    )
    expect(tarefas.find((t) => t.nome === 'Massa')!.incerta).toBe(true)
  })

  it('acompanha o custo de cada tarefa', () => {
    const fundo = tarefasDoMenu().find((t) => t.nome === 'Fundo de legumes')!
    expect(fundo.custo).toBeCloseTo(3.8, 6)
  })

  it('lida com um preparo dentro de outro preparo', () => {
    const ctx = montarContexto(
      [
        ficha('base', 'preparo', { nome: 'Base', rendimento_quantidade: 100, rendimento_unidade: 'g', porcoes: 1 }),
        ficha('molho', 'preparo', { nome: 'Molho', rendimento_quantidade: 200, rendimento_unidade: 'g', porcoes: 1 }),
        ficha('prato', 'prato', { nome: 'Prato', porcoes: 1 }),
      ],
      [
        comInsumo('base', 'sal', 100, 'g'),
        comFicha('molho', 'base', 100, 'g'),
        comFicha('prato', 'molho', 200, 'g'),
      ],
      [insumo('sal')],
    )
    const tarefas = consolidarProducao(
      [{ rotulo: 'Prato', no: explodirFicha(ctx, 'prato').raiz }],
      ctx,
    )
    // A ordem de trabalho desce até a raiz da árvore: base, molho, prato.
    expect(tarefas.map((t) => t.nome)).toEqual(['Base', 'Molho', 'Prato'])
  })
})

describe('calcularProgresso', () => {
  it('conta só o que está feito', () => {
    const status = new Map([
      ['a', 'feito'],
      ['b', 'fazendo'],
      ['c', 'a_fazer'],
    ])
    expect(calcularProgresso(['a', 'b', 'c'], status)).toEqual({
      feitos: 1,
      total: 3,
      fracao: 1 / 3,
    })
  })

  it('não divide por zero quando não há tarefa', () => {
    expect(calcularProgresso([], new Map()).fracao).toBe(0)
  })
})
