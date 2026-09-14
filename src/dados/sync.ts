import { TABELAS, db, gravarCursor, lerCursor, tabela } from './db'
import type { LinhaSincronizavel, NomeTabela } from './db'
import { supabase } from './supabase'

/**
 * Motor de sincronização.
 *
 * Genérico sobre a lista de tabelas de propósito: todas têm o mesmo formato
 * (id, dono, carimbo, soft delete), então uma função só dá conta das dez. Quando
 * entrar a décima primeira, basta acrescentar o nome na lista.
 *
 * Ordem importa: empurra primeiro, puxa depois. Assim o que você fez offline já
 * está no servidor quando a resposta dele volta, e o servidor não sobrescreve o
 * seu trabalho com uma versão anterior.
 *
 * Conflito resolve por último-que-escreve-vence, comparando o carimbo. Para um
 * app de um usuário só em dois ou três aparelhos, isso basta — e qualquer coisa
 * mais esperta custaria complexidade que ninguém aqui vai pagar.
 */

const PAGINA = 500
/**
 * O cursor recua um milissegundo antes de ser gravado. Duas linhas salvas na
 * mesma transação podem sair com carimbos idênticos; sem essa folga, a segunda
 * ficaria para trás do cursor e nunca mais desceria. Reler uma linha é inofensivo,
 * perder uma não.
 */
const FOLGA_MS = 1

export interface ResultadoSync {
  enviados: number
  recebidos: number
  erros: string[]
}

let emAndamento: Promise<ResultadoSync> | null = null

/** Uma sincronização por vez; chamadas concorrentes pegam carona na que já roda. */
export function sincronizar(): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento
  emAndamento = executar().finally(() => {
    emAndamento = null
  })
  return emAndamento
}

async function executar(): Promise<ResultadoSync> {
  const resultado: ResultadoSync = { enviados: 0, recebidos: 0, erros: [] }

  if (!supabase) {
    resultado.erros.push('O app não está ligado a um projeto Supabase.')
    return resultado
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    resultado.erros.push('offline')
    return resultado
  }

  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    resultado.erros.push('Sem sessão aberta.')
    return resultado
  }

  resultado.enviados = await empurrar(resultado.erros)
  resultado.recebidos = await puxar(resultado.erros)
  return resultado
}

async function empurrar(erros: string[]): Promise<number> {
  const cliente = supabase
  if (!cliente) return 0

  const pendentes = await db.outbox.orderBy('id').toArray()
  let enviados = 0

  for (const pendente of pendentes) {
    const linha = await tabela(pendente.tabela).get(pendente.registroId)

    if (!linha) {
      // A linha sumiu do espelho local sem ter subido. Nada a enviar.
      await db.outbox.delete(pendente.id!)
      continue
    }

    const { data, error } = await cliente
      .from(pendente.tabela)
      .upsert(linha, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      await db.outbox.update(pendente.id!, {
        tentativas: pendente.tentativas + 1,
        ultimoErro: error.message,
      })
      erros.push(`${pendente.tabela}: ${error.message}`)
      continue
    }

    // Guarda de volta a versão do servidor, que traz o carimbo oficial. Escrita
    // direta na tabela, sem passar pelo `salvar`, para não reenfileirar o que
    // acabou de subir.
    if (data) await tabela(pendente.tabela).put(data as LinhaSincronizavel)
    await db.outbox.delete(pendente.id!)
    enviados += 1
  }

  return enviados
}

async function puxar(erros: string[]): Promise<number> {
  const cliente = supabase
  if (!cliente) return 0

  let recebidos = 0

  for (const nome of TABELAS) {
    try {
      recebidos += await puxarTabela(nome)
    } catch (e) {
      erros.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return recebidos
}

async function puxarTabela(nome: NomeTabela): Promise<number> {
  const cliente = supabase
  if (!cliente) return 0

  let desde = await lerCursor(nome)
  let recebidos = 0

  for (;;) {
    const { data, error } = await cliente
      .from(nome)
      .select('*')
      .gt('atualizado_em', desde)
      .order('atualizado_em', { ascending: true })
      .limit(PAGINA)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    const linhas = data as LinhaSincronizavel[]

    // O que ainda está na fila de saída é mais novo do que qualquer coisa que o
    // servidor devolva: foi escrito aqui e ainda não subiu. Não pode ser pisado.
    const naFila = new Set(
      (await db.outbox.where('tabela').equals(nome).toArray()).map((p) => p.registroId),
    )
    const aplicaveis = linhas.filter((l) => !naFila.has(l.id))

    if (aplicaveis.length > 0) await tabela(nome).bulkPut(aplicaveis)
    recebidos += aplicaveis.length

    const ultimo = linhas[linhas.length - 1]!.atualizado_em
    const proximo = new Date(new Date(ultimo).getTime() - FOLGA_MS).toISOString()

    // Sem avanço no cursor a próxima página seria a mesma: encerra para não girar.
    if (proximo <= desde) {
      desde = ultimo
      await gravarCursor(nome, desde)
      break
    }

    desde = proximo
    await gravarCursor(nome, desde)

    if (linhas.length < PAGINA) break
  }

  return recebidos
}

export async function quantidadePendente(): Promise<number> {
  return db.outbox.count()
}
