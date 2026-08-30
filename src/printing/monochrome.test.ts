import { describe, expect, it } from 'vitest'

import {
  alinharEm8,
  fatiarLinhas,
  inverterBits,
  paraMonocromatico,
} from './monochrome'

/** Monta um buffer RGBA a partir de um desenho em texto: '#' preto, '.' branco. */
function rgbaDe(linhas: string[]): {
  rgba: Uint8ClampedArray
  largura: number
  altura: number
} {
  const altura = linhas.length
  const largura = linhas[0]!.length
  const rgba = new Uint8ClampedArray(largura * altura * 4)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const preto = linhas[y]![x] === '#'
      const p = (y * largura + x) * 4
      const tom = preto ? 0 : 255
      rgba[p] = tom
      rgba[p + 1] = tom
      rgba[p + 2] = tom
      rgba[p + 3] = 255
    }
  }
  return { rgba, largura, altura }
}

describe('alinharEm8', () => {
  it('arredonda para cima até o múltiplo de 8', () => {
    expect(alinharEm8(480)).toBe(480)
    expect(alinharEm8(481)).toBe(488)
    expect(alinharEm8(1)).toBe(8)
  })

  it('cobre a largura real de 60 mm nos dois DPIs de mercado', () => {
    // 203 dpi = 8 dots/mm → 60 mm cai exatamente em 480, 60 bytes por linha.
    expect(alinharEm8(Math.round(60 * (203 / 25.4)))).toBe(480)
    // 300 dpi → 709 dots, que não é múltiplo de 8; precisa virar 712 (89 bytes).
    expect(alinharEm8(Math.round(60 * (300 / 25.4)))).toBe(712)
  })
})

describe('paraMonocromatico', () => {
  it('empacota o pixel mais à esquerda no bit mais significativo', () => {
    const { rgba, largura, altura } = rgbaDe(['#.......'])
    const bitmap = paraMonocromatico(rgba, largura, altura)
    expect(bitmap.dados[0]).toBe(0b1000_0000)
  })

  it('empacota o pixel mais à direita no bit menos significativo', () => {
    const { rgba, largura, altura } = rgbaDe(['.......#'])
    const bitmap = paraMonocromatico(rgba, largura, altura)
    expect(bitmap.dados[0]).toBe(0b0000_0001)
  })

  it('usa bit 1 para preto, seguindo a convenção do ESC/POS', () => {
    const { rgba, largura, altura } = rgbaDe(['########'])
    expect(paraMonocromatico(rgba, largura, altura).dados[0]).toBe(0xff)
  })

  it('preenche a sobra de largura com branco, não com lixo', () => {
    // 10 px de largura precisam de 2 bytes; os 6 bits finais são padding físico
    // da etiqueta e não podem queimar.
    const { rgba, largura, altura } = rgbaDe(['##########'])
    const bitmap = paraMonocromatico(rgba, largura, altura)
    expect(bitmap.largura).toBe(16)
    expect(bitmap.bytesPorLinha).toBe(2)
    expect(bitmap.dados[0]).toBe(0xff)
    expect(bitmap.dados[1]).toBe(0b1100_0000)
  })

  it('trata pixel transparente como branco', () => {
    // Um canvas recém-criado é transparente. Sem essa regra a etiqueta inteira
    // sairia preta, queimando a fita e desgastando a cabeça térmica.
    const rgba = new Uint8ClampedArray(8 * 1 * 4) // tudo zero: preto e alfa 0
    const bitmap = paraMonocromatico(rgba, 8, 1)
    expect(bitmap.dados[0]).toBe(0x00)
  })

  it('respeita o limiar informado', () => {
    const rgba = new Uint8ClampedArray(8 * 4)
    for (let i = 0; i < 8; i++) {
      rgba[i * 4] = 100
      rgba[i * 4 + 1] = 100
      rgba[i * 4 + 2] = 100
      rgba[i * 4 + 3] = 255
    }
    expect(paraMonocromatico(rgba, 8, 1, { limiar: 128 }).dados[0]).toBe(0xff)
    expect(paraMonocromatico(rgba, 8, 1, { limiar: 50 }).dados[0]).toBe(0x00)
  })

  it('recusa buffer menor que as dimensões declaradas', () => {
    expect(() => paraMonocromatico(new Uint8ClampedArray(4), 10, 10)).toThrow(
      /menor que o esperado/i,
    )
  })

  it('mantém linhas independentes', () => {
    const { rgba, largura, altura } = rgbaDe(['########', '........'])
    const bitmap = paraMonocromatico(rgba, largura, altura)
    expect(bitmap.dados[0]).toBe(0xff)
    expect(bitmap.dados[1]).toBe(0x00)
  })
})

describe('inverterBits', () => {
  it('troca preto por branco preservando as dimensões', () => {
    const { rgba, largura, altura } = rgbaDe(['##..##..'])
    const original = paraMonocromatico(rgba, largura, altura)
    const invertido = inverterBits(original)
    expect(original.dados[0]).toBe(0b1100_1100)
    expect(invertido.dados[0]).toBe(0b0011_0011)
    expect(invertido.largura).toBe(original.largura)
    expect(invertido.altura).toBe(original.altura)
  })

  it('não altera o bitmap recebido', () => {
    const { rgba, largura, altura } = rgbaDe(['########'])
    const original = paraMonocromatico(rgba, largura, altura)
    inverterBits(original)
    expect(original.dados[0]).toBe(0xff)
  })
})

describe('fatiarLinhas', () => {
  const { rgba, largura, altura } = rgbaDe([
    '########',
    '........',
    '########',
    '........',
  ])
  const bitmap = paraMonocromatico(rgba, largura, altura)

  it('recorta o intervalo pedido', () => {
    const faixa = fatiarLinhas(bitmap, 1, 2)
    expect(faixa.altura).toBe(2)
    expect(Array.from(faixa.dados)).toEqual([0x00, 0xff])
  })

  it('trunca no fim do bitmap em vez de estourar', () => {
    // O ESC/POS pede faixas de tamanho fixo; a última quase nunca fecha certo.
    const faixa = fatiarLinhas(bitmap, 3, 128)
    expect(faixa.altura).toBe(1)
    expect(Array.from(faixa.dados)).toEqual([0x00])
  })
})
