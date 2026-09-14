import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { agora, apagar, db, limparLocal, novoId, salvar } from './db'
import type { Insumo } from '@/dominio/tipos'

function insumoNovo(nome: string): Insumo {
  return {
    id: novoId(),
    dono_id: 'dono',
    espaco_id: 'espaco',
    nome,
    categoria: '',
    fornecedor: '',
    quantidade_compra: 1,
    unidade_compra: 'kg',
    preco_compra: 10,
    unidade_uso: 'g',
    fator_correcao: 1,
    observacao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
}

beforeEach(async () => {
  await limparLocal()
})

describe('salvar', () => {
  it('grava no espelho local e enfileira o envio', async () => {
    const insumo = insumoNovo('Cebola')
    await salvar('insumos', insumo)

    expect(await db.insumos.get(insumo.id)).toMatchObject({ nome: 'Cebola' })
    const fila = await db.outbox.toArray()
    expect(fila).toHaveLength(1)
    expect(fila[0]).toMatchObject({ tabela: 'insumos', registroId: insumo.id })
  })

  it('carimba a hora da alteração', async () => {
    const insumo = { ...insumoNovo('Alho'), atualizado_em: '2020-01-01T00:00:00.000Z' }
    const salvo = await salvar('insumos', insumo)
    expect(salvo.atualizado_em).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('não enfileira cinco vezes a linha alterada cinco vezes offline', async () => {
    const insumo = insumoNovo('Sal')
    await salvar('insumos', insumo)
    await salvar('insumos', { ...insumo, preco_compra: 11 })
    await salvar('insumos', { ...insumo, preco_compra: 12 })

    // O que precisa subir é o estado final, não o caminho até ele.
    expect(await db.outbox.count()).toBe(1)
    expect((await db.insumos.get(insumo.id))?.preco_compra).toBe(12)
  })
})

describe('apagar', () => {
  it('marca em vez de remover, para a deleção conseguir viajar', async () => {
    const insumo = insumoNovo('Tomate')
    await salvar('insumos', insumo)
    await db.outbox.clear()

    await apagar('insumos', insumo.id)

    const guardado = await db.insumos.get(insumo.id)
    expect(guardado).toBeDefined()
    expect(guardado?.apagado_em).not.toBeNull()
    // E vira uma pendência: o outro aparelho precisa saber que sumiu.
    expect(await db.outbox.count()).toBe(1)
  })

  it('não faz nada com linha que não existe', async () => {
    await apagar('insumos', novoId())
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('limparLocal', () => {
  it('esvazia dados, fila e cursores', async () => {
    await salvar('insumos', insumoNovo('Pimenta'))
    await db.cursores.put({ tabela: 'insumos', desde: agora() })

    await limparLocal()

    expect(await db.insumos.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.cursores.count()).toBe(0)
  })
})
