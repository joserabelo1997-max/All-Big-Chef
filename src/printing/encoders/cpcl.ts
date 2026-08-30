import type { BitmapMono } from '../monochrome'
import type { OpcoesCodificacao } from './tipos'

/**
 * CPCL — linguagem das portáteis Zebra e de clones que a copiaram.
 *
 * A peculiaridade do CPCL é o comando `EG`, que transporta a imagem em
 * HEXADECIMAL ASCII, não em binário: cada byte do bitmap vira dois caracteres.
 * Isso dobra o volume enviado, o que pesa num link BLE — daí este ser o último
 * candidato a testar no diagnóstico, e não o primeiro.
 *
 * Ao contrário do TSPL, aqui bit 1 = PRETO, igual ao ESC/POS: não há inversão.
 */

const CRLF = '\r\n'
const HEX = '0123456789ABCDEF'

function ascii(texto: string): Uint8Array {
  const saida = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) saida[i] = texto.charCodeAt(i) & 0xff
  return saida
}

function paraHex(dados: Uint8Array): string {
  // Concatenação manual em vez de map().join(''): a etiqueta gera dezenas de
  // milhares de bytes, e o array intermediário custa caro no celular.
  let saida = ''
  for (let i = 0; i < dados.length; i++) {
    const byte = dados[i]!
    saida += HEX[byte >> 4]! + HEX[byte & 0x0f]!
  }
  return saida
}

export function codificarCpcl(
  bitmap: BitmapMono,
  opcoes: OpcoesCodificacao,
): Uint8Array {
  const { dpi, copias = 1 } = opcoes

  const comandos = [
    // ! deslocamento dpiHoriz dpiVert alturaEmDots copias
    `! 0 ${dpi} ${dpi} ${bitmap.altura} ${copias}`,
    // EG bytesPorLinha alturaEmDots x y <hex>
    `EG ${bitmap.bytesPorLinha} ${bitmap.altura} 0 0 ${paraHex(bitmap.dados)}`,
    'FORM',
    'PRINT',
    '',
  ]

  return ascii(comandos.join(CRLF))
}
