import { TABELAS, db, salvarVarios, tabela } from './db'
import type { LinhaSincronizavel, NomeTabela } from './db'

/**
 * Backup em arquivo.
 *
 * Existe porque conta na nuvem também acaba: assinatura que vence, projeto
 * apagado por engano, senha perdida. Um .json guardado no celular ou no e-mail
 * é a saída que não depende de ninguém — e é o único jeito de levar os dados
 * para outro lugar se um dia este app não servir mais.
 */

export interface Backup {
  formato: 'all-big-chef'
  versao: 1
  gerado_em: string
  tabelas: Partial<Record<NomeTabela, LinhaSincronizavel[]>>
}

export async function gerarBackup(): Promise<Backup> {
  const conteudo: Backup['tabelas'] = {}
  for (const nome of TABELAS) {
    conteudo[nome] = await tabela(nome).toArray()
  }
  return {
    formato: 'all-big-chef',
    versao: 1,
    gerado_em: new Date().toISOString(),
    tabelas: conteudo,
  }
}

export function nomeDoArquivo(): string {
  const agora = new Date()
  const data = agora.toISOString().slice(0, 10)
  const hora = agora.toTimeString().slice(0, 5).replace(':', 'h')
  return `all-big-chef-${data}-${hora}.json`
}

export interface ResultadoImportacao {
  importados: number
  porTabela: Partial<Record<NomeTabela, number>>
}

export class ArquivoInvalido extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'ArquivoInvalido'
  }
}

/**
 * Importa por fusão, nunca por substituição: o que existe nos dois lados fica
 * com a versão mais recente, e o que só existe de um lado sobrevive. Apagar o
 * que está aqui para pôr o que veio do arquivo seria fácil de programar e capaz
 * de destruir o trabalho de um dia inteiro por um clique errado.
 */
export async function importarBackup(texto: string): Promise<ResultadoImportacao> {
  let dados: unknown
  try {
    dados = JSON.parse(texto)
  } catch {
    throw new ArquivoInvalido('Este arquivo não é um JSON válido.')
  }

  if (
    typeof dados !== 'object' ||
    dados === null ||
    (dados as Backup).formato !== 'all-big-chef'
  ) {
    throw new ArquivoInvalido('Este arquivo não é um backup do All Big Chef.')
  }

  const backup = dados as Backup
  const resultado: ResultadoImportacao = { importados: 0, porTabela: {} }

  for (const nome of TABELAS) {
    const vindas = backup.tabelas[nome]
    if (!Array.isArray(vindas) || vindas.length === 0) continue

    const atuais = new Map(
      (await tabela(nome).toArray()).map((linha) => [linha.id, linha]),
    )

    const aplicar = vindas.filter((linha) => {
      if (!linha || typeof linha.id !== 'string') return false
      const atual = atuais.get(linha.id)
      // Mais nova vence; empate mantém o que já está aqui.
      return !atual || linha.atualizado_em > atual.atualizado_em
    })

    if (aplicar.length > 0) {
      // Passa pelo `salvarVarios` para que o importado também suba para a nuvem.
      await salvarVarios(nome, aplicar)
      resultado.porTabela[nome] = aplicar.length
      resultado.importados += aplicar.length
    }
  }

  return resultado
}

/** Quantas linhas existem de cada coisa — usado no diagnóstico das configurações. */
export async function contarTudo(): Promise<Record<NomeTabela, number>> {
  const contagem = {} as Record<NomeTabela, number>
  for (const nome of TABELAS) {
    const linhas = await tabela(nome).toArray()
    contagem[nome] = linhas.filter((l) => !l.apagado_em).length
  }
  return contagem
}

export async function pendenciasDeSync(): Promise<number> {
  return db.outbox.count()
}
