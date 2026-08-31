import type { Etiqueta, EventoEtiqueta, Fornecedor, Pasta, Produto } from './types'
import { calcularValidade, formatarData } from './expiry'
import { novoCodigoCurto, novoId } from '../lib/ids'
import type { DadosEtiqueta } from '../printing/template'

/**
 * Criação da etiqueta e montagem dos dados impressos.
 *
 * Aqui é onde os *snapshots* são capturados. Não é desnormalização por
 * conveniência: é o que impede o histórico de mentir. Se amanhã o produto for
 * renomeado ou trocar de fornecedor, a etiqueta impressa hoje precisa continuar
 * dizendo o que está escrito no papel colado no pote — num relatório para a
 * vigilância sanitária, o registro tem que bater com o físico.
 */

export interface ContextoImpressao {
  orgId: string
  produto: Produto
  fornecedor?: Fornecedor | null
  pasta?: Pasta | null
  /** Quem está imprimindo. Alimenta a trilha de auditoria. */
  membroId?: string | null
  membroNome?: string | null
  lote?: string
  quantidade?: number | null
  /** Momento da abertura. Padrão: agora. */
  abertura?: Date
}

export interface EtiquetaCriada {
  etiqueta: Etiqueta
  evento: EventoEtiqueta
}

/**
 * Monta uma etiqueta nova, já com id e código curto.
 *
 * O id é gerado aqui, no cliente, e não pelo banco: o QR precisa conter o id no
 * momento da impressão, e numa cozinha sem Wi-Fi esperar o servidor devolver um
 * id significaria não imprimir.
 */
export function criarEtiqueta(ctx: ContextoImpressao): EtiquetaCriada {
  const abertura = ctx.abertura ?? new Date()
  const validade = calcularValidade(abertura, ctx.produto.shelf_life_days)
  const agora = new Date().toISOString()
  const id = novoId()

  const etiqueta: Etiqueta = {
    id,
    org_id: ctx.orgId,
    short_code: novoCodigoCurto(),
    product_id: ctx.produto.id,

    produto_snapshot: ctx.produto.nome,
    fornecedor_snapshot: ctx.fornecedor?.nome ?? null,
    pasta_snapshot: ctx.pasta?.nome ?? null,
    shelf_life_days_snapshot: ctx.produto.shelf_life_days,

    opened_at: abertura.toISOString(),
    expires_at: validade.toISOString(),
    lote: ctx.lote?.trim() || null,
    quantidade: ctx.quantidade ?? null,
    unidade: ctx.produto.unidade ?? null,

    printed_by_member_id: ctx.membroId ?? null,
    printed_by_snapshot: ctx.membroNome ?? null,
    printed_at: agora,

    status: 'ativa',
    created_at: agora,
    updated_at: agora,
  }

  const evento: EventoEtiqueta = {
    id: novoId(),
    org_id: ctx.orgId,
    label_id: id,
    tipo: 'impressa',
    member_id: ctx.membroId ?? null,
    member_snapshot: ctx.membroNome ?? null,
    ocorrido_em: agora,
    created_at: agora,
  }

  return { etiqueta, evento }
}

/**
 * URL que vai dentro do QR.
 *
 * É a URL completa do app, e não só o id, para que a câmera nativa do celular
 * já abra a etiqueta ao escanear — sem exigir que a pessoa abra o app antes.
 * Na cozinha, esse passo a menos é a diferença entre usar e não usar.
 */
export function urlDaEtiqueta(labelId: string): string {
  // Guarda contra contextos sem DOM (service worker, teste, geração em lote
  // fora da página). A URL do QR fica impressa em papel e é permanente, então
  // ela precisa ser montada sem depender de o ambiente estar completo.
  if (typeof window === 'undefined') {
    return `${BASE_PADRAO}#/l/${labelId}`
  }
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/l/${labelId}`
}

/** Endereço público do app, usado quando não há `window` disponível. */
const BASE_PADRAO = 'https://joserabelo1997-max.github.io/All-Big-Chef/'

/** Converte a etiqueta nos campos que o modelo interpola. */
export function dadosParaImpressao(etiqueta: Etiqueta): DadosEtiqueta {
  return {
    produto: etiqueta.produto_snapshot,
    fornecedor: etiqueta.fornecedor_snapshot ?? '—',
    pasta: etiqueta.pasta_snapshot ?? '',
    // Só a data, sem horário: é o que a cozinha confere de relance, e a hora
    // roubava espaço de um campo que precisa ser lido com o pote na mão. O
    // horário exato continua registrado em `opened_at` e aparece na tela da
    // etiqueta e nos relatórios, então a rastreabilidade não perde nada.
    manipulacao: formatarData(etiqueta.opened_at),
    abertura: formatarData(etiqueta.opened_at),
    validade: formatarData(etiqueta.expires_at),
    lote: etiqueta.lote ?? '—',
    responsavel: etiqueta.printed_by_snapshot ?? '—',
    codigo: etiqueta.short_code,
    quantidade: etiqueta.quantidade
      ? `${etiqueta.quantidade}${etiqueta.unidade ? ` ${etiqueta.unidade}` : ''}`
      : '',
    url: urlDaEtiqueta(etiqueta.id),
  }
}

/** Evento de baixa. Sempre acrescentado, nunca substituindo o anterior. */
export function criarEventoBaixa(
  etiqueta: Etiqueta,
  tipo: 'consumida' | 'descartada',
  opcoes: { motivo?: string; membroId?: string | null; membroNome?: string | null } = {},
): EventoEtiqueta {
  const agora = new Date().toISOString()
  return {
    id: novoId(),
    org_id: etiqueta.org_id,
    label_id: etiqueta.id,
    tipo,
    motivo: opcoes.motivo?.trim() || null,
    member_id: opcoes.membroId ?? null,
    member_snapshot: opcoes.membroNome ?? null,
    ocorrido_em: agora,
    created_at: agora,
  }
}
