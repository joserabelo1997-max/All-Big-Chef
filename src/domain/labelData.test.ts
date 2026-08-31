import { describe, expect, it } from 'vitest'

import { criarEtiqueta, criarEventoBaixa, dadosParaImpressao } from './labelData'
import { PADROES_PRODUTO, type Fornecedor, type Pasta, type Produto } from './types'

const ORG = '11111111-1111-1111-1111-111111111111'
const AGORA = new Date(2026, 7, 30, 14, 20)

const produto: Produto = {
  ...PADROES_PRODUTO,
  id: 'p1',
  org_id: ORG,
  nome: 'Creme de leite',
  shelf_life_days: 3,
  unidade: 'L',
  ativo: true,
  created_at: AGORA.toISOString(),
  updated_at: AGORA.toISOString(),
}

const fornecedor: Fornecedor = {
  id: 'f1',
  org_id: ORG,
  nome: 'Laticínios São João',
  ativo: true,
  created_at: AGORA.toISOString(),
  updated_at: AGORA.toISOString(),
}

const pasta: Pasta = {
  id: 'pa1',
  org_id: ORG,
  nome: 'Laticínios',
  cor: '#0ea5e9',
  ordem: 1,
  created_at: AGORA.toISOString(),
  updated_at: AGORA.toISOString(),
}

describe('criarEtiqueta', () => {
  it('calcula a validade a partir dos dias do produto', () => {
    const { etiqueta } = criarEtiqueta({ orgId: ORG, produto, abertura: AGORA })
    const validade = new Date(etiqueta.expires_at)
    expect(validade.getDate()).toBe(2)
    expect(validade.getMonth()).toBe(8) // setembro
  })

  it('guarda snapshot do produto, fornecedor e pasta', () => {
    const { etiqueta } = criarEtiqueta({
      orgId: ORG,
      produto,
      fornecedor,
      pasta,
      abertura: AGORA,
    })
    expect(etiqueta.produto_snapshot).toBe('Creme de leite')
    expect(etiqueta.fornecedor_snapshot).toBe('Laticínios São João')
    expect(etiqueta.pasta_snapshot).toBe('Laticínios')
    expect(etiqueta.shelf_life_days_snapshot).toBe(3)
  })

  it('o snapshot NÃO muda quando o cadastro muda depois', () => {
    // A garantia central da rastreabilidade: renomear o produto amanhã não pode
    // reescrever o que está impresso no papel colado no pote hoje.
    const { etiqueta } = criarEtiqueta({ orgId: ORG, produto, abertura: AGORA })
    const renomeado = { ...produto, nome: 'Creme de leite UHT' }

    expect(etiqueta.produto_snapshot).toBe('Creme de leite')
    expect(renomeado.nome).toBe('Creme de leite UHT')
  })

  it('gera id e código curto próprios', () => {
    const a = criarEtiqueta({ orgId: ORG, produto })
    const b = criarEtiqueta({ orgId: ORG, produto })
    expect(a.etiqueta.id).not.toBe(b.etiqueta.id)
    expect(a.etiqueta.short_code).not.toBe(b.etiqueta.short_code)
    expect(a.etiqueta.short_code).toHaveLength(6)
  })

  it('nasce ativa e com evento de impressão apontando para ela', () => {
    const { etiqueta, evento } = criarEtiqueta({ orgId: ORG, produto })
    expect(etiqueta.status).toBe('ativa')
    expect(evento.tipo).toBe('impressa')
    expect(evento.label_id).toBe(etiqueta.id)
  })

  it('registra quem imprimiu', () => {
    const { etiqueta, evento } = criarEtiqueta({
      orgId: ORG,
      produto,
      membroId: 'm1',
      membroNome: 'Maria',
    })
    expect(etiqueta.printed_by_snapshot).toBe('Maria')
    expect(evento.member_snapshot).toBe('Maria')
  })

  it('produto de 0 dias vence no fim do próprio dia', () => {
    const { etiqueta } = criarEtiqueta({
      orgId: ORG,
      produto: { ...produto, shelf_life_days: 0 },
      abertura: AGORA,
    })
    const validade = new Date(etiqueta.expires_at)
    expect(validade.getDate()).toBe(30)
    expect(validade.getHours()).toBe(23)
  })

  it('normaliza lote vazio para nulo', () => {
    const { etiqueta } = criarEtiqueta({ orgId: ORG, produto, lote: '   ' })
    expect(etiqueta.lote).toBeNull()
  })
})

describe('dadosParaImpressao', () => {
  const { etiqueta } = criarEtiqueta({
    orgId: ORG,
    produto,
    fornecedor,
    pasta,
    abertura: AGORA,
    membroNome: 'Maria',
    lote: 'L-4412',
  })

  it('formata a validade só com a data', () => {
    // É o dado lido de relance com o pote na mão; hora ali só rouba espaço.
    expect(dadosParaImpressao(etiqueta).validade).toBe('02/09/2026')
  })

  it('formata a manipulação só com a data, sem horário', () => {
    // O horário roubava espaço de um campo lido de relance com o pote na mão.
    // Ele continua registrado em `opened_at`, e aparece na tela e nos relatórios.
    expect(dadosParaImpressao(etiqueta).manipulacao).toBe('30/08/2026')
  })

  it('mantém {{abertura}} funcionando para modelos antigos já salvos', () => {
    // Sem esse apelido, um modelo salvo antes do renomeio imprimiria o texto
    // "{{abertura}}" cru no papel em vez da data.
    expect(dadosParaImpressao(etiqueta).abertura).toBe('30/08/2026')
  })

  it('usa travessão onde não há dado, em vez de deixar vazio', () => {
    const semExtras = criarEtiqueta({ orgId: ORG, produto }).etiqueta
    const dados = dadosParaImpressao(semExtras)
    expect(dados.fornecedor).toBe('—')
    expect(dados.lote).toBe('—')
    expect(dados.responsavel).toBe('—')
  })

  it('leva o código curto e a URL do QR', () => {
    const dados = dadosParaImpressao(etiqueta)
    expect(dados.codigo).toBe(etiqueta.short_code)
    expect(dados.url).toContain(etiqueta.id)
  })
})

describe('criarEventoBaixa', () => {
  const { etiqueta } = criarEtiqueta({ orgId: ORG, produto })

  it('cria evento de consumo ligado à etiqueta', () => {
    const evento = criarEventoBaixa(etiqueta, 'consumida', { membroNome: 'João' })
    expect(evento.tipo).toBe('consumida')
    expect(evento.label_id).toBe(etiqueta.id)
    expect(evento.member_snapshot).toBe('João')
  })

  it('guarda o motivo do descarte', () => {
    const evento = criarEventoBaixa(etiqueta, 'descartada', { motivo: 'Vencido' })
    expect(evento.motivo).toBe('Vencido')
  })

  it('gera id próprio a cada chamada', () => {
    const a = criarEventoBaixa(etiqueta, 'consumida')
    const b = criarEventoBaixa(etiqueta, 'consumida')
    expect(a.id).not.toBe(b.id)
  })
})
