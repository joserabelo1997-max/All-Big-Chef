import Dexie, { type EntityTable } from 'dexie'

import type {
  Configuracoes,
  Etiqueta,
  EventoEtiqueta,
  Fornecedor,
  MembroEquipe,
  ModeloSalvo,
  Pasta,
  Produto,
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
  tabela: TabelaSincronizada | 'label_events'
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
