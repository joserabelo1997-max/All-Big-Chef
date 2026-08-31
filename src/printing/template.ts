/**
 * Modelo de etiqueta.
 *
 * Toda coordenada e todo tamanho estão em MILÍMETROS — nunca em pixels nem em
 * dots. Milímetro é a única unidade que sobrevive à troca de impressora: o mesmo
 * modelo renderiza idêntico numa térmica de 203 dpi e numa de 300 dpi, e
 * corresponde ao que a pessoa mede com régua na etiqueta impressa. Pixel só
 * aparece no renderizador, no último instante antes de desenhar.
 */

/** Campos que o modelo pode interpolar via `{{chave}}`. */
export interface DadosEtiqueta {
  produto: string
  fornecedor: string
  pasta: string
  /** Data em que o produto foi manipulado, no vocabulário da RDC 216. */
  manipulacao: string
  /**
   * @deprecated Nome antigo de `manipulacao`. Mantido para que modelos já
   * salvos por alguém, que ainda usem `{{abertura}}`, continuem imprimindo a
   * data em vez de mostrar o marcador cru no papel.
   */
  abertura: string
  validade: string
  lote: string
  responsavel: string
  codigo: string
  quantidade: string
  /** URL completa que vai dentro do QR. */
  url: string
}

export type Alinhamento = 'esquerda' | 'centro' | 'direita'

interface Base {
  id: string
  x: number
  y: number
}

export interface ElementoTexto extends Base {
  tipo: 'texto'
  largura: number
  altura: number
  /** Texto literal com marcadores `{{produto}}`, `{{validade}}` etc. */
  conteudo: string
  /** Altura da fonte em mm (não em pontos: aqui tudo é milímetro). */
  alturaFonte: number
  negrito?: boolean
  alinhamento?: Alinhamento
  maiuscula?: boolean
  /**
   * Reduz a fonte até o texto caber na largura. Ligado por padrão: nome de
   * produto de cozinha varia de "Leite" a "Molho bechamel de alho-poró", e uma
   * etiqueta com o nome cortado é uma etiqueta inútil.
   */
  ajustar?: boolean
  /** Máximo de linhas ao quebrar o texto. Padrão 1. */
  linhas?: number
}

export interface ElementoQrcode extends Base {
  tipo: 'qrcode'
  /** Lado do quadrado, em mm. */
  tamanho: number
  conteudo: string
}

export interface ElementoLinha extends Base {
  tipo: 'linha'
  largura: number
  espessura: number
}

export interface ElementoRetangulo extends Base {
  tipo: 'retangulo'
  largura: number
  altura: number
  espessura: number
  preenchido?: boolean
}

export type ElementoEtiqueta =
  | ElementoTexto
  | ElementoQrcode
  | ElementoLinha
  | ElementoRetangulo

export interface ModeloEtiqueta {
  id: string
  nome: string
  larguraMm: number
  alturaMm: number
  elementos: ElementoEtiqueta[]
}

/**
 * Modelo padrão 60 × 40 mm.
 *
 * A hierarquia visual segue o que a cozinha realmente precisa enxergar de
 * relance, com o pote já dentro da geladeira: a VALIDADE é o maior elemento da
 * etiqueta, porque é o único dado que motiva uma ação. O nome do produto vem
 * logo abaixo em corpo grande. Fornecedor, lote e responsável existem para a
 * auditoria, não para a operação, e ficam em corpo pequeno.
 *
 * O QR ocupa o canto inferior direito, a 12 mm — o suficiente para a câmera ler
 * rápido sem roubar espaço das datas.
 */
export const MODELO_PADRAO: ModeloEtiqueta = {
  id: 'padrao-60x40',
  nome: 'Padrão 60 × 40',
  larguraMm: 60,
  alturaMm: 40,
  elementos: [
    {
      id: 'produto',
      tipo: 'texto',
      x: 2,
      y: 1.5,
      largura: 56,
      altura: 9,
      conteudo: '{{produto}}',
      alturaFonte: 4.6,
      negrito: true,
      alinhamento: 'centro',
      maiuscula: true,
      ajustar: true,
      linhas: 2,
    },
    {
      id: 'divisoria-topo',
      tipo: 'linha',
      x: 2,
      y: 11.2,
      largura: 56,
      espessura: 0.3,
    },
    {
      id: 'rotulo-validade',
      tipo: 'texto',
      x: 2,
      y: 12.4,
      largura: 44,
      altura: 3,
      conteudo: 'VALIDADE',
      alturaFonte: 2.4,
      negrito: true,
      alinhamento: 'esquerda',
    },
    {
      // O maior elemento da etiqueta, de propósito.
      id: 'validade',
      tipo: 'texto',
      x: 2,
      y: 15.4,
      // 42 mm, e não os 44 dos demais campos: o ajuste automático estica a data
      // até o limite da caixa, e com 44 o último dígito encostava no QR.
      largura: 42,
      altura: 8,
      conteudo: '{{validade}}',
      alturaFonte: 7,
      negrito: true,
      alinhamento: 'esquerda',
      ajustar: true,
    },
    {
      id: 'manipulacao',
      tipo: 'texto',
      x: 2,
      y: 24.2,
      largura: 44,
      altura: 3.4,
      conteudo: 'Manipulado: {{manipulacao}}',
      alturaFonte: 2.8,
      alinhamento: 'esquerda',
    },
    {
      id: 'fornecedor',
      tipo: 'texto',
      x: 2,
      y: 28,
      largura: 44,
      altura: 3.4,
      conteudo: 'Forn.: {{fornecedor}}',
      alturaFonte: 2.8,
      alinhamento: 'esquerda',
      ajustar: true,
    },
    {
      id: 'lote-responsavel',
      tipo: 'texto',
      x: 2,
      y: 31.8,
      largura: 44,
      altura: 3.4,
      conteudo: 'Lote {{lote}} · {{responsavel}}',
      alturaFonte: 2.8,
      alinhamento: 'esquerda',
      ajustar: true,
    },
    {
      id: 'qr',
      tipo: 'qrcode',
      x: 46.5,
      y: 13.5,
      tamanho: 12,
      conteudo: '{{url}}',
    },
    {
      // Digitável quando o QR estiver amassado ou sujo de gordura — situação
      // rotineira numa cozinha, não caso de borda.
      id: 'codigo',
      tipo: 'texto',
      x: 45.5,
      y: 26,
      largura: 14,
      altura: 3,
      conteudo: '{{codigo}}',
      alturaFonte: 2.6,
      negrito: true,
      alinhamento: 'centro',
    },
  ],
}

/** Substitui os marcadores `{{chave}}` pelos valores da etiqueta. */
export function interpolar(texto: string, dados: DadosEtiqueta): string {
  const tabela = dados as unknown as Record<string, unknown>
  return texto.replace(/\{\{(\w+)\}\}/g, (original, chave: string) => {
    const valor = tabela[chave]
    // Marcador desconhecido fica visível no texto em vez de virar "undefined" —
    // um erro de modelo precisa aparecer para quem está editando a etiqueta.
    return valor == null ? original : String(valor)
  })
}
