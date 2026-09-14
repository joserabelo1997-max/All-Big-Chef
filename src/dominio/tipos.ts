// Tipos do domínio. Espelham 1:1 as tabelas do Postgres (snake_case) para que o
// motor de sync possa tratar qualquer tabela do mesmo jeito, sem tradução.

export type Uuid = string
/** Data civil, 'AAAA-MM-DD'. É o dia do serviço, não um instante. */
export type IsoData = string
/** Instante completo em ISO 8601 com fuso. */
export type IsoInstante = string

/** Unidades que a cozinha realmente usa. Massa, volume e contagem. */
export type Unidade = 'g' | 'kg' | 'ml' | 'L' | 'un'

export const UNIDADES: readonly Unidade[] = ['g', 'kg', 'ml', 'L', 'un'] as const

export const NOME_UNIDADE: Record<Unidade, string> = {
  g: 'grama',
  kg: 'quilo',
  ml: 'mililitro',
  L: 'litro',
  un: 'unidade',
}

/**
 * Campos que toda linha carrega. `apagado_em` é o soft delete: apagar no celular
 * precisa apagar no computador, e para isso a deleção tem que viajar como dado.
 * `espaco_id` nulo significa biblioteca pessoal, visível de todos os restaurantes.
 */
export interface RegistroBase {
  id: Uuid
  dono_id: Uuid
  espaco_id: Uuid | null
  atualizado_em: IsoInstante
  apagado_em: IsoInstante | null
}

/** Tipos de casa com as faixas de CMV que o mercado considera saudáveis. */
export type TipoCasa =
  | 'a_la_carte'
  | 'pizzaria'
  | 'hamburgueria'
  | 'fast_food'
  | 'japones'
  | 'bistro'
  | 'padaria'
  | 'outro'

export interface Espaco {
  id: Uuid
  dono_id: Uuid
  nome: string
  tipo_casa: TipoCasa
  /** Fração, não percentual: 0.32 significa 32%. */
  cmv_alvo: number
  atualizado_em: IsoInstante
  apagado_em: IsoInstante | null
}

export interface Insumo extends RegistroBase {
  nome: string
  categoria: string
  fornecedor: string
  /** Como você compra: 1 kg, 5 L, 30 un. */
  quantidade_compra: number
  unidade_compra: Unidade
  /** Quanto custa aquela quantidade de compra, em reais. */
  preco_compra: number
  /** Como você usa na receita: g, ml, un. */
  unidade_uso: Unidade
  /**
   * Fator de correção = peso bruto ÷ peso líquido. Cebola com casca tem FC ~1,2:
   * para 100 g limpos você compra 120 g. 1 significa aproveitamento total.
   */
  fator_correcao: number
  observacao: string
}

export type TipoFicha = 'prato' | 'preparo'

/**
 * Prato e preparo são a MESMA entidade, separados só por `tipo`. É isso que deixa
 * um prato conter dez preparos, e um preparo conter outros preparos, sem inventar
 * uma segunda tabela quase idêntica.
 */
export interface Ficha extends RegistroBase {
  tipo: TipoFicha
  nome: string
  categoria: string
  /** Quanto a receita inteira produz: 2 L de fundo, 1,5 kg de massa, 10 un. */
  rendimento_quantidade: number
  rendimento_unidade: Unidade
  /** Em quantas porções esse rendimento se divide. Usado no custo por porção. */
  porcoes: number
  modo_preparo: string[]
  tempo_minutos: number | null
  alergenicos: string[]
  observacao: string
}

/**
 * A aresta da árvore: liga uma ficha a um insumo (folha) OU a outra ficha (galho).
 * Exatamente um dos dois é preenchido.
 */
export interface FichaComponente extends RegistroBase {
  ficha_id: Uuid
  insumo_id: Uuid | null
  ficha_filha_id: Uuid | null
  quantidade: number
  unidade: Unidade
  ordem: number
  observacao: string
}

export interface Menu extends RegistroBase {
  nome: string
  descricao: string
}

export interface MenuItem extends RegistroBase {
  menu_id: Uuid
  ficha_id: Uuid
  porcoes_previstas: number
  ordem: number
}

export interface ServicoItem {
  ficha_id: Uuid
  porcoes: number
}

export interface Servico extends RegistroBase {
  data: IsoData
  nome: string
  menu_id: Uuid | null
  observacao: string
  /** O que está montado agora, e ainda dá para mexer. */
  itens: ServicoItem[]
  /**
   * Cópias congeladas do que foi servido: nomes, quantidades e modo de preparo
   * como estavam NAQUELE dia. Sem isso, consultar 10 de setembro daqui a um ano
   * mostraria a receita de hoje — que é justamente o que não se quer saber.
   *
   * É uma lista porque cada salvamento acrescenta uma versão. Trocar a guarnição
   * às quatro da tarde não apaga o que estava escrito às dez da manhã.
   */
  snapshots: SnapshotServico[]
}

/** Quantas versões de um mesmo dia vale a pena guardar antes de descartar as mais antigas. */
export const MAXIMO_DE_VERSOES = 20

export interface SnapshotServico {
  gerado_em: IsoInstante
  versao: number
  custo_total: number | null
  observacao: string
  pratos: SnapshotPrato[]
}

export interface SnapshotPrato {
  ficha_id: Uuid
  nome: string
  porcoes: number
  custo_total: number | null
  /** Árvore resolvida e denormalizada, já com nomes e quantidades escaladas. */
  arvore: SnapshotNo[]
}

export interface SnapshotNo {
  tipo: 'ficha' | 'insumo'
  ref_id: Uuid
  nome: string
  quantidade: number
  unidade: Unidade
  modo_preparo?: string[]
  filhos?: SnapshotNo[]
}

export type StatusProducao = 'a_fazer' | 'fazendo' | 'feito'

/**
 * Estado do checklist. A chave é o par (serviço, ficha) e não a posição na árvore:
 * se o fundo entra em três pratos, fazer o fundo é UM trabalho. Marcar feito num
 * lugar marca em todos, que é como a cozinha funciona de verdade.
 */
export interface ProducaoItem extends RegistroBase {
  servico_id: Uuid
  ficha_id: Uuid
  status: StatusProducao
  quantidade_ajustada: number | null
  nota: string
}

export type OrigemCompra = 'menu' | 'servico'

export interface CompraItem extends RegistroBase {
  origem_tipo: OrigemCompra
  origem_id: Uuid
  insumo_id: Uuid
  comprado: boolean
  quantidade_ajustada: number | null
  nota: string
}

export interface PeriodoCmv extends RegistroBase {
  rotulo: string
  inicio: IsoData
  fim: IsoData
  estoque_inicial: number
  compras: number
  estoque_final: number
  faturamento: number
  observacao: string
}
