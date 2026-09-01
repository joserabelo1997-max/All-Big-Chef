import {
  TABELAS_APPEND_ONLY,
  TABELAS_SINCRONIZADAS,
  type TabelaAppendOnly,
  type TabelaSincronizada,
} from '../../domain/types'
import { db, type OperacaoPendente } from '../db'
import { supabase } from '../supabase'

/**
 * Motor de sincronização (padrão outbox).
 *
 * Fluxo: a interface escreve no Dexie e enfileira na outbox; o motor drena a
 * fila para o Supabase e depois puxa o que mudou desde o último cursor.
 *
 * ## Como os conflitos são resolvidos
 *
 * **Cadastros** (produtos, pastas, fornecedores) usam última escrita vence, por
 * `updated_at`. É adequado porque duas pessoas raramente editam o mesmo produto
 * ao mesmo tempo, e quando editam, a intenção mais recente costuma ser a certa.
 *
 * **Etiquetas** são a exceção deliberada. Dar baixa nunca é um UPDATE de
 * status: é um evento acrescentado em `label_events`, e o status vigente é
 * derivado desses eventos pelo gatilho no banco. Assim, se dois tablets
 * offline agirem sobre a mesma etiqueta, os dois registros sobrevivem — com
 * última escrita vence, um deles desapareceria em silêncio, e um sistema de
 * rastreabilidade não pode perder o registro de quem fez o quê.
 */

export type EstadoSync = 'offline' | 'ocioso' | 'sincronizando' | 'erro' | 'desligado'

export interface StatusSync {
  estado: EstadoSync
  pendentes: number
  ultimaSincronizacao: string | null
  erro: string | null
}

type Ouvinte = (status: StatusSync) => void

/** Máximo de tentativas antes de parar de insistir numa operação. */
const MAX_TENTATIVAS = 6

/** Registros por página no pull. Lotes menores sobrevivem a rede instável. */
const TAMANHO_PAGINA = 500

class MotorSync {
  private ouvintes = new Set<Ouvinte>()
  private rodando = false
  private timer: ReturnType<typeof setInterval> | null = null

  private status: StatusSync = {
    estado: 'desligado',
    pendentes: 0,
    ultimaSincronizacao: null,
    erro: null,
  }

  assinar(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte)
    ouvinte(this.status)
    return () => this.ouvintes.delete(ouvinte)
  }

  private emitir(mudanca: Partial<StatusSync>) {
    this.status = { ...this.status, ...mudanca }
    for (const ouvinte of this.ouvintes) ouvinte(this.status)
  }

  /** Começa a sincronizar periodicamente e a reagir ao retorno da conexão. */
  iniciar(orgId: string): void {
    if (!supabase) {
      this.emitir({ estado: 'desligado' })
      return
    }

    this.parar()

    // Voltar a ter rede é o gatilho mais valioso: é exatamente o momento em que
    // existe uma fila acumulada esperando para subir.
    window.addEventListener('online', this.aoVoltarOnline)
    window.addEventListener('offline', this.aoFicarOffline)

    this.timer = setInterval(() => void this.sincronizar(orgId), 30_000)
    void this.sincronizar(orgId)
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    window.removeEventListener('online', this.aoVoltarOnline)
    window.removeEventListener('offline', this.aoFicarOffline)
  }

  private aoVoltarOnline = () => this.emitir({ estado: 'ocioso', erro: null })
  private aoFicarOffline = () => this.emitir({ estado: 'offline' })

  async sincronizar(orgId: string): Promise<void> {
    if (!supabase || this.rodando) return

    if (!navigator.onLine) {
      this.emitir({ estado: 'offline', pendentes: await db.outbox.count() })
      return
    }

    this.rodando = true
    this.emitir({ estado: 'sincronizando', erro: null })

    try {
      await this.enviarPendentes()
      await this.baixarMudancas(orgId)

      this.emitir({
        estado: 'ocioso',
        pendentes: await db.outbox.count(),
        ultimaSincronizacao: new Date().toISOString(),
        erro: null,
      })
    } catch (e) {
      this.emitir({
        estado: 'erro',
        pendentes: await db.outbox.count(),
        erro: e instanceof Error ? e.message : 'Falha ao sincronizar.',
      })
    } finally {
      this.rodando = false
    }
  }

  /**
   * Envia a fila na ordem em que foi criada.
   *
   * A ordem importa: um evento de baixa não pode chegar antes da etiqueta que
   * ele referencia, ou a chave estrangeira rejeita. Por isso paramos na
   * primeira falha em vez de pular para a próxima operação.
   */
  private async enviarPendentes(): Promise<void> {
    if (!supabase) return

    const fila = await db.outbox.orderBy('seq').toArray()

    for (const op of fila) {
      if (op.tentativas >= MAX_TENTATIVAS) continue

      // Os livros-razão são imutáveis no banco: a migration revoga UPDATE e
      // DELETE deles. Um upsert comum vira `on conflict do update` e o
      // Postgres o recusa com "permission denied" — nenhum movimento nem
      // evento de etiqueta subiria, jamais. `ignoreDuplicates` gera
      // `on conflict do nothing`, que só precisa de INSERT e continua
      // idempotente: reenviar a mesma linha não erra nem duplica, que é o
      // que a fila faz ao repetir uma tentativa.
      const soInserir = (TABELAS_APPEND_ONLY as readonly string[]).includes(op.tabela)

      const { error } = await supabase
        .from(op.tabela)
        .upsert(op.dados, { onConflict: 'id', ignoreDuplicates: soInserir })

      if (error) {
        await this.registrarFalha(op, error.message)
        // Interrompe para preservar a ordem das operações seguintes.
        throw new Error(`Falha ao enviar ${op.tabela}: ${error.message}`)
      }

      if (op.seq !== undefined) await db.outbox.delete(op.seq)
    }
  }

  private async registrarFalha(op: OperacaoPendente, mensagem: string): Promise<void> {
    if (op.seq === undefined) return
    await db.outbox.update(op.seq, {
      tentativas: op.tentativas + 1,
      ultimoErro: mensagem,
    })
  }

  /**
   * Puxa o que mudou desde o último cursor, tabela por tabela.
   *
   * O cursor é o maior `updated_at` já visto. Usamos `gt` e não `gte` para não
   * rebaixar sempre o mesmo registro, e paginamos porque a primeira
   * sincronização de uma cozinha em operação traz meses de etiquetas.
   */
  private async baixarMudancas(orgId: string): Promise<void> {
    if (!supabase) return

    for (const tabela of TABELAS_SINCRONIZADAS) {
      await this.baixarTabela(tabela, orgId)
    }
    // Os livros-razão vêm depois dos cadastros: um evento ou movimento aponta
    // para a etiqueta ou o produto, e chegar antes deles quebraria a leitura.
    for (const tabela of TABELAS_APPEND_ONLY) {
      await this.baixarAppendOnly(tabela, orgId)
    }
  }

  private async baixarTabela(tabela: TabelaSincronizada, orgId: string): Promise<void> {
    if (!supabase) return

    const marca = await db.marcas.get(tabela)
    let cursor = marca?.ate ?? '1970-01-01T00:00:00Z'

    for (;;) {
      const { data, error } = await supabase
        .from(tabela)
        .select('*')
        .eq('org_id', orgId)
        .gt('updated_at', cursor)
        .order('updated_at', { ascending: true })
        .limit(TAMANHO_PAGINA)

      if (error) throw new Error(`Falha ao baixar ${tabela}: ${error.message}`)
      if (!data || data.length === 0) break

      // `bulkPut` sobrescreve a versão local: para cadastros, o servidor é
      // quem tem a versão consolidada de todos os aparelhos.
      await db.table(tabela).bulkPut(data)

      cursor = (data[data.length - 1] as { updated_at: string }).updated_at
      await db.marcas.put({ tabela, ate: cursor })

      if (data.length < TAMANHO_PAGINA) break
    }
  }

  /**
   * Baixa um livro-razão: eventos de etiqueta, movimentos de estoque.
   *
   * Pagina por `created_at`, e não por `updated_at`, porque essas linhas nunca
   * são editadas — não existe `updated_at` nelas. O `bulkPut` é idempotente
   * pela chave primária, então reenviar a mesma linha não duplica nada.
   *
   * Recebe a tabela por parâmetro em vez de citá-la: é o que garante que toda
   * tabela de `TABELAS_APPEND_ONLY` desça, e não só a que alguém lembrou de
   * escrever aqui.
   */
  private async baixarAppendOnly(tabela: TabelaAppendOnly, orgId: string): Promise<void> {
    if (!supabase) return

    const marca = await db.marcas.get(tabela)
    let cursor = marca?.ate ?? '1970-01-01T00:00:00Z'

    for (;;) {
      const { data, error } = await supabase
        .from(tabela)
        .select('*')
        .eq('org_id', orgId)
        .gt('created_at', cursor)
        .order('created_at', { ascending: true })
        .limit(TAMANHO_PAGINA)

      if (error) throw new Error(`Falha ao baixar ${tabela}: ${error.message}`)
      if (!data || data.length === 0) break

      await db.table(tabela).bulkPut(data)

      cursor = (data[data.length - 1] as { created_at: string }).created_at
      await db.marcas.put({ tabela, ate: cursor })

      if (data.length < TAMANHO_PAGINA) break
    }
  }
}

export const motorSync = new MotorSync()
