/**
 * Tipos do domínio, espelhando as tabelas do Supabase.
 *
 * Os nomes de campo seguem o schema SQL (snake_case) de propósito: o motor de
 * sync envia e recebe esses objetos praticamente crus, e traduzir os nomes em
 * cada direção só criaria uma camada a mais para errar.
 */

/** Campos que toda entidade sincronizável carrega. */
export interface Sincronizavel {
  id: string
  org_id: string
  created_at: string
  updated_at: string
  /**
   * Exclusão lógica. DELETE físico não se propaga para um aparelho que estava
   * offline — ele reinseriria a linha na próxima sincronização.
   */
  deleted_at?: string | null
}

export interface Pasta extends Sincronizavel {
  parent_id?: string | null
  nome: string
  cor: string
  icone?: string | null
  ordem: number
}

export interface Fornecedor extends Sincronizavel {
  nome: string
  cnpj?: string | null
  contato?: string | null
  observacoes?: string | null
  ativo: boolean
}

export interface Produto extends Sincronizavel {
  folder_id?: string | null
  supplier_id?: string | null
  nome: string
  /** Dias de validade após a abertura. */
  shelf_life_days: number
  unidade?: string | null
  sku?: string | null
  observacoes?: string | null
  ativo: boolean
}

export interface MembroEquipe extends Sincronizavel {
  nome: string
  cargo?: string | null
  pin_hash?: string | null
  ativo: boolean
}

export interface ModeloSalvo extends Sincronizavel {
  nome: string
  width_mm: number
  height_mm: number
  elements: unknown
  is_default: boolean
}

export type StatusEtiqueta = 'ativa' | 'consumida' | 'descartada'

export interface Etiqueta extends Sincronizavel {
  short_code: string
  product_id?: string | null
  template_id?: string | null

  /**
   * Cópias do estado do cadastro no momento da impressão.
   *
   * Não são desnormalização por conveniência: são o que impede o histórico de
   * mentir. Renomear um produto amanhã não pode reescrever o que está impresso
   * no papel colado no pote hoje.
   */
  produto_snapshot: string
  fornecedor_snapshot?: string | null
  pasta_snapshot?: string | null
  shelf_life_days_snapshot?: number | null

  opened_at: string
  expires_at: string
  lote?: string | null
  quantidade?: number | null
  unidade?: string | null

  printed_by_member_id?: string | null
  printed_by_snapshot?: string | null
  printed_at: string

  status: StatusEtiqueta
}

export type TipoEvento =
  | 'impressa'
  | 'reimpressa'
  | 'consumida'
  | 'descartada'
  | 'vencida_auto'

/** Trilha de auditoria. Nunca editada, nunca apagada — só acrescentada. */
export interface EventoEtiqueta {
  id: string
  org_id: string
  label_id: string
  tipo: TipoEvento
  motivo?: string | null
  member_id?: string | null
  member_snapshot?: string | null
  ocorrido_em: string
  created_at: string
}

export interface Configuracoes {
  org_id: string
  alerta_dias_antes: number
  alerta_horario: string
  default_template_id?: string | null
  printer_profile?: unknown
  created_at: string
  updated_at: string
}

/** Tabelas que participam do sync bidirecional. */
export const TABELAS_SINCRONIZADAS = [
  'folders',
  'suppliers',
  'products',
  'team_members',
  'label_templates',
  'labels',
] as const

export type TabelaSincronizada = (typeof TABELAS_SINCRONIZADAS)[number]
