import { fatiarLinhas, type BitmapMono } from '../monochrome'
import type { OpcoesCodificacao } from './tipos'

/**
 * ESC/POS raster (`GS v 0`) — a linguagem das impressoras de cupom, que muitas
 * etiquetadoras portáteis chinesas também aceitam.
 *
 * Diferente do TSPL, o ESC/POS não sabe o que é "uma etiqueta": ele imprime um
 * fluxo contínuo de linhas. Ele não conhece SIZE nem GAP, então quem controla
 * onde a etiqueta termina é o avanço de papel no fim — e o sensor de gap da
 * própria impressora, se ela tiver um.
 */

const ESC = 0x1b
const GS = 0x1d

/**
 * Muitos firmwares travam ou truncam blocos raster muito altos — o parâmetro de
 * altura é de 16 bits, mas o buffer interno raramente acompanha. Fatiar em
 * faixas de 128 linhas mantém cada bloco pequeno o bastante para qualquer
 * firmware, ao custo de alguns bytes de cabeçalho a mais.
 */
const LINHAS_POR_BLOCO = 128

function concatenar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const saida = new Uint8Array(total)
  let deslocamento = 0
  for (const parte of partes) {
    saida.set(parte, deslocamento)
    deslocamento += parte.length
  }
  return saida
}

/** Bloco raster: GS v 0 m xL xH yL yH [dados]. */
function blocoRaster(faixa: BitmapMono): Uint8Array {
  const { bytesPorLinha, altura, dados } = faixa
  const cabecalho = new Uint8Array([
    GS,
    0x76,
    0x30,
    0x00, // m = 0: densidade normal, sem escala
    bytesPorLinha & 0xff,
    (bytesPorLinha >> 8) & 0xff,
    altura & 0xff,
    (altura >> 8) & 0xff,
  ])
  return concatenar([cabecalho, dados])
}

export function codificarEscPos(
  bitmap: BitmapMono,
  opcoes: OpcoesCodificacao,
): Uint8Array {
  const { copias = 1 } = opcoes
  const partes: Uint8Array[] = []

  // ESC @ — reinicia o estado. Sem isso, um alinhamento ou modo deixado por um
  // trabalho anterior desloca a etiqueta inteira.
  partes.push(new Uint8Array([ESC, 0x40]))

  for (let copia = 0; copia < copias; copia++) {
    for (let linha = 0; linha < bitmap.altura; linha += LINHAS_POR_BLOCO) {
      partes.push(blocoRaster(fatiarLinhas(bitmap, linha, LINHAS_POR_BLOCO)))
    }
    // ESC d n — avança n linhas, destacando a etiqueta do cabeçote para que a
    // pessoa consiga arrancá-la sem puxar a próxima junto.
    partes.push(new Uint8Array([ESC, 0x64, 0x03]))
  }

  return concatenar(partes)
}
