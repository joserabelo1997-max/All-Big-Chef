import { describe, expect, it } from 'vitest'

import { paraMonocromatico, type BitmapMono } from '../monochrome'
import { codificarCpcl } from './cpcl'
import { codificarEscPos } from './escpos'
import { codificarTspl } from './tspl'
import type { OpcoesCodificacao } from './tipos'

const OPCOES: OpcoesCodificacao = {
  larguraMm: 60,
  alturaMm: 40,
  dpi: 203,
}

/** Bitmap sólido preto de 8 × altura, para checar a convenção de bits. */
function bitmapPreto(altura = 1): BitmapMono {
  const rgba = new Uint8ClampedArray(8 * altura * 4)
  for (let i = 0; i < 8 * altura; i++) rgba[i * 4 + 3] = 255 // preto, opaco
  return paraMonocromatico(rgba, 8, altura)
}

/** Lê os bytes como Latin-1, para inspecionar o cabeçalho sem corromper binário. */
function comoTexto(bytes: Uint8Array): string {
  let saida = ''
  for (const b of bytes) saida += String.fromCharCode(b)
  return saida
}

function indiceDe(bytes: Uint8Array, alvo: string): number {
  return comoTexto(bytes).indexOf(alvo)
}

describe('codificarTspl', () => {
  it('declara o tamanho físico da etiqueta em milímetros', () => {
    const saida = comoTexto(codificarTspl(bitmapPreto(), OPCOES))
    expect(saida).toContain('SIZE 60 mm,40 mm')
    expect(saida).toContain('GAP 2 mm,0 mm')
    expect(saida).toContain('CLS')
    expect(saida).toContain('PRINT 1,1')
  })

  it('INVERTE os bits — no TSPL, 1 é branco', () => {
    // Esta é a armadilha mais cara do TSPL: sem inversão a etiqueta sai em
    // negativo, com o fundo inteiro queimado.
    const bytes = codificarTspl(bitmapPreto(), OPCOES)
    const cabecalho = 'BITMAP 0,0,1,1,0,'
    const inicio = indiceDe(bytes, cabecalho)
    expect(inicio).toBeGreaterThanOrEqual(0)
    // O primeiro byte de dados: preto sólido (0xFF) vira 0x00 no TSPL.
    expect(bytes[inicio + cabecalho.length]).toBe(0x00)
  })

  it('informa bytes por linha e altura no cabeçalho do BITMAP', () => {
    const saida = comoTexto(codificarTspl(bitmapPreto(3), OPCOES))
    expect(saida).toContain('BITMAP 0,0,1,3,0,')
  })

  it('preserva bytes binários acima de 0x7F sem corromper', () => {
    // Montar o comando como string em UTF-8 transformaria qualquer byte ≥ 0x80
    // em U+FFFD, destruindo a imagem em silêncio.
    const rgba = new Uint8ClampedArray(8 * 4)
    // '#.......' → 0x80 no bitmap normal, 0x7F depois de inverter.
    rgba[3] = 255
    for (let i = 1; i < 8; i++) {
      rgba[i * 4] = 255
      rgba[i * 4 + 1] = 255
      rgba[i * 4 + 2] = 255
      rgba[i * 4 + 3] = 255
    }
    const bitmap = paraMonocromatico(rgba, 8, 1)
    expect(bitmap.dados[0]).toBe(0x80)

    const bytes = codificarTspl(bitmap, OPCOES)
    const posicao = comoTexto(bytes).indexOf('BITMAP 0,0,1,1,0,') + 'BITMAP 0,0,1,1,0,'.length
    expect(bytes[posicao]).toBe(0x7f)
  })

  it('repassa o número de cópias', () => {
    const saida = comoTexto(codificarTspl(bitmapPreto(), { ...OPCOES, copias: 4 }))
    expect(saida).toContain('PRINT 4,1')
  })
})

describe('codificarEscPos', () => {
  it('começa reinicializando a impressora', () => {
    const bytes = codificarEscPos(bitmapPreto(), OPCOES)
    expect(bytes[0]).toBe(0x1b)
    expect(bytes[1]).toBe(0x40)
  })

  it('NÃO inverte os bits — no ESC/POS, 1 é preto', () => {
    const bytes = codificarEscPos(bitmapPreto(), OPCOES)
    // Após ESC @ (2 bytes) vem GS v 0 (8 bytes de cabeçalho), depois os dados.
    expect(Array.from(bytes.slice(2, 10))).toEqual([
      0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00,
    ])
    expect(bytes[10]).toBe(0xff)
  })

  it('fatia bitmaps altos em blocos, sem estourar o buffer do firmware', () => {
    const bytes = codificarEscPos(bitmapPreto(300), OPCOES)
    // 300 linhas em faixas de 128 → 3 blocos (128 + 128 + 44).
    let blocos = 0
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) blocos++
    }
    expect(blocos).toBe(3)
  })

  it('não perde nenhuma linha ao fatiar', () => {
    const altura = 300
    const bytes = codificarEscPos(bitmapPreto(altura), OPCOES)
    // 1 byte por linha neste bitmap; todo dado deve sobreviver ao fatiamento.
    const dados = Array.from(bytes).filter((b) => b === 0xff).length
    expect(dados).toBe(altura)
  })

  it('avança o papel ao final para permitir destacar a etiqueta', () => {
    const bytes = codificarEscPos(bitmapPreto(), OPCOES)
    expect(Array.from(bytes.slice(-3))).toEqual([0x1b, 0x64, 0x03])
  })

  it('repete o conteúdo a cada cópia', () => {
    const uma = codificarEscPos(bitmapPreto(10), OPCOES)
    const duas = codificarEscPos(bitmapPreto(10), { ...OPCOES, copias: 2 })
    // A segunda cópia acrescenta bloco + avanço; o ESC @ não se repete.
    expect(duas.length).toBe(uma.length * 2 - 2)
  })
})

describe('codificarCpcl', () => {
  it('monta o cabeçalho com o DPI e a altura em dots', () => {
    const saida = comoTexto(codificarCpcl(bitmapPreto(40), OPCOES))
    expect(saida.startsWith('! 0 203 203 40 1')).toBe(true)
    expect(saida).toContain('FORM')
    expect(saida).toContain('PRINT')
  })

  it('transporta a imagem em hexadecimal ASCII maiúsculo', () => {
    const saida = comoTexto(codificarCpcl(bitmapPreto(2), OPCOES))
    expect(saida).toContain('EG 1 2 0 0 FFFF')
  })

  it('NÃO inverte os bits — assim como o ESC/POS, 1 é preto', () => {
    const saida = comoTexto(codificarCpcl(bitmapPreto(1), OPCOES))
    expect(saida).toContain('EG 1 1 0 0 FF')
    expect(saida).not.toContain('EG 1 1 0 0 00')
  })

  it('gasta dois caracteres por byte — o custo que o deixa por último', () => {
    const bitmap = bitmapPreto(100)
    const saida = comoTexto(codificarCpcl(bitmap, OPCOES))
    const hex = saida.slice(saida.indexOf('EG 1 100 0 0 ') + 'EG 1 100 0 0 '.length)
    expect(hex.trimEnd().split('\r\n')[0]!.length).toBe(bitmap.dados.length * 2)
  })
})

describe('comparação entre linguagens', () => {
  it('TSPL e ESC/POS produzem bits opostos para a mesma imagem', () => {
    // Regressão contra o erro mais provável: reaproveitar o bitmap de um
    // encoder no outro sem tratar a convenção invertida do TSPL.
    const bitmap = bitmapPreto()
    const tspl = codificarTspl(bitmap, OPCOES)
    const escpos = codificarEscPos(bitmap, OPCOES)

    const posTspl = comoTexto(tspl).indexOf('BITMAP 0,0,1,1,0,') + 'BITMAP 0,0,1,1,0,'.length
    expect(tspl[posTspl]).toBe(0x00)
    expect(escpos[10]).toBe(0xff)
  })
})
