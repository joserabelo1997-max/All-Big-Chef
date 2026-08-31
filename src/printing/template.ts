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
 * O layout é de DUAS COLUNAS: texto à esquerda em 37 mm, e uma coluna própria à
 * direita só para o QR, com 17 mm.
 *
 * Esses 17 mm não são estética. A 203 dpi, um QR de 12 mm dava cerca de 2,6
 * pontos por módulo — o limite do que um leitor tolera, e frágil demais para
 * uma etiqueta que vai pegar gordura e condensação dentro da geladeira. A 17 mm
 * são ~3,3 pontos por módulo, o dobro da área de leitura. É a diferença entre
 * "lê quando o papel está limpo" e "lê sempre".
 */
export const MODELO_PADRAO: ModeloEtiqueta = {
  id: 'padrao-60x40',
  nome: 'Padrão 60 × 40',
  larguraMm: 60,
  alturaMm: 40,
  elementos: [
    {
      // Ocupa a largura inteira, acima das duas colunas.
      id: 'produto',
      tipo: 'texto',
      x: 2,
      y: 1.5,
      largura: 56,
      altura: 9,
      conteudo: '{{produto}}',
      alturaFonte: 4.4,
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
      y: 11,
      largura: 56,
      espessura: 0.3,
    },

    // --- Coluna esquerda: x 2, largura 37 mm ---
    {
      id: 'rotulo-validade',
      tipo: 'texto',
      x: 2,
      y: 12.6,
      largura: 37,
      altura: 2.8,
      conteudo: 'VALIDADE',
      alturaFonte: 2.2,
      negrito: true,
      alinhamento: 'esquerda',
    },
    {
      // Continua sendo, de longe, o maior elemento da etiqueta: é o único dado
      // que motiva uma ação de quem abre a geladeira.
      id: 'validade',
      tipo: 'texto',
      x: 2,
      y: 15.4,
      largura: 37,
      altura: 8.5,
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
      y: 25.6,
      largura: 37,
      altura: 3.2,
      conteudo: 'Manipulado: {{manipulacao}}',
      alturaFonte: 2.5,
      alinhamento: 'esquerda',
      ajustar: true,
    },
    {
      id: 'fornecedor',
      tipo: 'texto',
      x: 2,
      y: 29.4,
      largura: 37,
      altura: 3.2,
      conteudo: 'Forn.: {{fornecedor}}',
      alturaFonte: 2.5,
      alinhamento: 'esquerda',
      ajustar: true,
    },
    {
      id: 'lote-responsavel',
      tipo: 'texto',
      x: 2,
      y: 33.2,
      largura: 37,
      altura: 3.2,
      conteudo: 'Lote {{lote}} · {{responsavel}}',
      alturaFonte: 2.5,
      alinhamento: 'esquerda',
      ajustar: true,
    },

    // --- Coluna direita: só o QR e o código sob ele ---
    {
      id: 'qr',
      tipo: 'qrcode',
      x: 40.5,
      y: 13,
      tamanho: 17,
      conteudo: '{{url}}',
    },
    {
      // Digitável quando o QR estiver amassado ou sujo de gordura — situação
      // rotineira numa cozinha, não caso de borda. Centralizado sob o QR.
      id: 'codigo',
      tipo: 'texto',
      x: 40.5,
      y: 31,
      largura: 17,
      altura: 3,
      conteudo: '{{codigo}}',
      alturaFonte: 2.5,
      negrito: true,
      alinhamento: 'centro',
    },
  ],
}

/**
 * Modelo da etiqueta de INVENTÁRIO, 60 × 40 mm.
 *
 * Deliberadamente sem nenhuma data, como você pediu: serve para contar o que a
 * casa produziu e guardou, e cada unidade ganha um QR único para que a
 * conferência do freezer vire passar o leitor.
 *
 * Não é uma variação da etiqueta de validade: é outra coisa, com outro destino
 * (`#/i/…` em vez de `#/l/…`) e outra tabela. Uma leitura nunca é confundida
 * com a outra.
 *
 * Como aqui não há validade competindo por espaço, o QR fica bem maior — 24 mm
 * contra 17 mm da etiqueta de validade. A etiqueta de inventário é feita para
 * ser lida em série, no frio, com o leitor a alguma distância; um QR grande é o
 * que faz uma conferência de trinta potes não virar trinta tentativas.
 */
export const MODELO_INVENTARIO: ModeloEtiqueta = {
  id: 'inventario-60x40',
  nome: 'Inventário 60 × 40',
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
      // 4,4 mm e não 5: duas linhas de 5 mm somam 10 e transbordam a caixa de
      // 9 — o nome longo invadia a divisória, como mostrou a renderização.
      alturaFonte: 4.4,
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
      y: 11.5,
      largura: 56,
      espessura: 0.3,
    },

    // --- Coluna esquerda: o QR, grande ---
    {
      id: 'qr',
      tipo: 'qrcode',
      x: 3,
      y: 13,
      tamanho: 24,
      conteudo: '{{url}}',
    },

    // --- Coluna direita: o que se conta ---
    {
      id: 'rotulo-inventario',
      tipo: 'texto',
      x: 29,
      y: 13.5,
      largura: 29,
      altura: 3,
      conteudo: 'INVENTÁRIO',
      alturaFonte: 2.4,
      negrito: true,
      alinhamento: 'centro',
    },
    {
      id: 'quantidade',
      tipo: 'texto',
      x: 29,
      y: 17.5,
      largura: 29,
      altura: 8,
      conteudo: '{{quantidade}}',
      alturaFonte: 6.5,
      negrito: true,
      alinhamento: 'centro',
      ajustar: true,
    },
    {
      id: 'lote',
      tipo: 'texto',
      x: 29,
      y: 26.5,
      largura: 29,
      altura: 3.2,
      conteudo: 'Lote {{lote}}',
      alturaFonte: 2.5,
      alinhamento: 'centro',
      ajustar: true,
    },
    {
      id: 'codigo',
      tipo: 'texto',
      x: 29,
      y: 31,
      largura: 29,
      altura: 4,
      conteudo: '{{codigo}}',
      alturaFonte: 3.4,
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
