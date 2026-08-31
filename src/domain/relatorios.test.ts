import { describe, expect, it } from 'vitest'

import { agruparDesperdicio, montarCsv, resumir, ultimosDias } from './relatorios'
import type { Etiqueta, EventoEtiqueta } from './types'

const ORG = 'org-1'

function etiqueta(
  id: string,
  produto: string,
  opcoes: Partial<Etiqueta> = {},
): Etiqueta {
  const agora = new Date().toISOString()
  return {
    id,
    org_id: ORG,
    short_code: id.toUpperCase(),
    produto_snapshot: produto,
    pasta_snapshot: 'Laticínios',
    opened_at: agora,
    expires_at: agora,
    printed_at: agora,
    status: 'ativa',
    created_at: agora,
    updated_at: agora,
    ...opcoes,
  }
}

function evento(
  labelId: string,
  tipo: EventoEtiqueta['tipo'],
  quando = new Date(),
): EventoEtiqueta {
  return {
    id: `${labelId}-${tipo}`,
    org_id: ORG,
    label_id: labelId,
    tipo,
    ocorrido_em: quando.toISOString(),
    created_at: quando.toISOString(),
  }
}

const PERIODO = ultimosDias(30)

describe('resumir', () => {
  it('conta impressões, consumos e descartes', () => {
    const etiquetas = [etiqueta('a', 'Leite'), etiqueta('b', 'Queijo'), etiqueta('c', 'Iogurte')]
    const eventos = [
      evento('a', 'impressa'),
      evento('b', 'impressa'),
      evento('a', 'consumida'),
      evento('b', 'descartada'),
    ]

    const resumo = resumir(etiquetas, eventos, PERIODO)
    expect(resumo.impressas).toBe(3)
    expect(resumo.consumidas).toBe(1)
    expect(resumo.descartadas).toBe(1)
  })

  it('calcula aproveitamento só sobre o que teve desfecho', () => {
    // 8 consumidas e 2 descartadas = 80%, independentemente de quantas
    // etiquetas ainda estejam ativas na geladeira.
    const etiquetas = Array.from({ length: 50 }, (_, i) => etiqueta(`e${i}`, 'Leite'))
    const eventos = [
      ...Array.from({ length: 8 }, (_, i) => evento(`e${i}`, 'consumida')),
      ...Array.from({ length: 2 }, (_, i) => evento(`e${i + 8}`, 'descartada')),
    ]

    expect(resumir(etiquetas, eventos, PERIODO).aproveitamento).toBeCloseTo(0.8)
  })

  it('NÃO pune a cozinha por ter estoque ativo', () => {
    // Se as ativas entrassem na conta, etiquetar mais derrubaria o indicador —
    // desincentivando exatamente o comportamento que se quer.
    const poucas = [etiqueta('a', 'Leite'), etiqueta('b', 'Queijo')]
    const muitas = [...poucas, ...Array.from({ length: 100 }, (_, i) => etiqueta(`x${i}`, 'Leite'))]
    const eventos = [evento('a', 'consumida'), evento('b', 'descartada')]

    expect(resumir(poucas, eventos, PERIODO).aproveitamento).toBe(
      resumir(muitas, eventos, PERIODO).aproveitamento,
    )
  })

  it('devolve aproveitamento nulo quando nada foi finalizado', () => {
    // Zero seria mentira: significaria "tudo foi desperdiçado".
    const resumo = resumir([etiqueta('a', 'Leite')], [evento('a', 'impressa')], PERIODO)
    expect(resumo.aproveitamento).toBeNull()
  })

  it('ignora eventos fora do período', () => {
    const antigo = new Date()
    antigo.setDate(antigo.getDate() - 90)

    const resumo = resumir(
      [etiqueta('a', 'Leite')],
      [evento('a', 'consumida', antigo)],
      ultimosDias(7),
    )
    expect(resumo.consumidas).toBe(0)
  })

  it('conta pelos eventos, não pelo status atual', () => {
    // Uma etiqueta consumida há três meses não deve aparecer no relatório da
    // semana só porque o status dela continua "consumida".
    const antigo = new Date()
    antigo.setDate(antigo.getDate() - 90)

    const resumo = resumir(
      [etiqueta('a', 'Leite', { status: 'consumida' })],
      [evento('a', 'consumida', antigo)],
      ultimosDias(7),
    )
    expect(resumo.consumidas).toBe(0)
  })
})

describe('agruparDesperdicio', () => {
  const etiquetas = [
    etiqueta('a', 'Salmão', { pasta_snapshot: 'Pescados' }),
    etiqueta('b', 'Salmão', { pasta_snapshot: 'Pescados' }),
    etiqueta('c', 'Salmão', { pasta_snapshot: 'Pescados' }),
    etiqueta('d', 'Leite', { pasta_snapshot: 'Laticínios' }),
    etiqueta('e', 'Leite', { pasta_snapshot: 'Laticínios' }),
  ]
  const eventos = [
    evento('a', 'descartada'),
    evento('b', 'descartada'),
    evento('c', 'consumida'),
    evento('d', 'consumida'),
    evento('e', 'descartada'),
  ]

  it('agrupa por produto com a taxa de descarte', () => {
    const linhas = agruparDesperdicio(etiquetas, eventos, PERIODO, 'produto')
    const salmao = linhas.find((l) => l.chave === 'Salmão')!
    expect(salmao.descartadas).toBe(2)
    expect(salmao.consumidas).toBe(1)
    expect(salmao.taxaDescarte).toBeCloseTo(2 / 3)
  })

  it('ordena pelo maior desperdício, não em ordem alfabética', () => {
    // O relatório existe para apontar onde se perde comida; o pior caso tem que
    // estar no topo.
    const linhas = agruparDesperdicio(etiquetas, eventos, PERIODO, 'produto')
    expect(linhas[0]!.chave).toBe('Salmão')
  })

  it('agrupa por pasta', () => {
    const linhas = agruparDesperdicio(etiquetas, eventos, PERIODO, 'pasta')
    expect(linhas.map((l) => l.chave).sort()).toEqual(['Laticínios', 'Pescados'])
  })

  it('usa o snapshot, não o cadastro atual', () => {
    // Produto renomeado no meio do período: o relatório reflete o que estava
    // escrito nas etiquetas da época.
    const linhas = agruparDesperdicio(
      [etiqueta('x', 'Creme de leite'), etiqueta('y', 'Creme de leite UHT')],
      [evento('x', 'descartada'), evento('y', 'descartada')],
      PERIODO,
      'produto',
    )
    expect(linhas).toHaveLength(2)
  })

  it('agrupa etiquetas sem pasta sob um rótulo próprio', () => {
    const linhas = agruparDesperdicio(
      [etiqueta('z', 'Avulso', { pasta_snapshot: null })],
      [evento('z', 'descartada')],
      PERIODO,
      'pasta',
    )
    expect(linhas[0]!.chave).toBe('Sem pasta')
  })

  it('ignora evento cuja etiqueta não está na lista', () => {
    const linhas = agruparDesperdicio([], [evento('sumida', 'descartada')], PERIODO, 'produto')
    expect(linhas).toEqual([])
  })
})

describe('montarCsv', () => {
  it('separa por ponto e vírgula, para o Excel em português', () => {
    // Com vírgula, o Excel pt-BR abre tudo numa coluna só.
    const csv = montarCsv(['Produto', 'Descartadas'], [['Leite', 3]])
    expect(csv).toContain('Produto;Descartadas')
    expect(csv).toContain('Leite;3')
  })

  it('começa com BOM para o Excel não estragar a acentuação', () => {
    expect(montarCsv(['Pasta'], [['Laticínios']]).charCodeAt(0)).toBe(0xfeff)
  })

  it('escapa campos com ponto e vírgula, aspas ou quebra de linha', () => {
    const csv = montarCsv(['Obs'], [['Sobra; conferir']])
    expect(csv).toContain('"Sobra; conferir"')

    const comAspas = montarCsv(['Obs'], [['Diz "vencido"']])
    expect(comAspas).toContain('"Diz ""vencido"""')
  })

  it('usa CRLF entre as linhas', () => {
    expect(montarCsv(['A'], [['1'], ['2']])).toContain('1\r\n2')
  })
})

describe('ultimosDias', () => {
  it('cobre o dia inteiro nas duas pontas', () => {
    const periodo = ultimosDias(7)
    expect(periodo.de.getHours()).toBe(0)
    expect(periodo.ate.getHours()).toBe(23)
  })

  it('inclui hoje na contagem', () => {
    // "Últimos 7 dias" são hoje mais os 6 anteriores, não hoje mais 7.
    const periodo = ultimosDias(7)
    const dias = Math.round((periodo.ate.getTime() - periodo.de.getTime()) / 86_400_000)
    expect(dias).toBe(7)
  })
})
