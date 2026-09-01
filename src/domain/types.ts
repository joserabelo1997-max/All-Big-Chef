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
  /** Só dígitos, com DDI e DDD — é o que o link do WhatsApp exige. */
  telefone?: string | null
  observacoes?: string | null
  ativo: boolean
}

/** Como o produto é contado no estoque. */
export type UnidadeEstoque = 'kg' | 'un' | 'ambos'

/** Unidade de um movimento. `ambos` só existe no cadastro, nunca num lançamento. */
export type UnidadeMovimento = 'kg' | 'un'

export interface Produto extends Sincronizavel {
  folder_id?: string | null
  supplier_id?: string | null
  nome: string
  /** Dias de validade após a abertura. */
  shelf_life_days: number
  unidade?: string | null
  sku?: string | null
  /**
   * Código de barras da embalagem do fabricante (EAN-13, EAN-8, UPC…).
   *
   * Guardado como veio do leitor, só sem espaço. É o que deixa bipar um saco de
   * farinha na prateleira e cair direto no produto — sem procurar na lista com
   * a mão ocupada. Não é obrigatório: produto de feira e pré-preparo da casa
   * não têm código nenhum.
   */
  codigo_barras?: string | null
  observacoes?: string | null
  ativo: boolean

  /**
   * Facetas. O catálogo é único: "Creme de leite" é cadastrado uma vez e pode
   * participar das duas coisas. Papel toalha entra só no estoque; pré-preparo
   * da casa, só em etiqueta.
   */
  gera_etiqueta: boolean
  controla_estoque: boolean
  unidade_estoque: UnidadeEstoque
  estoque_minimo_kg: number
  estoque_minimo_un: number

  /** Lote impresso na embalagem do fabricante, usado como padrão ao imprimir. */
  lote_atual?: string | null

  /**
   * Cache do saldo, mantido por gatilho no banco. A verdade está em
   * `stock_movements` — isto existe só para listar rápido.
   */
  saldo_kg: number
  saldo_un: number
}

/**
 * Valores padrão das facetas de um produto novo.
 *
 * Existe para que acrescentar um campo ao produto não obrigue a repetir o mesmo
 * padrão em cada tela e em cada teste — e para que o padrão seja UM só, em vez
 * de divergir entre os pontos de criação.
 */
export const PADROES_PRODUTO = {
  gera_etiqueta: true,
  // Estoque é opt-in: quem só quer etiquetar não deve herdar um módulo inteiro
  // que não pediu, com saldos zerados poluindo as telas.
  controla_estoque: false,
  unidade_estoque: 'un' as UnidadeEstoque,
  estoque_minimo_kg: 0,
  estoque_minimo_un: 0,
  saldo_kg: 0,
  saldo_un: 0,
} satisfies Partial<Produto>

export type TipoMovimento = 'entrada' | 'saida' | 'ajuste' | 'perda'

/**
 * Movimento de estoque. Append-only, como `EventoEtiqueta`.
 *
 * `quantidade` é sempre POSITIVA; o sinal vem do tipo. Guardar negativo
 * convidaria a uma "entrada de -3" que ninguém sabe interpretar depois.
 */
export interface MovimentoEstoque {
  id: string
  org_id: string
  product_id: string
  tipo: TipoMovimento
  quantidade: number
  unidade: UnidadeMovimento
  /** Lote e validade da entrada — alimentam a ordem de uso. */
  lote?: string | null
  validade?: string | null
  /** Preço por unidade, só em entradas. Alimenta o valor médio ponderado. */
  valor_unitario?: number | null
  supplier_id?: string | null
  member_id?: string | null
  member_snapshot?: string | null
  motivo?: string | null
  ocorrido_em: string
  created_at: string
}

export type StatusRequisicao = 'pendente' | 'aprovada' | 'recusada'

export interface RequisicaoEstoque extends Sincronizavel {
  product_id: string
  quantidade: number
  unidade: UnidadeMovimento
  motivo?: string | null
  solicitante_id?: string | null
  solicitante_snapshot?: string | null
  status: StatusRequisicao
  decidido_por_id?: string | null
  decidido_por_snapshot?: string | null
  decidido_em?: string | null
  /** Movimento gerado ao aprovar. Impede que aprovar duas vezes tire em dobro. */
  movimento_id?: string | null
}

export interface ContagemEstoque extends Sincronizavel {
  nome?: string | null
  status: 'aberta' | 'finalizada'
  member_id?: string | null
  member_snapshot?: string | null
  iniciada_em: string
  finalizada_em?: string | null
}

export interface ItemContagem extends Sincronizavel {
  count_id: string
  product_id: string
  unidade: UnidadeMovimento
  /** O que o sistema achava que existia no momento da contagem. */
  quantidade_sistema: number
  quantidade_contada?: number | null
}

/**
 * Etiqueta de inventário — deliberadamente SEM validade.
 *
 * Tipo separado de `Etiqueta` para que o compilador impeça a confusão: nada que
 * espera uma etiqueta de validade aceita uma destas, e vice-versa. O QR aponta
 * para `#/i/<uuid>`, não para `#/l/<uuid>`.
 */
export interface EtiquetaInventario extends Sincronizavel {
  product_id?: string | null
  produto_snapshot: string
  short_code: string
  quantidade?: number | null
  unidade?: UnidadeMovimento | null
  lote?: string | null
  status: 'em_estoque' | 'consumida'
  printed_by_id?: string | null
  printed_by_snapshot?: string | null
  printed_at: string
}

export interface MembroEquipe extends Sincronizavel {
  nome: string
  cargo?: string | null
  pin_hash?: string | null
  ativo: boolean
  /** Quem pode liberar uma requisição de retirada do estoque. */
  pode_aprovar: boolean
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
  /** Dias em que a casa fecha: 0 = domingo … 6 = sábado. */
  dias_fechados: number[]
  /** Modelo da mensagem enviada ao fornecedor pelo WhatsApp. */
  mensagem_pedido?: string | null
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
  'stock_requests',
  'stock_counts',
  'stock_count_items',
  'inventory_tags',
] as const

export type TabelaSincronizada = (typeof TABELAS_SINCRONIZADAS)[number]

/**
 * Tabelas append-only: só recebem linhas novas, nunca edição nem exclusão.
 *
 * Ficam fora de `TABELAS_SINCRONIZADAS` porque descem por `created_at` e não
 * por `updated_at` — elas não têm `updated_at`, já que nada nelas muda depois
 * de gravado.
 *
 * Esta lista existe para que o motor de sync não tenha nome de tabela escrito à
 * mão. Foi assim que `stock_movements` ficou subindo para o servidor sem nunca
 * ser baixado de volta: a subida é genérica, mas a descida citava
 * `label_events` diretamente. Com a lista, acrescentar uma tabela ao livro-razão
 * obriga a incluí-la aqui — e o compilador cobra, porque a fila de envio em
 * `lib/db.ts` deriva o tipo dela.
 */
export const TABELAS_APPEND_ONLY = ['label_events', 'stock_movements'] as const

export type TabelaAppendOnly = (typeof TABELAS_APPEND_ONLY)[number]
