import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { PADROES_PRODUTO } from '../domain/types'
import { db } from './db'
import { destinoDaLeitura, resolverLeitura } from './leitura'

/**
 * O roteamento do leitor.
 *
 * O que este arquivo protege é a ORDEM das tentativas. Um código de barras que
 * caia no ramo do código curto abriria a etiqueta de outro produto, e a pessoa
 * daria baixa no que não devia — erro que só aparece na contagem seguinte,
 * quando já não dá para saber o que aconteceu.
 */

const ORG = '11111111-1111-1111-1111-111111111111'
const OUTRA_ORG = '22222222-2222-2222-2222-222222222222'
const EAN = '7898357410015'

const agora = new Date().toISOString()

async function criarProduto(campos: Partial<Parameters<typeof db.products.put>[0]> = {}) {
  const id = crypto.randomUUID()
  await db.products.put({
    ...PADROES_PRODUTO,
    id,
    org_id: ORG,
    nome: 'Farinha de trigo',
    shelf_life_days: 30,
    ativo: true,
    created_at: agora,
    updated_at: agora,
    ...campos,
  })
  return id
}

beforeEach(async () => {
  await db.products.clear()
  await db.labels.clear()
  await db.inventory_tags.clear()
})

describe('resolverLeitura', () => {
  it('o QR do app tem precedência sobre tudo', async () => {
    const id = '33333333-3333-3333-3333-333333333333'
    const leitura = await resolverLeitura(
      `https://exemplo.github.io/All-Big-Chef/#/l/${id}`,
      ORG,
    )
    expect(leitura).toEqual({ tipo: 'etiqueta', id })
  })

  it('distingue o QR de inventário do de validade', async () => {
    const id = '44444444-4444-4444-4444-444444444444'
    const leitura = await resolverLeitura(`.../All-Big-Chef/#/i/${id}`, ORG)
    expect(leitura).toEqual({ tipo: 'inventario', id })
  })

  it('acha o produto pelo código de barras da embalagem', async () => {
    const id = await criarProduto({ codigo_barras: EAN })
    expect(await resolverLeitura(EAN, ORG)).toEqual({ tipo: 'produto', id, codigo: EAN })
  })

  it('aceita o código com os espaços que o leitor às vezes emite', async () => {
    const id = await criarProduto({ codigo_barras: EAN })
    const leitura = await resolverLeitura(' 789 8357 410015 ', ORG)
    expect(leitura).toEqual({ tipo: 'produto', id, codigo: EAN })
  })

  it('código de barras de ninguém vira convite para vincular, não erro', async () => {
    // É o "aprender bipando": quem bipa um produto novo espera poder vinculá-lo
    // ali mesmo, não ser mandado ao cadastro para digitar treze dígitos.
    expect(await resolverLeitura(EAN, ORG)).toEqual({ tipo: 'desconhecido', codigo: EAN })
  })

  it('não enxerga o produto de outro restaurante', async () => {
    // O mesmo EAN existe na cozinha de todo mundo; o índice é por organização.
    await criarProduto({ codigo_barras: EAN, org_id: OUTRA_ORG })
    expect(await resolverLeitura(EAN, ORG)).toEqual({ tipo: 'desconhecido', codigo: EAN })
  })

  it('ignora produto arquivado', async () => {
    await criarProduto({ codigo_barras: EAN, ativo: false, deleted_at: agora })
    expect(await resolverLeitura(EAN, ORG)).toEqual({ tipo: 'desconhecido', codigo: EAN })
  })

  it('acha a etiqueta pelo código curto impresso', async () => {
    await db.labels.put({
      id: 'l1',
      org_id: ORG,
      product_id: 'p1',
      short_code: 'A1B2C3',
      status: 'ativa',
      created_at: agora,
      updated_at: agora,
    } as Parameters<typeof db.labels.put>[0])

    expect(await resolverLeitura('a1b2c3', ORG)).toEqual({ tipo: 'etiqueta', id: 'l1' })
  })

  it('o código curto não é procurado em outro restaurante', async () => {
    await db.labels.put({
      id: 'l1',
      org_id: OUTRA_ORG,
      product_id: 'p1',
      short_code: 'A1B2C3',
      status: 'ativa',
      created_at: agora,
      updated_at: agora,
    } as Parameters<typeof db.labels.put>[0])

    expect((await resolverLeitura('A1B2C3', ORG)).tipo).toBe('ilegivel')
  })

  it('o que não é nada disso é dito, não engolido', async () => {
    // Ignorar em silêncio faria a pessoa bipar de novo achando que não leu.
    expect(await resolverLeitura('xx', ORG)).toEqual({ tipo: 'ilegivel', codigo: 'xx' })
  })
})

describe('destinoDaLeitura', () => {
  it('o produto abre na tela de estoque, onde estão entrada e saída', () => {
    expect(destinoDaLeitura({ tipo: 'produto', id: 'p1', codigo: EAN })).toBe('/estoque/p1')
  })

  it('o código desconhecido leva à lista com o código na mão', () => {
    expect(destinoDaLeitura({ tipo: 'desconhecido', codigo: EAN })).toBe(
      `/estoque?vincular=${EAN}`,
    )
  })

  it('o ilegível não leva a lugar nenhum', () => {
    expect(destinoDaLeitura({ tipo: 'ilegivel', codigo: 'xx' })).toBeNull()
  })
})
