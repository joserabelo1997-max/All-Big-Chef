import { montarContexto } from '../arvore'
import type { Contexto } from '../arvore'
import type { Insumo, Uuid } from '../tipos'
import { comFicha, comInsumo, ficha, insumo } from './fabricas'

/**
 * Cozinha de exemplo com contas que dá para conferir no papel:
 *
 *   Cebola — 1 kg por R$ 5,00, usada em g, fator de correção 1,2 → R$ 0,005/g
 *   Azeite — 500 ml por R$ 20,00, usado em ml, sem perda        → R$ 0,04/ml
 *
 *   Fundo (preparo) rende 2000 ml em 10 porções: 300 g de cebola + 50 ml de azeite
 *     cebola: 300 × 1,2 = 360 g brutos × 0,005 = R$ 1,80
 *     azeite:  50 × 0,04                        = R$ 2,00
 *     fundo inteiro                             = R$ 3,80
 *
 *   Sopa (prato) rende 1200 ml em 4 porções: 1000 ml de fundo + 100 g de cebola
 *     fundo: metade do rendimento → R$ 1,90
 *     cebola: 100 × 1,2 × 0,005   → R$ 0,60
 *     sopa                         = R$ 2,50  (R$ 0,625 por porção)
 *
 *   Salada (prato) rende 1 un em 2 porções: 50 g de cebola → R$ 0,30
 */
export interface CozinhaDeTeste {
  ctx: Contexto
  insumos: Map<Uuid, Insumo>
}

export function cozinhaDeTeste(): CozinhaDeTeste {
  const cebola = insumo('cebola', {
    nome: 'Cebola',
    categoria: 'Hortifrúti',
    fornecedor: 'Feira',
    quantidade_compra: 1,
    unidade_compra: 'kg',
    preco_compra: 5,
    unidade_uso: 'g',
    fator_correcao: 1.2,
  })
  const azeite = insumo('azeite', {
    nome: 'Azeite',
    categoria: 'Mercearia',
    fornecedor: 'Distribuidora',
    quantidade_compra: 500,
    unidade_compra: 'ml',
    preco_compra: 20,
    unidade_uso: 'ml',
    fator_correcao: 1,
  })

  const fundo = ficha('fundo', 'preparo', {
    nome: 'Fundo de legumes',
    rendimento_quantidade: 2000,
    rendimento_unidade: 'ml',
    porcoes: 10,
  })
  const sopa = ficha('sopa', 'prato', {
    nome: 'Sopa do dia',
    rendimento_quantidade: 1200,
    rendimento_unidade: 'ml',
    porcoes: 4,
  })
  const salada = ficha('salada', 'prato', {
    nome: 'Salada',
    rendimento_quantidade: 1,
    rendimento_unidade: 'un',
    porcoes: 2,
  })

  const ctx = montarContexto(
    [fundo, sopa, salada],
    [
      comInsumo('fundo', 'cebola', 300, 'g', 0),
      comInsumo('fundo', 'azeite', 50, 'ml', 1),
      comFicha('sopa', 'fundo', 1000, 'ml', 0),
      comInsumo('sopa', 'cebola', 100, 'g', 1),
      comInsumo('salada', 'cebola', 50, 'g', 0),
    ],
    [cebola, azeite],
  )

  return { ctx, insumos: ctx.insumos }
}
