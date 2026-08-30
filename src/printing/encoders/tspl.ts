import { inverterBits, type BitmapMono } from '../monochrome'
import type { OpcoesCodificacao } from './tipos'

/**
 * TSPL / TSPL2 — linguagem da TSC e de boa parte das etiquetadoras chinesas
 * rebatizadas (AIYIN entre as candidatas).
 *
 * Duas armadilhas que este encoder resolve e que costumam custar horas:
 *
 * 1. **Os bits são invertidos.** No comando BITMAP do TSPL, bit 1 = BRANCO,
 *    ao contrário do ESC/POS. Enviar o bitmap sem inverter imprime a etiqueta
 *    em negativo — fundo todo preto — o que gasta a fita inteira e desgasta a
 *    cabeça térmica. Por isso `inverterBits` é obrigatório aqui.
 *
 * 2. **O cabeçalho é texto, o bitmap é binário.** `SIZE`, `GAP` e `PRINT` são
 *    ASCII terminados em CRLF, mas os bytes da imagem vêm crus logo após o
 *    cabeçalho do BITMAP. Montar tudo como string corromperia os dados, porque
 *    qualquer byte ≥ 0x80 viraria U+FFFD na codificação para UTF-8. Daí a
 *    montagem ser feita em pedaços de Uint8Array.
 */

const CRLF = '\r\n'

function ascii(texto: string): Uint8Array {
  const saida = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) saida[i] = texto.charCodeAt(i) & 0xff
  return saida
}

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

export function codificarTspl(
  bitmap: BitmapMono,
  opcoes: OpcoesCodificacao,
): Uint8Array {
  const { larguraMm, alturaMm, copias = 1, densidade = 8, velocidade } = opcoes

  const invertido = inverterBits(bitmap)

  const cabecalho: string[] = [
    `SIZE ${larguraMm} mm,${alturaMm} mm`,
    // GAP 2mm é o espaçamento das etiquetas em rolo mais comum no mercado
    // brasileiro; ajustável no perfil da impressora quando a fita for contínua.
    `GAP ${opcoes.gapMm ?? 2} mm,0 mm`,
    `DENSITY ${densidade}`,
    ...(velocidade ? [`SPEED ${velocidade}`] : []),
    // DIRECTION 1 faz a etiqueta sair com o topo primeiro, que é como a pessoa
    // lê ao destacar do rolo.
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
  ]

  return concatenar([
    ascii(cabecalho.join(CRLF) + CRLF),
    // BITMAP x,y,bytesPorLinha,altura,modo — modo 0 = OVERWRITE.
    ascii(`BITMAP 0,0,${invertido.bytesPorLinha},${invertido.altura},0,`),
    invertido.dados,
    ascii(CRLF + `PRINT ${copias},1` + CRLF),
  ])
}
