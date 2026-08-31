import { describe, expect, it } from 'vitest'

import { mmParaDots } from './renderer'
import { interpolar, MODELO_PADRAO, type DadosEtiqueta } from './template'

const DADOS: DadosEtiqueta = {
  produto: 'Creme de leite',
  fornecedor: 'Laticínios São João',
  pasta: 'Laticínios',
  manipulacao: '30/08/2026',
  abertura: '30/08/2026',
  validade: '02/09/2026',
  lote: 'L-4412',
  responsavel: 'Maria',
  codigo: 'A7K293',
  quantidade: '1 L',
  url: 'https://exemplo/#/l/abc',
}

describe('interpolar', () => {
  it('substitui os marcadores pelos valores', () => {
    expect(interpolar('{{produto}} · {{lote}}', DADOS)).toBe('Creme de leite · L-4412')
  })

  it('preserva acentuação portuguesa', () => {
    // Rasterizar existe justamente para isso: a fonte nativa das térmicas
    // chinesas não traz o alfabeto acentuado completo.
    expect(interpolar('{{fornecedor}}', DADOS)).toBe('Laticínios São João')
  })

  it('deixa marcador desconhecido visível em vez de imprimir "undefined"', () => {
    // Uma etiqueta com "undefined" no meio já foi impressa e colada antes de
    // alguém notar; um {{campo}} literal denuncia o erro de modelo na hora.
    expect(interpolar('{{inexistente}}', DADOS)).toBe('{{inexistente}}')
  })

  it('substitui todas as ocorrências, não só a primeira', () => {
    expect(interpolar('{{lote}}/{{lote}}', DADOS)).toBe('L-4412/L-4412')
  })

  it('devolve texto sem marcador intacto', () => {
    expect(interpolar('VALIDADE', DADOS)).toBe('VALIDADE')
  })
})

describe('mmParaDots', () => {
  it('converte 60 mm nos dois DPIs de mercado', () => {
    expect(Math.round(mmParaDots(60, 203))).toBe(480)
    expect(Math.round(mmParaDots(60, 300))).toBe(709)
  })

  it('converte 40 mm de altura', () => {
    expect(Math.round(mmParaDots(40, 203))).toBe(320)
    expect(Math.round(mmParaDots(40, 300))).toBe(472)
  })

  it('mantém 1 polegada igual ao DPI', () => {
    expect(mmParaDots(25.4, 203)).toBeCloseTo(203)
  })
})

describe('MODELO_PADRAO', () => {
  it('tem as dimensões da etiqueta pedida', () => {
    expect(MODELO_PADRAO.larguraMm).toBe(60)
    expect(MODELO_PADRAO.alturaMm).toBe(40)
  })

  it('traz todos os campos que a etiqueta precisa mostrar', () => {
    const texto = JSON.stringify(MODELO_PADRAO.elementos)
    for (const campo of ['produto', 'fornecedor', 'manipulacao', 'validade', 'url', 'codigo']) {
      expect(texto).toContain(`{{${campo}}}`)
    }
  })

  it('mantém todos os elementos dentro dos limites físicos da etiqueta', () => {
    // Um elemento fora da área não é cortado com aviso: some da impressão em
    // silêncio, e só se descobre com a etiqueta na mão.
    for (const el of MODELO_PADRAO.elementos) {
      const largura = 'largura' in el ? el.largura : 'tamanho' in el ? el.tamanho : 0
      const altura =
        'altura' in el ? el.altura : 'tamanho' in el ? el.tamanho : el.tipo === 'linha' ? el.espessura : 0

      expect(el.x, `${el.id}: x`).toBeGreaterThanOrEqual(0)
      expect(el.y, `${el.id}: y`).toBeGreaterThanOrEqual(0)
      expect(el.x + largura, `${el.id}: excede a largura`).toBeLessThanOrEqual(
        MODELO_PADRAO.larguraMm,
      )
      expect(el.y + altura, `${el.id}: excede a altura`).toBeLessThanOrEqual(
        MODELO_PADRAO.alturaMm,
      )
    }
  })

  it('dá à validade o maior corpo de texto da etiqueta', () => {
    // É o único dado que motiva ação de quem abre a geladeira; se deixar de ser
    // o mais legível, o modelo perdeu o propósito.
    const textos = MODELO_PADRAO.elementos.filter((e) => e.tipo === 'texto')
    const validade = textos.find((e) => e.id === 'validade')!
    const maiorFonte = Math.max(...textos.map((e) => e.alturaFonte))
    expect(validade.alturaFonte).toBe(maiorFonte)
  })

  it('não repete ids de elemento', () => {
    const ids = MODELO_PADRAO.elementos.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
