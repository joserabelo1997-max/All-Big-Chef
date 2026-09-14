import Dexie, { type Table } from 'dexie'
import type {
  CompraItem,
  Espaco,
  Ficha,
  FichaComponente,
  Insumo,
  Menu,
  MenuItem,
  PeriodoCmv,
  ProducaoItem,
  Servico,
  Uuid,
} from '@/dominio/tipos'

/**
 * Espelho local de tudo. O app SEMPRE lê daqui, nunca da rede: cozinha tem wi-fi
 * ruim, e a tela do serviço não pode depender de um servidor responder. O Supabase
 * é a fonte da verdade de longo prazo; o Dexie é o que faz o app funcionar agora.
 */

export const TABELAS = [
  'espacos',
  'insumos',
  'fichas',
  'ficha_componentes',
  'menus',
  'menu_itens',
  'servicos',
  'producao_itens',
  'compra_itens',
  'periodos_cmv',
] as const

export type NomeTabela = (typeof TABELAS)[number]

/**
 * Fila de saída. Toda escrita grava no Dexie e deixa aqui um bilhete dizendo
 * "esta linha mudou". O envio é só um upsert do estado atual da linha — sem
 * histórico de operações, o que torna o reenvio seguro: mandar duas vezes dá no
 * mesmo resultado que mandar uma.
 */
export interface Pendente {
  id?: number
  tabela: NomeTabela
  registroId: Uuid
  enfileiradoEm: string
  tentativas: number
  ultimoErro?: string
}

/** Até onde já puxamos de cada tabela. É o carimbo do servidor, não o do celular. */
export interface Cursor {
  tabela: NomeTabela
  desde: string
}

const INICIO_DOS_TEMPOS = '1970-01-01T00:00:00.000Z'

class BancoLocal extends Dexie {
  espacos!: Table<Espaco, Uuid>
  insumos!: Table<Insumo, Uuid>
  fichas!: Table<Ficha, Uuid>
  ficha_componentes!: Table<FichaComponente, Uuid>
  menus!: Table<Menu, Uuid>
  menu_itens!: Table<MenuItem, Uuid>
  servicos!: Table<Servico, Uuid>
  producao_itens!: Table<ProducaoItem, Uuid>
  compra_itens!: Table<CompraItem, Uuid>
  periodos_cmv!: Table<PeriodoCmv, Uuid>
  outbox!: Table<Pendente, number>
  cursores!: Table<Cursor, NomeTabela>

  constructor() {
    super('all-big-chef')
    this.version(1).stores({
      espacos: 'id, atualizado_em, apagado_em',
      insumos: 'id, espaco_id, atualizado_em, apagado_em, nome',
      fichas: 'id, espaco_id, tipo, atualizado_em, apagado_em, nome',
      ficha_componentes: 'id, espaco_id, ficha_id, insumo_id, ficha_filha_id, atualizado_em',
      menus: 'id, espaco_id, atualizado_em, apagado_em',
      menu_itens: 'id, espaco_id, menu_id, ficha_id, atualizado_em',
      servicos: 'id, espaco_id, data, menu_id, atualizado_em, apagado_em',
      producao_itens: 'id, espaco_id, servico_id, ficha_id, atualizado_em',
      compra_itens: 'id, espaco_id, origem_id, insumo_id, atualizado_em',
      periodos_cmv: 'id, espaco_id, inicio, atualizado_em, apagado_em',
      outbox: '++id, tabela, registroId',
      cursores: 'tabela',
    })
  }
}

export const db = new BancoLocal()

/** O mínimo que o motor de sync precisa conhecer de qualquer linha. */
export interface Sincronizavel {
  id: Uuid
  dono_id: Uuid
  espaco_id?: Uuid | null
  atualizado_em: string
  apagado_em: string | null
}

/**
 * A mesma coisa, com os campos próprios de cada tabela abertos. Separar as duas
 * deixa `salvar` aceitar um `Insumo` de verdade: o índice aberto serve ao motor,
 * que trata linha como saco de campos, e atrapalharia quem passa tipo concreto.
 */
export type LinhaSincronizavel = Sincronizavel & Record<string, unknown>

export function tabela(nome: NomeTabela): Table<LinhaSincronizavel, Uuid> {
  return db.table(nome) as unknown as Table<LinhaSincronizavel, Uuid>
}

export async function lerCursor(nome: NomeTabela): Promise<string> {
  const cursor = await db.cursores.get(nome)
  return cursor?.desde ?? INICIO_DOS_TEMPOS
}

export async function gravarCursor(nome: NomeTabela, desde: string): Promise<void> {
  await db.cursores.put({ tabela: nome, desde })
}

/**
 * Grava local e enfileira. É o único caminho de escrita do app — nenhuma tela
 * fala direto com o Supabase, o que mantém tudo funcionando offline por padrão.
 */
export async function salvar<T extends Sincronizavel>(nome: NomeTabela, registro: T): Promise<T> {
  const comCarimbo = { ...registro, atualizado_em: new Date().toISOString() }
  await db.transaction('rw', tabela(nome), db.outbox, async () => {
    await tabela(nome).put(comCarimbo as LinhaSincronizavel)
    await enfileirar(nome, comCarimbo.id)
  })
  return comCarimbo
}

export async function salvarVarios<T extends Sincronizavel>(
  nome: NomeTabela,
  registros: T[],
): Promise<void> {
  if (registros.length === 0) return
  const agora = new Date().toISOString()
  const comCarimbo = registros.map((r) => ({ ...r, atualizado_em: agora }))
  await db.transaction('rw', tabela(nome), db.outbox, async () => {
    await tabela(nome).bulkPut(comCarimbo as LinhaSincronizavel[])
    for (const r of comCarimbo) await enfileirar(nome, r.id)
  })
}

/**
 * Apagar é marcar. A deleção precisa viajar como dado até os outros aparelhos —
 * senão o registro simplesmente ressuscita no próximo sync.
 */
export async function apagar(nome: NomeTabela, id: Uuid): Promise<void> {
  const atual = await tabela(nome).get(id)
  if (!atual) return
  await salvar(nome, { ...atual, apagado_em: new Date().toISOString() })
}

async function enfileirar(nome: NomeTabela, registroId: Uuid): Promise<void> {
  // Um bilhete por linha: se a mesma linha mudar cinco vezes offline, o que
  // precisa subir continua sendo só o estado final dela.
  const jaNaFila = await db.outbox.where('registroId').equals(registroId).first()
  if (jaNaFila) return
  await db.outbox.add({
    tabela: nome,
    registroId,
    enfileiradoEm: new Date().toISOString(),
    tentativas: 0,
  })
}

export function novoId(): Uuid {
  return crypto.randomUUID()
}

export function agora(): string {
  return new Date().toISOString()
}

/** Limpa o espelho local inteiro — usado ao sair da conta e ao importar backup. */
export async function limparLocal(): Promise<void> {
  await db.transaction(
    'rw',
    [...TABELAS.map((t) => tabela(t)), db.outbox, db.cursores],
    async () => {
      for (const nome of TABELAS) await tabela(nome).clear()
      await db.outbox.clear()
      await db.cursores.clear()
    },
  )
}
