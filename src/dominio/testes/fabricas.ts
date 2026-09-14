import type { Ficha, FichaComponente, Insumo, TipoFicha, Unidade, Uuid } from '../tipos'

/**
 * Fábricas para os testes. Só existem para que cada teste escreva apenas o que
 * importa para ele, em vez de repetir quinze campos que não dizem nada.
 */

const DONO = 'dono-teste'
const ESPACO = 'espaco-teste'
const AGORA = '2026-09-14T12:00:00.000Z'

export function insumo(id: Uuid, parcial: Partial<Insumo> = {}): Insumo {
  return {
    id,
    dono_id: DONO,
    espaco_id: ESPACO,
    atualizado_em: AGORA,
    apagado_em: null,
    nome: id,
    categoria: 'Geral',
    fornecedor: '',
    quantidade_compra: 1,
    unidade_compra: 'kg',
    preco_compra: 10,
    unidade_uso: 'g',
    fator_correcao: 1,
    observacao: '',
    ...parcial,
  }
}

export function ficha(id: Uuid, tipo: TipoFicha, parcial: Partial<Ficha> = {}): Ficha {
  return {
    id,
    dono_id: DONO,
    espaco_id: ESPACO,
    atualizado_em: AGORA,
    apagado_em: null,
    tipo,
    nome: id,
    categoria: '',
    rendimento_quantidade: 1000,
    rendimento_unidade: 'g',
    porcoes: 10,
    modo_preparo: [],
    tempo_minutos: null,
    alergenicos: [],
    observacao: '',
    ...parcial,
  }
}

let sequencia = 0

export function comInsumo(
  fichaId: Uuid,
  insumoId: Uuid,
  quantidade: number,
  unidade: Unidade,
  ordem = 0,
): FichaComponente {
  return componente(fichaId, { insumo_id: insumoId, quantidade, unidade, ordem })
}

export function comFicha(
  fichaId: Uuid,
  filhaId: Uuid,
  quantidade: number,
  unidade: Unidade,
  ordem = 0,
): FichaComponente {
  return componente(fichaId, { ficha_filha_id: filhaId, quantidade, unidade, ordem })
}

function componente(fichaId: Uuid, parcial: Partial<FichaComponente>): FichaComponente {
  sequencia += 1
  return {
    id: `comp-${sequencia}`,
    dono_id: DONO,
    espaco_id: ESPACO,
    atualizado_em: AGORA,
    apagado_em: null,
    ficha_id: fichaId,
    insumo_id: null,
    ficha_filha_id: null,
    quantidade: 0,
    unidade: 'g',
    ordem: 0,
    observacao: '',
    ...parcial,
  }
}
