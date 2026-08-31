import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import type { Fornecedor } from '../domain/types'
import { db } from './db'
import { acharPorNome, normalizarNome, resolverFornecedor } from './fornecedores'

const ORG = '11111111-1111-1111-1111-111111111111'

function fornecedor(nome: string, extras: Partial<Fornecedor> = {}): Fornecedor {
  const agora = new Date().toISOString()
  return {
    id: `f-${nome}`,
    org_id: ORG,
    nome,
    ativo: true,
    created_at: agora,
    updated_at: agora,
    ...extras,
  }
}

describe('normalizarNome', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(normalizarNome('  Laticínios  São João ')).toBe('laticinios sao joao')
  })

  it('reduz nomes escritos de formas diferentes à mesma chave', () => {
    // É o que impede a mesma empresa de virar três fornecedores porque três
    // pessoas digitaram de três jeitos.
    const chave = normalizarNome('Laticínios São João')
    expect(normalizarNome('laticinios sao joao')).toBe(chave)
    expect(normalizarNome('LATICÍNIOS SÃO JOÃO')).toBe(chave)
    expect(normalizarNome('Laticínios  São  João')).toBe(chave)
  })

  it('não junta nomes que são de fato diferentes', () => {
    expect(normalizarNome('Peixaria Sul')).not.toBe(normalizarNome('Peixaria Norte'))
  })
})

describe('acharPorNome', () => {
  const lista = [fornecedor('Laticínios São João'), fornecedor('Peixaria Sul')]

  it('encontra apesar da diferença de acento e caixa', () => {
    expect(acharPorNome(lista, 'laticinios sao joao')?.nome).toBe('Laticínios São João')
  })

  it('devolve indefinido para nome inédito', () => {
    expect(acharPorNome(lista, 'Hortifruti Central')).toBeUndefined()
  })

  it('devolve indefinido para nome vazio', () => {
    expect(acharPorNome(lista, '   ')).toBeUndefined()
  })
})

describe('resolverFornecedor', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
    await db.outbox.clear()
  })

  it('cria o fornecedor inédito e devolve o id', async () => {
    const id = await resolverFornecedor(ORG, 'Hortifruti Central')
    expect(id).toBeTruthy()

    const salvo = await db.suppliers.get(id!)
    expect(salvo?.nome).toBe('Hortifruti Central')
    expect(salvo?.ativo).toBe(true)
  })

  it('enfileira o fornecedor novo para o servidor', async () => {
    // Sem isso o produto sincronizaria apontando para um fornecedor que só
    // existe no aparelho, e o outro tablet da cozinha veria um vínculo quebrado.
    await resolverFornecedor(ORG, 'Hortifruti Central')
    const pendentes = await db.outbox.toArray()
    expect(pendentes.map((p) => p.tabela)).toContain('suppliers')
  })

  it('reaproveita o já cadastrado em vez de duplicar', async () => {
    const primeiro = await resolverFornecedor(ORG, 'Laticínios São João')
    const segundo = await resolverFornecedor(ORG, 'laticinios sao joao')

    expect(segundo).toBe(primeiro)
    expect(await db.suppliers.count()).toBe(1)
  })

  it('preserva a grafia original de quem cadastrou primeiro', async () => {
    const id = await resolverFornecedor(ORG, 'Laticínios São João')
    await resolverFornecedor(ORG, 'LATICINIOS SAO JOAO')
    expect((await db.suppliers.get(id!))?.nome).toBe('Laticínios São João')
  })

  it('reativa o arquivado em vez de criar um segundo', async () => {
    // Espalhar o histórico entre um "São João" morto e um "São João" novo
    // quebraria a rastreabilidade das etiquetas já impressas.
    await db.suppliers.put(
      fornecedor('Peixaria Sul', { ativo: false, deleted_at: new Date().toISOString() }),
    )

    const id = await resolverFornecedor(ORG, 'Peixaria Sul')
    expect(await db.suppliers.count()).toBe(1)

    const salvo = await db.suppliers.get(id!)
    expect(salvo?.ativo).toBe(true)
    expect(salvo?.deleted_at).toBeNull()
  })

  it('devolve null para nome vazio', async () => {
    // "Não informar" continua sendo uma resposta válida.
    expect(await resolverFornecedor(ORG, '   ')).toBeNull()
    expect(await db.suppliers.count()).toBe(0)
  })

  it('não enxerga o fornecedor de outro restaurante', async () => {
    await db.suppliers.put(fornecedor('Peixaria Sul', { org_id: 'outra-org' }))
    const id = await resolverFornecedor(ORG, 'Peixaria Sul')

    expect(await db.suppliers.count()).toBe(2)
    expect((await db.suppliers.get(id!))?.org_id).toBe(ORG)
  })
})
