import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  PADROES_PRODUTO,
  TABELAS_APPEND_ONLY,
  TABELAS_SINCRONIZADAS,
  type TabelaAppendOnly,
  type TabelaSincronizada,
} from '../../domain/types'
import {
  db,
  registrarEvento,
  registrarMovimento,
  salvarESincronizar,
  type OperacaoPendente,
} from '../db'
import { novoCodigoCurto, novoId } from '../ids'

/**
 * O contrato entre a fila de envio e os caminhos de descida.
 *
 * Estes testes existem por causa de um bug real: `stock_movements` foi
 * acrescentada à fila de envio e subia para o servidor, mas nada a trazia de
 * volta — a descida citava `label_events` pelo nome. O segundo aparelho da
 * cozinha ficava com histórico de movimentos incompleto, ordem de uso errada e
 * valor médio pago errado, tudo em silêncio.
 *
 * A regra que os testes fixam: **tudo que a fila aceita enviar precisa ter um
 * caminho de volta.**
 */

const ORG = '11111111-1111-1111-1111-111111111111'

/** Verdadeiro só quando os dois tipos são exatamente o mesmo. */
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/**
 * Trava de compilação: a união aceita pela fila é exatamente a soma das duas
 * listas. Acrescentar uma tabela à fila sem pô-la numa das listas para de
 * compilar aqui, antes de qualquer teste rodar.
 */
const _cobertura: Igual<
  OperacaoPendente['tabela'],
  TabelaSincronizada | TabelaAppendOnly
> = true
void _cobertura

const TODAS = [...TABELAS_SINCRONIZADAS, ...TABELAS_APPEND_ONLY] as string[]

describe('listas de sincronização', () => {
  it('não repete tabela entre as duas listas', () => {
    // Uma tabela nas duas desceria por `updated_at` e por `created_at`, com dois
    // cursores brigando pela mesma chave em `marcas`.
    const repetidas = TABELAS_SINCRONIZADAS.filter((t) =>
      (TABELAS_APPEND_ONLY as readonly string[]).includes(t),
    )
    expect(repetidas).toEqual([])
  })

  it('só nomeia tabelas que existem no banco local', () => {
    // Um nome errado numa lista falharia em silêncio: o pull não acharia nada.
    for (const tabela of TODAS) {
      expect(() => db.table(tabela)).not.toThrow()
    }
  })

  it('põe os livros-razão como append-only, e não como cadastro', () => {
    // Eles não têm `updated_at`; descer por ele traria zero linha, sempre.
    expect([...TABELAS_APPEND_ONLY]).toContain('label_events')
    expect([...TABELAS_APPEND_ONLY]).toContain('stock_movements')
  })
})

describe('tudo que entra na fila tem caminho de volta', () => {
  beforeEach(async () => {
    await db.outbox.clear()
  })

  /** Nomes de tabela que a fila realmente acumulou, sem repetição. */
  async function tabelasNaFila(): Promise<string[]> {
    const fila = await db.outbox.toArray()
    return [...new Set(fila.map((op) => op.tabela))]
  }

  it('cobre o que o cadastro de produto enfileira', async () => {
    const agora = new Date().toISOString()
    await salvarESincronizar('products', {
      ...PADROES_PRODUTO,
      id: novoId(),
      org_id: ORG,
      nome: 'Farinha',
      shelf_life_days: 90,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    })

    for (const tabela of await tabelasNaFila()) expect(TODAS).toContain(tabela)
  })

  it('cobre o que a baixa de etiqueta enfileira', async () => {
    const agora = new Date().toISOString()
    const labelId = novoId()

    await salvarESincronizar('labels', {
      id: labelId,
      org_id: ORG,
      short_code: novoCodigoCurto(),
      produto_snapshot: 'Creme de leite',
      opened_at: agora,
      expires_at: agora,
      printed_at: agora,
      status: 'ativa',
      created_at: agora,
      updated_at: agora,
    })
    await registrarEvento({
      id: novoId(),
      org_id: ORG,
      label_id: labelId,
      tipo: 'consumida',
      ocorrido_em: agora,
      created_at: agora,
    })

    const naFila = await tabelasNaFila()
    expect(naFila).toContain('label_events')
    for (const tabela of naFila) expect(TODAS).toContain(tabela)
  })

  it('cobre o que um movimento de estoque enfileira', async () => {
    // Este é o caso que quebrou: o movimento subia e nunca voltava.
    const agora = new Date().toISOString()
    await registrarMovimento({
      id: novoId(),
      org_id: ORG,
      product_id: novoId(),
      tipo: 'entrada',
      quantidade: 10,
      unidade: 'kg',
      ocorrido_em: agora,
      created_at: agora,
    })

    const naFila = await tabelasNaFila()
    expect(naFila).toContain('stock_movements')
    for (const tabela of naFila) expect(TODAS).toContain(tabela)
  })
})
