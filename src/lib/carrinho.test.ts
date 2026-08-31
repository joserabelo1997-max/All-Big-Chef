import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  definir,
  gravarCarrinho,
  lerCarrinho,
  MAXIMO_POR_PRODUTO,
  remover,
  somar,
  totalEtiquetas,
  totalProdutos,
  type Carrinho,
} from './carrinho'

/** localStorage de mentira, já que o ambiente de teste roda em Node. */
function instalarArmazenamento(): Map<string, string> {
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    removeItem: (chave: string) => void dados.delete(chave),
  })
  return dados
}

let armazenamento: Map<string, string>
beforeEach(() => {
  armazenamento = instalarArmazenamento()
})

describe('somar', () => {
  it('adiciona a um produto novo', () => {
    expect(somar({}, 'leite', 1)).toEqual({ leite: 1 })
  })

  it('acumula em cima do que já existe', () => {
    expect(somar({ leite: 4 }, 'leite', 1)).toEqual({ leite: 5 })
  })

  it('REMOVE o produto ao chegar a zero, em vez de guardar zero', () => {
    // Guardar `0` faria o item contar como produto na barra e aparecer na fila
    // de impressão como uma linha vazia.
    expect(somar({ leite: 1 }, 'leite', -1)).toEqual({})
  })

  it('não deixa a quantidade ficar negativa', () => {
    expect(somar({ leite: 1 }, 'leite', -5)).toEqual({})
  })

  it('respeita o teto por produto', () => {
    const cheio = somar({}, 'leite', 500)
    expect(cheio.leite).toBe(MAXIMO_POR_PRODUTO)
  })

  it('não altera o carrinho recebido', () => {
    const original: Carrinho = { leite: 2 }
    somar(original, 'leite', 3)
    expect(original).toEqual({ leite: 2 })
  })

  it('mantém os outros produtos intactos', () => {
    expect(somar({ leite: 5, peixe: 10 }, 'carne', 5)).toEqual({
      leite: 5,
      peixe: 10,
      carne: 5,
    })
  })
})

describe('definir e remover', () => {
  it('define uma quantidade exata', () => {
    expect(definir({ leite: 3 }, 'leite', 10)).toEqual({ leite: 10 })
  })

  it('definir zero remove o produto', () => {
    expect(definir({ leite: 3 }, 'leite', 0)).toEqual({})
  })

  it('remove um produto específico', () => {
    expect(remover({ leite: 3, peixe: 2 }, 'leite')).toEqual({ peixe: 2 })
  })
})

describe('totais', () => {
  it('soma as etiquetas, não conta os produtos', () => {
    // É a diferença entre "3 produtos" e "20 etiquetas" na barra — o número que
    // importa é quanto papel vai sair.
    expect(totalEtiquetas({ leite: 5, peixe: 10, carne: 5 })).toBe(20)
    expect(totalProdutos({ leite: 5, peixe: 10, carne: 5 })).toBe(3)
  })

  it('carrinho vazio soma zero', () => {
    expect(totalEtiquetas({})).toBe(0)
  })
})

describe('persistência', () => {
  it('sobrevive a uma releitura, que é o caso do app minimizado', () => {
    gravarCarrinho({ leite: 5, peixe: 10, carne: 5 })
    expect(lerCarrinho()).toEqual({ leite: 5, peixe: 10, carne: 5 })
  })

  it('apaga a chave quando o carrinho esvazia', () => {
    gravarCarrinho({ leite: 5 })
    gravarCarrinho({})
    expect(armazenamento.has('abc:carrinho')).toBe(false)
    expect(lerCarrinho()).toEqual({})
  })

  it('devolve vazio quando não há nada guardado', () => {
    expect(lerCarrinho()).toEqual({})
  })

  it('ignora conteúdo corrompido em vez de quebrar a tela', () => {
    armazenamento.set('abc:carrinho', 'isso não é json')
    expect(lerCarrinho()).toEqual({})
  })

  it('descarta quantidades inválidas que estiverem guardadas', () => {
    // Quantidade negativa, zero ou fracionada não pode chegar à impressora.
    armazenamento.set(
      'abc:carrinho',
      JSON.stringify({ leite: 5, peixe: -3, carne: 0, molho: 'dez', arroz: 2.5 }),
    )
    expect(lerCarrinho()).toEqual({ leite: 5 })
  })

  it('não deixa passar do teto ao ler', () => {
    armazenamento.set('abc:carrinho', JSON.stringify({ leite: 9999 }))
    expect(lerCarrinho().leite).toBe(MAXIMO_POR_PRODUTO)
  })
})
