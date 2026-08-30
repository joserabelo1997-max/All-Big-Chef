import type { BitmapMono } from '../monochrome'

/** Linguagens de comando suportadas. */
export type LinguagemImpressora = 'tspl' | 'escpos' | 'cpcl'

export interface OpcoesCodificacao {
  larguraMm: number
  alturaMm: number
  /** Pontos por polegada da cabeça térmica: 203 ou 300 nas portáteis. */
  dpi: number
  copias?: number
  /** Intensidade de queima, 0–15 no TSPL. Mais alto = mais escuro e mais lento. */
  densidade?: number
  velocidade?: number
  /** Espaçamento entre etiquetas do rolo, em mm. */
  gapMm?: number
}

export type Codificador = (
  bitmap: BitmapMono,
  opcoes: OpcoesCodificacao,
) => Uint8Array
