import Dexie, { type EntityTable } from 'dexie'

import type {
  Configuracoes,
  ContagemEstoque,
  Etiqueta,
  EtiquetaInventario,
  EventoEtiqueta,
  Fornecedor,
  ItemContagem,
  MembroEquipe,
  ModeloSalvo,
  MovimentoEstoque,
  Pasta,
  Produto,
  RequisicaoEstoque,
  TabelaAppendOnly,
  TabelaSincronizada,
} from '../domain/types'

/**
 * Banco local (IndexedDB).
 *
 * A cozinha é a fonte de verdade da operação, não o servidor. Toda leitura da
 * interface vem daqui e toda escrita cai aqui primeiro — o Supabase é
 * alcançado depois, em segundo plano. É isso que faz o app continuar imprimindo
 * e dando baixa quando o Wi-Fi cai no meio do serviço, que é quando ele mais
 * costuma cair.
 */

/** Uma operação pendente de envio ao servidor. */
export interface OperacaoPendente {
  /** Sequencial: a ordem de aplicação precisa ser a ordem em que aconteceu. */
  seq?: number
  /**
   * Deriva das duas listas de `domain/types.ts`, e não de nomes soltos: assim
   * não há como enfileirar o envio de uma tabela que nenhum caminho de descida
   * conhece — foi exatamente esse o descuido que deixou `stock_movements`
   * subindo sem nunca voltar.
   */
  tabela: TabelaSincronizada | TabelaAppendOnly
  /**
   * `upsert` cobre inserção e edição — o cliente já conhece o id, então não há
   * diferença prática entre criar e atualizar, e um upsert é idempotente
   * quando o envio precisa ser repetido.
   */
  operacao: 'upsert'
  registroId: string
  dados: Record<string, unknown>
  criadoEm: string
  /** Quantas vezes já tentamos enviar. Alimenta o recuo exponencial. */
  tentativas: number
  ultimoErro?: string
}

/** Cursores do pull incremental, um por tabela. */
export interface MarcaSync {
  tabela: string
  /** `updated_at` do registro mais recente já baixado. */
  ate: string
}

export class BancoLocal extends Dexie {
  folders!: EntityTable<Pasta, 'id'>
  suppliers!: EntityTable<Fornecedor, 'id'>
  products!: EntityTable<Produto, 'id'>
  team_members!: EntityTable<MembroEquipe, 'id'>
  label_templates!: EntityTable<ModeloSalvo, 'id'>
  labels!: EntityTable<Etiqueta, 'id'>
  label_events!: EntityTable<EventoEtiqueta, 'id'>
  org_settings!: EntityTable<Configuracoes, 'org_id'>

  stock_movements!: EntityTable<MovimentoEstoque, 'id'>
  stock_requests!: EntityTable<RequisicaoEstoque, 'id'>
  stock_counts!: EntityTable<ContagemEstoque, 'id'>
  stock_count_items!: EntityTable<ItemContagem, 'id'>
  inventory_tags!: EntityTable<EtiquetaInventario, 'id'>
  outbox!: EntityTable<OperacaoPendente, 'seq'>
  marcas!: EntityTable<MarcaSync, 'tabela'>

  constructor() {
    super('all-big-chef')

    this.version(1).stores({
      folders: 'id, org_id, parent_id, updated_at, deleted_at',
      suppliers: 'id, org_id, nome, updated_at, deleted_at',
      products: 'id, org_id, folder_id, nome, updated_at, deleted_at',
      team_members: 'id, org_id, nome, updated_at, deleted_at',
      label_templates: 'id, org_id, updated_at, deleted_at',
      // `status` e `expires_at` juntos porque o painel de validades sempre
      // consulta os dois ao mesmo tempo: etiquetas ativas ordenadas por prazo.
      labels: 'id, org_id, short_code, product_id, status, expires_at, updated_at, deleted_at, [status+expires_at]',
      label_events: 'id, org_id, label_id, ocorrido_em',
      org_settings: 'org_id',
      outbox: '++seq, tabela, registroId, criadoEm',
      marcas: 'tabela',
    })

    // Versão 2: módulo de estoque. Dexie migra sozinho as tabelas antigas —
    // nenhum dado de etiqueta é tocado ao abrir esta versão.
    this.version(2).stores({
      // `[product_id+unidade]` porque toda consulta de saldo filtra os dois ao
      // mesmo tempo, e kg e unidade são contagens independentes.
      stock_movements:
        'id, org_id, product_id, tipo, ocorrido_em, created_at, [product_id+unidade]',
      stock_requests: 'id, org_id, product_id, status, updated_at, deleted_at',
      stock_counts: 'id, org_id, status, updated_at',
      stock_count_items: 'id, org_id, count_id, product_id, updated_at',
      inventory_tags:
        'id, org_id, product_id, short_code, status, updated_at, deleted_at',
    })

    // Versão 3: código de barras do fabricante. Só acrescenta um índice em
    // `products`; nenhum registro é reescrito, e quem já tem produtos
    // cadastrados abre esta versão sem perder nada.
    this.version(3).stores({
      products:
        'id, org_id, folder_id, nome, codigo_barras, updated_at, deleted_at',
    })
  }
}

export const db = new BancoLocal()

/**
 * Grava localmente e enfileira o envio, numa transação só.
 *
 * As duas coisas precisam ser atômicas: gravar o dado sem enfileirar perderia a
 * alteração para sempre no próximo sync; enfileirar sem gravar mostraria à
 * cozinha um estado que o aparelho não tem.
 */
export async function salvarESincronizar<T extends { id: string }>(
  tabela: TabelaSincronizada,
  registro: T,
): Promise<void> {
  await db.transaction('rw', db[tabela], db.outbox, async () => {
    // `db.table()` em vez de `db[tabela]`: a união de EntityTable de tipos
    // diferentes não se estreita por índice, e o cast direto entre elas o
    // TypeScript recusa (com razão — são tipos de linha distintos).
    await db.table(tabela).put(registro)
    await db.outbox.add({
      tabela,
      operacao: 'upsert',
      registroId: registro.id,
      dados: registro as unknown as Record<string, unknown>,
      criadoEm: new Date().toISOString(),
      tentativas: 0,
    })
  })
}

/**
 * Registra um movimento de estoque e atualiza o saldo local.
 *
 * O saldo é recalculado somando o livro inteiro daquele produto, e não somando
 * o delta do movimento novo. É mais caro e é o certo: o sync entrega movimentos
 * fora de ordem e às vezes repetidos, e um acumulador incremental erraria em
 * silêncio — um saldo errado só apareceria na contagem, semanas depois. É a
 * mesma regra do gatilho no Postgres, para que os dois cheguem ao mesmo número.
 */
export async function registrarMovimento(movimento: MovimentoEstoque): Promise<void> {
  await db.transaction('rw', db.stock_movements, db.products, db.outbox, async () => {
    await db.stock_movements.add(movimento)

    const doProduto = await db.stock_movements
      .where('product_id')
      .equals(movimento.product_id)
      .toArray()

    const somar = (unidade: 'kg' | 'un') =>
      doProduto
        .filter((m) => m.unidade === unidade)
        .reduce(
          (total, m) =>
            total + (m.tipo === 'entrada' || m.tipo === 'ajuste' ? m.quantidade : -m.quantidade),
          0,
        )

    const produto = await db.products.get(movimento.product_id)
    if (produto) {
      await db.products.put({
        ...produto,
        saldo_kg: somar('kg'),
        saldo_un: somar('un'),
        updated_at: new Date().toISOString(),
      })
    }

    await db.outbox.add({
      tabela: 'stock_movements',
      operacao: 'upsert',
      registroId: movimento.id,
      dados: movimento as unknown as Record<string, unknown>,
      criadoEm: new Date().toISOString(),
      tentativas: 0,
    })
  })
}

/**
 * Registra um evento de etiqueta e reflete o status derivado localmente.
 *
 * O servidor recalcula o status pelo gatilho, considerando todos os eventos —
 * inclusive os que outros aparelhos ainda vão sincronizar. Aqui aplicamos só a
 * visão local para a interface responder na hora; a versão do servidor
 * prevalece no próximo pull.
 */
export async function registrarEvento(
  evento: EventoEtiqueta,
  statusDerivado?: Etiqueta['status'],
): Promise<void> {
  await db.transaction('rw', db.label_events, db.labels, db.outbox, async () => {
    await db.label_events.add(evento)

    if (statusDerivado) {
      const etiqueta = await db.labels.get(evento.label_id)
      if (etiqueta) {
        await db.labels.put({
          ...etiqueta,
          status: statusDerivado,
          updated_at: new Date().toISOString(),
        })
      }
    }

    await db.outbox.add({
      tabela: 'label_events',
      operacao: 'upsert',
      registroId: evento.id,
      dados: evento as unknown as Record<string, unknown>,
      criadoEm: new Date().toISOString(),
      tentativas: 0,
    })
  })
}

/** Apaga tudo. Usado ao trocar de organização, para não misturar restaurantes. */
export async function limparBancoLocal(): Promise<void> {
  await db.delete()
  await db.open()
}
