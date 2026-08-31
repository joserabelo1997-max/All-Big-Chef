import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  PADROES_PRODUTO,
  type Etiqueta,
  type EventoEtiqueta,
  type Produto,
} from '../domain/types'
import { db, registrarEvento, salvarESincronizar } from './db'
import { novoCodigoCurto, novoId } from './ids'

const ORG = '11111111-1111-1111-1111-111111111111'

function produto(nome: string, dias = 3): Produto {
  const agora = new Date().toISOString()
  return {
    ...PADROES_PRODUTO,
    id: novoId(),
    org_id: ORG,
    nome,
    shelf_life_days: dias,
    ativo: true,
    created_at: agora,
    updated_at: agora,
  }
}

function etiqueta(nomeProduto: string): Etiqueta {
  const agora = new Date().toISOString()
  return {
    id: novoId(),
    org_id: ORG,
    short_code: novoCodigoCurto(),
    produto_snapshot: nomeProduto,
    opened_at: agora,
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    printed_at: agora,
    status: 'ativa',
    created_at: agora,
    updated_at: agora,
  }
}

function evento(labelId: string, tipo: EventoEtiqueta['tipo']): EventoEtiqueta {
  const agora = new Date().toISOString()
  return {
    id: novoId(),
    org_id: ORG,
    label_id: labelId,
    tipo,
    ocorrido_em: agora,
    created_at: agora,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('salvarESincronizar', () => {
  it('grava o registro e enfileira o envio', async () => {
    const p = produto('Creme de leite')
    await salvarESincronizar('products', p)

    expect(await db.products.get(p.id)).toMatchObject({ nome: 'Creme de leite' })

    const fila = await db.outbox.toArray()
    expect(fila).toHaveLength(1)
    expect(fila[0]).toMatchObject({ tabela: 'products', registroId: p.id, tentativas: 0 })
  })

  it('preserva a ordem em que as operações aconteceram', async () => {
    // O motor envia nessa ordem porque um evento de baixa não pode chegar
    // antes da etiqueta que ele referencia — a chave estrangeira rejeitaria.
    const a = produto('Leite')
    const b = produto('Queijo')
    const c = produto('Manteiga')
    await salvarESincronizar('products', a)
    await salvarESincronizar('products', b)
    await salvarESincronizar('products', c)

    const fila = await db.outbox.orderBy('seq').toArray()
    expect(fila.map((o) => o.registroId)).toEqual([a.id, b.id, c.id])
  })

  it('editar o mesmo registro enfileira as duas versões', async () => {
    // Não colapsamos: o servidor aplica upsert em sequência e chega ao mesmo
    // estado final, e manter as duas entradas evita perder a segunda edição se
    // a primeira já tiver subido.
    const p = produto('Leite')
    await salvarESincronizar('products', p)
    await salvarESincronizar('products', { ...p, nome: 'Leite UHT' })

    expect(await db.outbox.count()).toBe(2)
    expect((await db.products.get(p.id))?.nome).toBe('Leite UHT')
  })

  it('guarda os dados completos na fila, não só o id', async () => {
    // A fila precisa sobreviver a um recarregamento do app: se guardasse só o
    // id e o registro local mudasse antes do envio, subiria a versão errada.
    const p = produto('Creme de leite', 5)
    await salvarESincronizar('products', p)

    const [op] = await db.outbox.toArray()
    expect(op!.dados).toMatchObject({ nome: 'Creme de leite', shelf_life_days: 5 })
  })
})

describe('registrarEvento', () => {
  it('grava o evento e enfileira o envio', async () => {
    const e = etiqueta('Creme de leite')
    await salvarESincronizar('labels', e)
    await db.outbox.clear()

    const ev = evento(e.id, 'consumida')
    await registrarEvento(ev, 'consumida')

    expect(await db.label_events.get(ev.id)).toMatchObject({ tipo: 'consumida' })
    expect(await db.outbox.count()).toBe(1)
  })

  it('reflete o status derivado na etiqueta local', async () => {
    const e = etiqueta('Creme de leite')
    await salvarESincronizar('labels', e)

    await registrarEvento(evento(e.id, 'descartada'), 'descartada')

    expect((await db.labels.get(e.id))?.status).toBe('descartada')
  })

  it('acumula eventos em vez de sobrescrever', async () => {
    // É o que protege a rastreabilidade: se dois tablets offline agirem sobre a
    // mesma etiqueta, os dois registros precisam sobreviver.
    const e = etiqueta('Creme de leite')
    await salvarESincronizar('labels', e)

    await registrarEvento(evento(e.id, 'impressa'))
    await registrarEvento(evento(e.id, 'reimpressa'))
    await registrarEvento(evento(e.id, 'consumida'), 'consumida')

    const eventos = await db.label_events.where('label_id').equals(e.id).toArray()
    expect(eventos).toHaveLength(3)
    expect(eventos.map((x) => x.tipo).sort()).toEqual(
      ['consumida', 'impressa', 'reimpressa'].sort(),
    )
  })

  it('não quebra quando a etiqueta ainda não chegou neste aparelho', async () => {
    // Cenário real: outro tablet imprimiu, este escaneia o QR antes do sync.
    // O evento precisa ser aceito assim mesmo — perdê-lo é perder a baixa.
    const ev = evento(novoId(), 'consumida')
    await registrarEvento(ev, 'consumida')

    expect(await db.label_events.get(ev.id)).toBeDefined()
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('consultas do painel', () => {
  it('encontra etiquetas ativas ordenadas por vencimento', async () => {
    const agora = Date.now()
    for (const [nome, dias] of [
      ['Leite', 10],
      ['Peixe', 1],
      ['Queijo', 5],
    ] as const) {
      await salvarESincronizar('labels', {
        ...etiqueta(nome),
        expires_at: new Date(agora + dias * 86_400_000).toISOString(),
      })
    }

    const ativas = await db.labels
      .where('status')
      .equals('ativa')
      .sortBy('expires_at')

    expect(ativas.map((e) => e.produto_snapshot)).toEqual(['Peixe', 'Queijo', 'Leite'])
  })

  it('encontra a etiqueta pelo código curto impresso', async () => {
    const e = { ...etiqueta('Creme de leite'), short_code: 'A7K293' }
    await salvarESincronizar('labels', e)

    const achada = await db.labels.where('short_code').equals('A7K293').first()
    expect(achada?.id).toBe(e.id)
  })
})
