import { codificarCpcl } from './cpcl'
import { codificarEscPos } from './escpos'
import { codificarTspl } from './tspl'
import type { Codificador, LinguagemImpressora } from './tipos'

export type { Codificador, LinguagemImpressora, OpcoesCodificacao } from './tipos'
export { codificarCpcl, codificarEscPos, codificarTspl }

export const CODIFICADORES: Record<LinguagemImpressora, Codificador> = {
  tspl: codificarTspl,
  escpos: codificarEscPos,
  cpcl: codificarCpcl,
}

/**
 * Ordem em que o diagnóstico sugere testar as linguagens.
 *
 * TSPL primeiro porque é o que domina as etiquetadoras de rolo — as que sabem o
 * que é uma etiqueta de 60 × 40 com gap. ESC/POS em seguida, por ser quase
 * universal nas portáteis. CPCL por último: manda a imagem em hexadecimal
 * ASCII, dobrando o tráfego num link BLE que já é lento.
 */
export const ORDEM_DE_TESTE: LinguagemImpressora[] = ['tspl', 'escpos', 'cpcl']

export const NOMES_LINGUAGEM: Record<LinguagemImpressora, string> = {
  tspl: 'TSPL / TSC',
  escpos: 'ESC/POS (raster)',
  cpcl: 'CPCL / Zebra',
}
