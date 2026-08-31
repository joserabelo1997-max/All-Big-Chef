import { describe, expect, it } from 'vitest'

import { ehApenasAviso, pendenciasDeConfiguracao } from './pendencias'
import type { Fornecedor, MembroEquipe } from './types'

const ORG = '11111111-1111-1111-1111-111111111111'
const AGORA = new Date(2026, 7, 30).toISOString()

function fornecedor(extras: Partial<Fornecedor> = {}): Fornecedor {
  return {
    id: 'f1',
    org_id: ORG,
    nome: 'Moinho São João',
    ativo: true,
    created_at: AGORA,
    updated_at: AGORA,
    ...extras,
  }
}

function membro(extras: Partial<MembroEquipe> = {}): MembroEquipe {
  return {
    id: 'm1',
    org_id: ORG,
    nome: 'Chef Ana',
    ativo: true,
    pode_aprovar: false,
    created_at: AGORA,
    updated_at: AGORA,
    ...extras,
  }
}

/** O estado de uma casa com tudo configurado. */
const COMPLETO = {
  fornecedores: [fornecedor({ telefone: '(11) 98765-4321' })],
  equipe: [membro({ pode_aprovar: true })],
  diasFechados: [0, 1],
}

const chaves = (estado: Parameters<typeof pendenciasDeConfiguracao>[0]) =>
  pendenciasDeConfiguracao(estado).map((p) => p.chave)

describe('pendenciasDeConfiguracao', () => {
  it('não sobra nada quando está tudo configurado', () => {
    // É o que faz o cartão sumir sozinho da tela.
    expect(pendenciasDeConfiguracao(COMPLETO)).toEqual([])
  })

  it('acusa as três de uma vez numa instalação nova', () => {
    expect(chaves({ fornecedores: [], equipe: [], diasFechados: [] })).toEqual([
      'telefone',
      'aprovador',
      'dias_fechados',
    ])
  })

  it('acusa só o telefone quando o resto está pronto', () => {
    expect(chaves({ ...COMPLETO, fornecedores: [fornecedor()] })).toEqual(['telefone'])
  })

  it('acusa só o aprovador quando o resto está pronto', () => {
    expect(chaves({ ...COMPLETO, equipe: [membro({ pode_aprovar: false })] })).toEqual([
      'aprovador',
    ])
  })

  it('acusa só os dias fechados quando o resto está pronto', () => {
    expect(chaves({ ...COMPLETO, diasFechados: [] })).toEqual(['dias_fechados'])
  })

  it('basta UM fornecedor com telefone para resolver a pendência', () => {
    // Não é preciso cadastrar o telefone de todos para o módulo funcionar.
    expect(
      chaves({
        ...COMPLETO,
        fornecedores: [
          fornecedor({ id: 'f1' }),
          fornecedor({ id: 'f2', telefone: '11987654321' }),
        ],
      }),
    ).toEqual([])
  })

  it('não aceita telefone quebrado como configurado', () => {
    // Sumir com o cartão e deixar o link do pedido sem funcionar seria pior que
    // avisar. Mesma régua de `telefoneParaWhatsapp`.
    expect(chaves({ ...COMPLETO, fornecedores: [fornecedor({ telefone: '  ' })] })).toEqual([
      'telefone',
    ])
    expect(chaves({ ...COMPLETO, fornecedores: [fornecedor({ telefone: '98765' })] })).toEqual([
      'telefone',
    ])
  })

  it('ignora fornecedor arquivado', () => {
    // Ele não aparece para receber pedido, então o telefone dele não resolve.
    expect(
      chaves({
        ...COMPLETO,
        fornecedores: [
          fornecedor({ telefone: '11987654321', ativo: false }),
          fornecedor({ id: 'f2', telefone: '11987654321', deleted_at: AGORA }),
        ],
      }),
    ).toEqual(['telefone'])
  })

  it('ignora membro desativado', () => {
    // Quem saiu do restaurante não aparece na lista para liberar nada.
    expect(
      chaves({ ...COMPLETO, equipe: [membro({ pode_aprovar: true, ativo: false })] }),
    ).toEqual(['aprovador'])
  })

  it('explica o que deixa de funcionar, não só o que falta', () => {
    // Quem lê precisa saber por que aquilo importa, senão ignora o aviso.
    for (const p of pendenciasDeConfiguracao({ fornecedores: [], equipe: [], diasFechados: [] })) {
      expect(p.consequencia.length).toBeGreaterThan(20)
      expect(p.destino.startsWith('/config/')).toBe(true)
    }
  })
})

describe('ehApenasAviso', () => {
  it('trata dias fechados como aviso, e não como cobrança', () => {
    // Casa que abre todo dia não tem o que marcar; cobrar seria alarme falso.
    expect(ehApenasAviso('dias_fechados')).toBe(true)
  })

  it('trata as outras duas como pendência de verdade', () => {
    expect(ehApenasAviso('telefone')).toBe(false)
    expect(ehApenasAviso('aprovador')).toBe(false)
  })
})
