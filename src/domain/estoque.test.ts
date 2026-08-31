import { describe, expect, it } from 'vitest'

import {
  abaixoDoMinimo,
  lotesPorValidade,
  lotesVencendo,
  saldoDe,
  situacaoDeEstoque,
  valorMedioPago,
} from './estoque'
import { PADROES_PRODUTO, type MovimentoEstoque, type Produto } from './types'

const ORG = '11111111-1111-1111-1111-111111111111'
const PRODUTO = 'aaaa0000-0000-0000-0000-000000000001'

let sequencia = 0

function mov(parcial: Partial<MovimentoEstoque>): MovimentoEstoque {
  const agora = new Date(2026, 7, 30, 10, ++sequencia).toISOString()
  return {
    id: `m${sequencia}`,
    org_id: ORG,
    product_id: PRODUTO,
    tipo: 'entrada',
    quantidade: 1,
    unidade: 'kg',
    ocorrido_em: agora,
    created_at: agora,
    ...parcial,
  }
}

function produto(parcial: Partial<Produto> = {}): Produto {
  const agora = new Date(2026, 7, 30).toISOString()
  return {
    ...PADROES_PRODUTO,
    id: PRODUTO,
    org_id: ORG,
    nome: 'Farinha',
    shelf_life_days: 90,
    ativo: true,
    controla_estoque: true,
    created_at: agora,
    updated_at: agora,
    ...parcial,
  }
}

describe('saldoDe', () => {
  it('soma entradas e subtrai saídas', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10 }),
      mov({ tipo: 'saida', quantidade: 3 }),
    ]
    expect(saldoDe(movimentos, 'kg')).toBe(7)
  })

  it('não depende da ordem em que os movimentos chegaram', () => {
    // O sync offline entrega fora de ordem: a saída pode chegar antes da
    // entrada que a cobre. O saldo final tem que ser o mesmo.
    const entrada = mov({ tipo: 'entrada', quantidade: 10 })
    const saida = mov({ tipo: 'saida', quantidade: 3 })
    const atrasada = mov({ tipo: 'entrada', quantidade: 5 })

    expect(saldoDe([entrada, saida, atrasada], 'kg')).toBe(12)
    expect(saldoDe([saida, atrasada, entrada], 'kg')).toBe(12)
    expect(saldoDe([atrasada, entrada, saida], 'kg')).toBe(12)
  })

  it('trata perda como saída e ajuste como correção assinada', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10 }),
      mov({ tipo: 'perda', quantidade: 2, motivo: 'Molhou' }),
      mov({ tipo: 'ajuste', quantidade: 1, motivo: 'Contagem' }),
    ]
    expect(saldoDe(movimentos, 'kg')).toBe(9)
  })

  it('mantém kg e unidade como contagens independentes', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10, unidade: 'kg' }),
      mov({ tipo: 'entrada', quantidade: 4, unidade: 'un' }),
      mov({ tipo: 'saida', quantidade: 3, unidade: 'kg' }),
    ]
    expect(saldoDe(movimentos, 'kg')).toBe(7)
    expect(saldoDe(movimentos, 'un')).toBe(4)
  })

  it('não deixa a soma de decimais vazar erro de ponto flutuante', () => {
    // 0.1 + 0.2 em float é 0.30000000000000004, e esse número chegaria à tela.
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 0.1 }),
      mov({ tipo: 'entrada', quantidade: 0.2 }),
    ]
    expect(saldoDe(movimentos, 'kg')).toBe(0.3)
  })

  it('devolve zero quando não há movimento nenhum', () => {
    expect(saldoDe([], 'kg')).toBe(0)
  })

  it('aceita saldo negativo em vez de escondê-lo', () => {
    // Saldo negativo é erro de lançamento, e o número tem que aparecer para
    // alguém corrigir. Zerar na marra esconderia a falha.
    expect(saldoDe([mov({ tipo: 'saida', quantidade: 2 })], 'kg')).toBe(-2)
  })
})

describe('valorMedioPago', () => {
  it('pondera pela quantidade, e não pela média simples dos preços', () => {
    // 100 kg a R$ 10 e 1 kg a R$ 30 não fazem o produto valer R$ 20.
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 100, valor_unitario: 10 }),
      mov({ tipo: 'entrada', quantidade: 1, valor_unitario: 30 }),
    ]
    const media = valorMedioPago(movimentos, 'kg')
    expect(media).toBeCloseTo(10.198, 3)
    expect(media).not.toBeCloseTo(20, 1)
  })

  it('não é o último preço pago', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10, valor_unitario: 8 }),
      mov({ tipo: 'entrada', quantidade: 10, valor_unitario: 12 }),
    ]
    expect(valorMedioPago(movimentos, 'kg')).toBe(10)
  })

  it('ignora saídas — elas não têm preço de compra', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10, valor_unitario: 10 }),
      mov({ tipo: 'saida', quantidade: 5, valor_unitario: 999 }),
    ]
    expect(valorMedioPago(movimentos, 'kg')).toBe(10)
  })

  it('ignora entrada sem preço em vez de contá-la como zero', () => {
    // Uma doação ou um acerto de contagem não barateou o produto.
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10, valor_unitario: 10 }),
      mov({ tipo: 'entrada', quantidade: 90 }),
    ]
    expect(valorMedioPago(movimentos, 'kg')).toBe(10)
  })

  it('separa o preço de kg do preço de unidade', () => {
    const movimentos = [
      mov({ tipo: 'entrada', quantidade: 10, unidade: 'kg', valor_unitario: 10 }),
      mov({ tipo: 'entrada', quantidade: 10, unidade: 'un', valor_unitario: 4 }),
    ]
    expect(valorMedioPago(movimentos, 'kg')).toBe(10)
    expect(valorMedioPago(movimentos, 'un')).toBe(4)
  })

  it('devolve null quando não há preço, para distinguir de custo zero', () => {
    expect(valorMedioPago([mov({ tipo: 'entrada', quantidade: 5 })], 'kg')).toBeNull()
    expect(valorMedioPago([], 'kg')).toBeNull()
  })
})

describe('lotesPorValidade', () => {
  it('ordena pelo que vence primeiro', () => {
    const movimentos = [
      mov({ quantidade: 5, lote: 'B', validade: '2026-10-10' }),
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ quantidade: 5, lote: 'C', validade: '2026-09-20' }),
    ]
    expect(lotesPorValidade(movimentos, 'kg').map((l) => l.lote)).toEqual(['A', 'C', 'B'])
  })

  it('desempata dois lotes sem validade pelo mais antigo', () => {
    // Sem esse desempate a ordem sairia de como a lista de movimentos chegou —
    // e o sync entrega do mais recente para o mais antigo, que é o inverso do
    // que a cozinha deve usar.
    const antigo = mov({
      quantidade: 5,
      lote: 'A',
      ocorrido_em: new Date(2026, 6, 1).toISOString(),
    })
    const novo = mov({
      quantidade: 5,
      lote: 'B',
      ocorrido_em: new Date(2026, 7, 1).toISOString(),
    })

    expect(lotesPorValidade([novo, antigo], 'kg').map((l) => l.lote)).toEqual(['A', 'B'])
    expect(lotesPorValidade([antigo, novo], 'kg').map((l) => l.lote)).toEqual(['A', 'B'])
  })

  it('consome primeiro o lote mais antigo quando nenhum tem validade', () => {
    const antigo = mov({
      quantidade: 5,
      lote: 'A',
      ocorrido_em: new Date(2026, 6, 1).toISOString(),
    })
    const novo = mov({
      quantidade: 5,
      lote: 'B',
      ocorrido_em: new Date(2026, 7, 1).toISOString(),
    })
    const saida = mov({ tipo: 'saida', quantidade: 5 })

    expect(lotesPorValidade([novo, antigo, saida], 'kg').map((l) => l.restanteEstimado)).toEqual([
      0, 5,
    ])
  })

  it('joga lote sem validade para o fim da fila', () => {
    // Mandar usar primeiro aquilo cuja validade ninguém sabe é o contrário do
    // controle que o sistema existe para dar.
    const movimentos = [
      mov({ quantidade: 5, lote: 'SEM' }),
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
    ]
    expect(lotesPorValidade(movimentos, 'kg').map((l) => l.lote)).toEqual(['A', 'SEM'])
  })

  it('consome os lotes na ordem de validade', () => {
    const movimentos = [
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ quantidade: 5, lote: 'B', validade: '2026-10-10' }),
      mov({ tipo: 'saida', quantidade: 7 }),
    ]
    const lotes = lotesPorValidade(movimentos, 'kg')
    expect(lotes[0]).toMatchObject({ lote: 'A', entrada: 5, restanteEstimado: 0 })
    expect(lotes[1]).toMatchObject({ lote: 'B', entrada: 5, restanteEstimado: 3 })
  })

  it('agrupa duas compras do mesmo lote na mesma pilha', () => {
    const movimentos = [
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ quantidade: 3, lote: 'A', validade: '2026-09-01' }),
    ]
    const lotes = lotesPorValidade(movimentos, 'kg')
    expect(lotes).toHaveLength(1)
    expect(lotes.map((l) => l.entrada)).toEqual([8])
  })

  it('conta perda como consumo do lote mais antigo', () => {
    const movimentos = [
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ quantidade: 5, lote: 'B', validade: '2026-10-10' }),
      mov({ tipo: 'perda', quantidade: 5, motivo: 'Vencido' }),
    ]
    const lotes = lotesPorValidade(movimentos, 'kg')
    expect(lotes.map((l) => l.restanteEstimado)).toEqual([0, 5])
  })

  it('deixa o ajuste fora do consumo de lote', () => {
    // Ajuste é correção do saldo total; não pertence a lote nenhum, e descontá-lo
    // de um lote específico inventaria informação que o movimento não tem.
    const movimentos = [
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ tipo: 'ajuste', quantidade: 2, motivo: 'Contagem' }),
    ]
    expect(lotesPorValidade(movimentos, 'kg').map((l) => l.restanteEstimado)).toEqual([5])
  })

  it('não mistura lotes de kg com lotes de unidade', () => {
    const movimentos = [
      mov({ quantidade: 5, unidade: 'kg', lote: 'A', validade: '2026-09-01' }),
      mov({ quantidade: 5, unidade: 'un', lote: 'B', validade: '2026-09-02' }),
    ]
    expect(lotesPorValidade(movimentos, 'kg').map((l) => l.lote)).toEqual(['A'])
    expect(lotesPorValidade(movimentos, 'un').map((l) => l.lote)).toEqual(['B'])
  })

  it('não deixa o restante ficar negativo quando saiu mais do que entrou', () => {
    const movimentos = [
      mov({ quantidade: 5, lote: 'A', validade: '2026-09-01' }),
      mov({ tipo: 'saida', quantidade: 9 }),
    ]
    expect(lotesPorValidade(movimentos, 'kg').map((l) => l.restanteEstimado)).toEqual([0])
  })
})

describe('lotesVencendo', () => {
  const agora = new Date(2026, 8, 1, 10) // 01/09/2026

  it('aponta o que vence dentro da janela e ainda tem saldo', () => {
    const lotes = lotesPorValidade(
      [
        mov({ quantidade: 5, lote: 'A', validade: '2026-09-03' }),
        mov({ quantidade: 5, lote: 'B', validade: '2026-12-01' }),
      ],
      'kg',
    )
    expect(lotesVencendo(lotes, 7, agora).map((l) => l.lote)).toEqual(['A'])
  })

  it('não aponta lote já consumido', () => {
    const lotes = lotesPorValidade(
      [
        mov({ quantidade: 5, lote: 'A', validade: '2026-09-03' }),
        mov({ tipo: 'saida', quantidade: 5 }),
      ],
      'kg',
    )
    expect(lotesVencendo(lotes, 7, agora)).toEqual([])
  })

  it('inclui o que já venceu e continua no estoque', () => {
    const lotes = lotesPorValidade([mov({ quantidade: 5, lote: 'A', validade: '2026-08-20' })], 'kg')
    expect(lotesVencendo(lotes, 7, agora).map((l) => l.lote)).toEqual(['A'])
  })
})

describe('situacaoDeEstoque', () => {
  it('acusa saldo abaixo do mínimo em kg', () => {
    const s = situacaoDeEstoque(
      produto({ unidade_estoque: 'kg', estoque_minimo_kg: 5, saldo_kg: 3 }),
    )
    expect(s.abaixoKg).toBe(true)
    expect(s.abaixo).toBe(true)
    expect(s.faltaKg).toBe(2)
  })

  it('trata chegar no mínimo como hora de repor', () => {
    // O mínimo é o ponto de PEDIDO, não o ponto de acabar: avisar só ao passar
    // dele deixaria a cozinha sem produto durante o prazo de entrega.
    const s = situacaoDeEstoque(
      produto({ unidade_estoque: 'kg', estoque_minimo_kg: 5, saldo_kg: 5 }),
    )
    expect(s.abaixoKg).toBe(true)
    expect(s.faltaKg).toBe(0)
  })

  it('não cobra em kg um produto contado só em unidade', () => {
    const s = situacaoDeEstoque(
      produto({
        unidade_estoque: 'un',
        estoque_minimo_kg: 5,
        estoque_minimo_un: 10,
        saldo_kg: 0,
        saldo_un: 20,
      }),
    )
    expect(s.abaixoKg).toBe(false)
    expect(s.abaixo).toBe(false)
  })

  it('cobra as duas unidades quando o produto é contado em ambas', () => {
    const s = situacaoDeEstoque(
      produto({
        unidade_estoque: 'ambos',
        estoque_minimo_kg: 5,
        estoque_minimo_un: 10,
        saldo_kg: 3,
        saldo_un: 4,
      }),
    )
    expect(s.abaixoKg).toBe(true)
    expect(s.abaixoUn).toBe(true)
    expect(s.faltaKg).toBe(2)
    expect(s.faltaUn).toBe(6)
  })

  it('trata mínimo zero como "não acompanho", e não como "avise sempre"', () => {
    // Alerta falso é o que faz a cozinha parar de olhar para os alertas.
    const s = situacaoDeEstoque(
      produto({ unidade_estoque: 'ambos', estoque_minimo_kg: 0, saldo_kg: 0 }),
    )
    expect(s.abaixo).toBe(false)
  })

  it('não alerta sobre produto que não controla estoque', () => {
    const s = situacaoDeEstoque(
      produto({ controla_estoque: false, estoque_minimo_un: 10, saldo_un: 0 }),
    )
    expect(s.abaixo).toBe(false)
  })

  it('acusa saldo negativo como abaixo do mínimo', () => {
    const s = situacaoDeEstoque(
      produto({ unidade_estoque: 'kg', estoque_minimo_kg: 5, saldo_kg: -2 }),
    )
    expect(s.abaixoKg).toBe(true)
    expect(s.faltaKg).toBe(7)
  })
})

describe('abaixoDoMinimo', () => {
  it('resume a situação num booleano para filtrar listas', () => {
    expect(
      abaixoDoMinimo(produto({ unidade_estoque: 'un', estoque_minimo_un: 10, saldo_un: 2 })),
    ).toBe(true)
    expect(
      abaixoDoMinimo(produto({ unidade_estoque: 'un', estoque_minimo_un: 10, saldo_un: 40 })),
    ).toBe(false)
  })
})
