import { describe, expect, it } from 'vitest'

import {
  criarEtiquetaInventario,
  dadosParaImpressaoInventario,
  urlDaEtiquetaInventario,
} from './inventoryData'
import { PADROES_PRODUTO, type Produto } from './types'

const ORG = '11111111-1111-1111-1111-111111111111'

const produto: Produto = {
  ...PADROES_PRODUTO,
  id: 'p1',
  org_id: ORG,
  nome: 'Molho base',
  shelf_life_days: 5,
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('criarEtiquetaInventario', () => {
  it('nasce em estoque, com id e código curto próprios', () => {
    const etiqueta = criarEtiquetaInventario({ orgId: ORG, produto })
    expect(etiqueta.status).toBe('em_estoque')
    expect(etiqueta.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(etiqueta.short_code.length).toBeGreaterThanOrEqual(4)
  })

  it('guarda o nome do produto como snapshot', () => {
    // Renomear o produto amanhã não pode reescrever o papel colado hoje.
    expect(criarEtiquetaInventario({ orgId: ORG, produto }).produto_snapshot).toBe(
      'Molho base',
    )
  })

  it('não tem campo de validade nenhum', () => {
    // O pedido foi explícito: etiqueta de inventário sem data, para não
    // conflitar com a etiqueta de validade.
    const etiqueta = criarEtiquetaInventario({ orgId: ORG, produto })
    const chaves = Object.keys(etiqueta)
    expect(chaves).not.toContain('expires_at')
    expect(chaves).not.toContain('validade')
    expect(chaves).not.toContain('opened_at')
  })

  it('dá códigos curtos diferentes a cada unidade', () => {
    // Cada pote é uma etiqueta própria; código repetido faria a leitura de um
    // contar por vários.
    const a = criarEtiquetaInventario({ orgId: ORG, produto })
    const b = criarEtiquetaInventario({ orgId: ORG, produto })
    expect(a.id).not.toBe(b.id)
    expect(a.short_code).not.toBe(b.short_code)
  })
})

describe('urlDaEtiquetaInventario', () => {
  it('aponta para /i/ e nunca para /l/', () => {
    const url = urlDaEtiquetaInventario('abc')
    expect(url).toContain('#/i/abc')
    expect(url).not.toContain('#/l/')
  })
})

describe('dadosParaImpressaoInventario', () => {
  const etiqueta = criarEtiquetaInventario({
    orgId: ORG,
    produto,
    quantidade: 2,
    unidade: 'kg',
    lote: 'P-12',
  })
  const dados = dadosParaImpressaoInventario(etiqueta)

  it('deixa os campos de data VAZIOS, e não com a data de hoje', () => {
    // Uma data inventada no papel seria pior, numa fiscalização, que a ausência
    // dela — então nem por engano o modelo pode receber uma.
    expect(dados.validade).toBe('')
    expect(dados.manipulacao).toBe('')
    expect(dados.abertura).toBe('')
  })

  it('leva a quantidade com a unidade', () => {
    expect(dados.quantidade).toBe('2 kg')
  })

  it('assume uma unidade quando a quantidade não foi informada', () => {
    const sem = dadosParaImpressaoInventario(criarEtiquetaInventario({ orgId: ORG, produto }))
    expect(sem.quantidade).toBe('1')
  })

  it('põe o QR apontando para a rota de inventário', () => {
    expect(dados.url).toContain(`#/i/${etiqueta.id}`)
  })

  it('leva o código curto para o caso do QR estar ilegível', () => {
    expect(dados.codigo).toBe(etiqueta.short_code)
  })
})
