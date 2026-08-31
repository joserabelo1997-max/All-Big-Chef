import { novoCodigoCurto, novoId } from '../lib/ids'
import type { DadosEtiqueta } from '../printing/template'

import type { EtiquetaInventario, Produto, UnidadeMovimento } from './types'

/**
 * Etiqueta de inventário: contagem, sem validade.
 *
 * Módulo separado de `labelData.ts` de propósito. As duas etiquetas não
 * compartilham criação, tabela, rota nem tela — e é essa separação que garante
 * o "sem conflito" pedido: nada aqui tem data de validade para vazar por
 * engano para uma etiqueta de validade, e nada de lá cai numa contagem.
 *
 * Serve para o que a casa produziu e guardou: cada unidade ganha um QR único, e
 * conferir o freezer vira passar o leitor pote a pote.
 */

export interface ContextoInventario {
  orgId: string
  produto: Produto
  quantidade?: number | null
  unidade?: UnidadeMovimento | null
  lote?: string
  membroId?: string | null
  membroNome?: string | null
}

/**
 * Cria uma etiqueta de inventário.
 *
 * Como nas de validade, o id vem do cliente: o QR precisa conter o id no
 * momento da impressão, e numa cozinha sem Wi-Fi esperar o servidor significaria
 * não imprimir.
 */
export function criarEtiquetaInventario(ctx: ContextoInventario): EtiquetaInventario {
  const agora = new Date().toISOString()

  return {
    id: novoId(),
    org_id: ctx.orgId,
    product_id: ctx.produto.id,
    // Snapshot pelo mesmo motivo da etiqueta de validade: renomear o produto
    // amanhã não pode reescrever o que está impresso no papel de hoje.
    produto_snapshot: ctx.produto.nome,
    short_code: novoCodigoCurto(),
    quantidade: ctx.quantidade ?? null,
    unidade: ctx.unidade ?? null,
    lote: ctx.lote?.trim() || null,
    status: 'em_estoque',
    printed_by_id: ctx.membroId ?? null,
    printed_by_snapshot: ctx.membroNome ?? null,
    printed_at: agora,
    created_at: agora,
    updated_at: agora,
  }
}

/** Endereço público do app, usado quando não há `window` disponível. */
const BASE_PADRAO = 'https://joserabelo1997-max.github.io/All-Big-Chef/'

/**
 * URL que vai dentro do QR de inventário.
 *
 * `#/i/` e não `#/l/`: o caminho é o que separa as duas etiquetas de forma
 * estrutural, sem depender de disciplina de uso.
 */
export function urlDaEtiquetaInventario(tagId: string): string {
  if (typeof window === 'undefined') {
    return `${BASE_PADRAO}#/i/${tagId}`
  }
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/i/${tagId}`
}

/**
 * Converte a etiqueta de inventário nos campos que o modelo interpola.
 *
 * Os campos de data saem VAZIOS, e não com a data de hoje. Se alguém
 * acrescentar `{{validade}}` a este modelo pelo editor visual, o papel sai sem
 * data — nunca com uma data inventada, que numa fiscalização seria pior que a
 * ausência dela.
 */
export function dadosParaImpressaoInventario(etiqueta: EtiquetaInventario): DadosEtiqueta {
  return {
    produto: etiqueta.produto_snapshot,
    fornecedor: '',
    pasta: '',
    manipulacao: '',
    abertura: '',
    validade: '',
    lote: etiqueta.lote ?? '—',
    responsavel: etiqueta.printed_by_snapshot ?? '—',
    codigo: etiqueta.short_code,
    quantidade:
      etiqueta.quantidade != null
        ? `${formatar(etiqueta.quantidade)}${etiqueta.unidade ? ` ${etiqueta.unidade}` : ''}`
        : '1',
    url: urlDaEtiquetaInventario(etiqueta.id),
  }
}

function formatar(valor: number): string {
  return Number.isInteger(valor)
    ? String(valor)
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
