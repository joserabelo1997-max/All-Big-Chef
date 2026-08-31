import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../db'

/**
 * O pull do motor de sincronização, com um Supabase dublê.
 *
 * O que este arquivo protege é a **descida das tabelas append-only** — o
 * caminho que faltava para `stock_movements` e deixava o segundo aparelho da
 * cozinha com histórico incompleto, ordem de uso errada e valor médio errado.
 *
 * A paginação por `created_at` é a parte sutil: a segunda página tem que
 * continuar de onde a primeira parou, senão o motor busca a mesma página para
 * sempre ou pula linhas no meio.
 */

/** Página cheia força o motor a pedir a próxima; é o gatilho da paginação. */
const TAMANHO_PAGINA = 500

interface Consulta {
  tabela: string
  campo: string
  cursor: string
}

/** Registra o que foi pedido e devolve as páginas combinadas por tabela. */
function clienteFalso(paginas: Record<string, unknown[][]>) {
  const consultas: Consulta[] = []

  const cliente = {
    from(tabela: string) {
      let campo = ''
      let cursor = ''

      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        gt: (nomeDoCampo: string, valor: string) => {
          campo = nomeDoCampo
          cursor = valor
          return consulta
        },
        order: () => consulta,
        limit: () => {
          consultas.push({ tabela, campo, cursor })
          const restantes = paginas[tabela]
          const pagina = restantes?.shift() ?? []
          return Promise.resolve({ data: pagina, error: null })
        },
        upsert: () => Promise.resolve({ error: null }),
      }

      return consulta
    },
  }

  return { cliente, consultas }
}

function evento(i: number, quando: string) {
  return {
    id: `e${i}`,
    org_id: ORG,
    label_id: 'l1',
    tipo: 'impressa',
    ocorrido_em: quando,
    created_at: quando,
  }
}

function movimento(i: number, quando: string) {
  return {
    id: `m${i}`,
    org_id: ORG,
    product_id: 'p1',
    tipo: 'entrada',
    quantidade: 1,
    unidade: 'kg',
    ocorrido_em: quando,
    created_at: quando,
  }
}

const ORG = '11111111-1111-1111-1111-111111111111'

/** Uma página cheia de movimentos, com `created_at` crescente. */
function paginaCheia(inicio: number) {
  return Array.from({ length: TAMANHO_PAGINA }, (_, i) =>
    movimento(inicio + i, new Date(2026, 0, 1, 0, 0, inicio + i).toISOString()),
  )
}

/**
 * Roda o motor com o cliente dublê.
 *
 * O `supabase` é lido no topo do módulo, então a dublagem precisa ser aplicada
 * antes de importá-lo — daí o `vi.doMock` com import dinâmico.
 */
async function sincronizarCom(paginas: Record<string, unknown[][]>) {
  const { cliente, consultas } = clienteFalso(paginas)

  vi.resetModules()
  vi.doMock('../supabase', () => ({
    supabase: cliente,
    supabaseDisponivel: () => true,
    motivoSemSupabase: () => null,
  }))

  const { motorSync } = await import('./engine')
  await motorSync.sincronizar(ORG)

  return consultas
}

describe('pull das tabelas append-only', () => {
  beforeEach(async () => {
    await db.marcas.clear()
    await db.outbox.clear()
    await db.label_events.clear()
    await db.stock_movements.clear()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('baixa os movimentos de estoque, e não só os eventos de etiqueta', async () => {
    // É o bug que motivou o arquivo: `stock_movements` subia e nunca voltava.
    const consultas = await sincronizarCom({
      label_events: [[evento(1, '2026-01-01T10:00:00Z')]],
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })

    expect(consultas.map((c) => c.tabela)).toContain('stock_movements')
    expect(await db.stock_movements.count()).toBe(1)
    expect(await db.label_events.count()).toBe(1)
  })

  it('pagina pelo `created_at`, e não pelo `updated_at`', async () => {
    // Livro-razão não tem `updated_at`; filtrar por ele traria zero linha.
    const consultas = await sincronizarCom({
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })

    const doEstoque = consultas.filter((c) => c.tabela === 'stock_movements')
    expect(doEstoque.every((c) => c.campo === 'created_at')).toBe(true)
  })

  it('a segunda página continua de onde a primeira parou', async () => {
    // Sem avançar o cursor, o motor pediria a mesma página para sempre.
    const primeira = paginaCheia(0)
    const ultima = primeira[primeira.length - 1] as { created_at: string }

    const consultas = await sincronizarCom({
      stock_movements: [primeira, [movimento(999, '2026-06-01T00:00:00Z')]],
    })

    const doEstoque = consultas.filter((c) => c.tabela === 'stock_movements')
    expect(doEstoque.length).toBeGreaterThanOrEqual(2)
    expect(doEstoque[0]?.cursor).toBe('1970-01-01T00:00:00Z')
    expect(doEstoque[1]?.cursor).toBe(ultima.created_at)
    expect(await db.stock_movements.count()).toBe(TAMANHO_PAGINA + 1)
  })

  it('para de pedir quando a página vem incompleta', async () => {
    // Página menor que o limite significa fim; insistir seria uma ida à rede à
    // toa a cada sincronização.
    const consultas = await sincronizarCom({
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })

    expect(consultas.filter((c) => c.tabela === 'stock_movements')).toHaveLength(1)
  })

  it('guarda o cursor para a próxima sincronização não rebaixar tudo', async () => {
    await sincronizarCom({
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })

    expect((await db.marcas.get('stock_movements'))?.ate).toBe('2026-01-01T11:00:00Z')
  })

  it('reenviar a mesma linha não duplica', async () => {
    // O servidor pode repetir uma linha na borda da página; `bulkPut` é
    // idempotente pela chave primária.
    await sincronizarCom({
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })
    await db.marcas.clear()
    await sincronizarCom({
      stock_movements: [[movimento(1, '2026-01-01T11:00:00Z')]],
    })

    expect(await db.stock_movements.count()).toBe(1)
  })
})
