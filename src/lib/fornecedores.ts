import type { Fornecedor } from '../domain/types'

import { db, salvarESincronizar } from './db'
import { novoId } from './ids'

/**
 * Encontrar-ou-criar fornecedor pelo nome.
 *
 * Existe para que cadastrar um produto não obrigue a sair da tela, cadastrar o
 * fornecedor em outro lugar e voltar. Quem está com a caixa na mão digita o
 * nome que está na nota e segue.
 */

/**
 * Nome reduzido à sua forma comparável: sem acento, sem caixa, sem espaço
 * sobrando.
 *
 * É o que impede "Laticínios São João", "laticinios sao joao" e "Laticínios
 * São  João" de virarem três fornecedores diferentes. Numa cozinha onde cada
 * pessoa digita de um jeito, sem isso a lista vira lixo em duas semanas — e
 * cada duplicata quebra o agrupamento do pedido por fornecedor.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    // Faixa dos acentos combinantes, que o NFD separou da letra base.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** O fornecedor já cadastrado com este nome, se houver. */
export function acharPorNome(
  fornecedores: Fornecedor[],
  nome: string,
): Fornecedor | undefined {
  const alvo = normalizarNome(nome)
  if (!alvo) return undefined
  return fornecedores.find((f) => normalizarNome(f.nome) === alvo)
}

/**
 * Devolve o id do fornecedor com este nome, criando-o se ainda não existir.
 *
 * Nome vazio devolve `null` — "não informar" continua sendo uma resposta
 * válida, e criar um fornecedor sem nome só sujaria o cadastro.
 *
 * Procura inclusive entre os arquivados: reaproveitar o registro antigo mantém
 * as etiquetas já impressas apontando para o mesmo fornecedor, em vez de
 * espalhar o histórico entre um "São João" morto e um "São João" novo.
 */
export async function resolverFornecedor(
  orgId: string,
  nome: string,
): Promise<string | null> {
  const limpo = nome.trim()
  if (!limpo) return null

  const existentes = await db.suppliers.where('org_id').equals(orgId).toArray()
  const achado = acharPorNome(existentes, limpo)

  if (achado) {
    // Fornecedor arquivado que volta a ser usado é reativado, e não duplicado.
    if (!achado.ativo || achado.deleted_at) {
      await salvarESincronizar('suppliers', {
        ...achado,
        ativo: true,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
    }
    return achado.id
  }

  const agora = new Date().toISOString()
  const criado: Fornecedor = {
    id: novoId(),
    org_id: orgId,
    nome: limpo,
    ativo: true,
    created_at: agora,
    updated_at: agora,
  }
  await salvarESincronizar('suppliers', criado)
  return criado.id
}
