import { describe, expect, it } from 'vitest'

import { calcularValidade, classificar, compararUrgencia } from './expiry'

/** Data local, evitando a armadilha de `new Date('2026-08-30')` virar UTC. */
function em(ano: number, mes: number, dia: number, hora = 12, minuto = 0): Date {
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0)
}

describe('calcularValidade', () => {
  it('soma os dias de validade à data de abertura', () => {
    const validade = calcularValidade(em(2026, 8, 30), 3)
    expect(validade.getDate()).toBe(2)
    expect(validade.getMonth()).toBe(8) // setembro
  })

  it('termina no FIM do dia, não no horário da abertura', () => {
    // Se o papel diz 02/09, o produto serve o dia 02 inteiro. Encerrar às 14h
    // faria a cozinha descartar comida boa numa tarde de serviço.
    const validade = calcularValidade(em(2026, 8, 30, 14, 20), 3)
    expect(validade.getHours()).toBe(23)
    expect(validade.getMinutes()).toBe(59)
  })

  it('trata validade de 0 dias como o fim do próprio dia', () => {
    const validade = calcularValidade(em(2026, 8, 30, 9), 0)
    expect(validade.getDate()).toBe(30)
    expect(validade.getHours()).toBe(23)
  })

  it('atravessa a virada de mês', () => {
    const validade = calcularValidade(em(2026, 8, 30), 5)
    expect(validade.getDate()).toBe(4)
    expect(validade.getMonth()).toBe(8)
  })

  it('atravessa a virada de ano', () => {
    const validade = calcularValidade(em(2026, 12, 30), 3)
    expect(validade.getFullYear()).toBe(2027)
    expect(validade.getDate()).toBe(2)
  })

  it('respeita ano bissexto', () => {
    const validade = calcularValidade(em(2028, 2, 28), 1)
    expect(validade.getDate()).toBe(29)
    expect(validade.getMonth()).toBe(1)
  })
})

describe('classificar', () => {
  const agora = em(2026, 8, 30, 10)

  it('marca como vencido o que passou da data', () => {
    const s = classificar(em(2026, 8, 28, 23, 59), agora)
    expect(s.nivel).toBe('vencido')
    expect(s.descricao).toBe('venceu há 2 dias')
  })

  it('diz "venceu ontem" para o dia anterior', () => {
    expect(classificar(em(2026, 8, 29, 23, 59), agora).descricao).toBe('venceu ontem')
  })

  it('marca como "vence hoje" o que expira ainda hoje', () => {
    const s = classificar(em(2026, 8, 30, 23, 59), agora)
    expect(s.nivel).toBe('hoje')
    expect(s.descricao).toBe('vence hoje')
  })

  it('NÃO marca como vencido às 23h do próprio dia da validade', () => {
    // A comida ainda serve. Marcar como vencida aqui faz jogar fora produto bom.
    const s = classificar(em(2026, 8, 30, 23, 59), em(2026, 8, 30, 23, 0))
    expect(s.nivel).toBe('hoje')
  })

  it('marca como vencido um minuto após o fim do dia da validade', () => {
    const s = classificar(em(2026, 8, 30, 23, 59), em(2026, 8, 31, 0, 1))
    expect(s.nivel).toBe('vencido')
  })

  it('raciocina em dias de calendário, não em janelas de 24 horas', () => {
    // Aberto às 22h de domingo com 1 dia de validade: vence na segunda. Quem
    // abre a geladeira segunda de manhã precisa ver "vence hoje" — não
    // "faltam 12 horas", que é o que uma subtração de timestamps diria.
    const validade = calcularValidade(em(2026, 8, 30, 22), 1)
    const segundaDeManha = em(2026, 8, 31, 7)
    expect(classificar(validade, segundaDeManha).nivel).toBe('hoje')
  })

  it('marca atenção dentro do limiar configurado', () => {
    const s = classificar(em(2026, 8, 31, 23, 59), agora, { diasAntes: 2 })
    expect(s.nivel).toBe('atencao')
    expect(s.descricao).toBe('vence amanhã')
  })

  it('diz "vence em N dias" no plural', () => {
    const s = classificar(em(2026, 9, 2, 23, 59), agora, { diasAntes: 3 })
    expect(s.nivel).toBe('atencao')
    expect(s.descricao).toBe('vence em 3 dias')
  })

  it('fica em ok fora do limiar', () => {
    const s = classificar(em(2026, 9, 10, 23, 59), agora, { diasAntes: 2 })
    expect(s.nivel).toBe('ok')
  })

  it('respeita um limiar maior', () => {
    const validade = em(2026, 9, 4, 23, 59)
    expect(classificar(validade, agora, { diasAntes: 2 }).nivel).toBe('ok')
    expect(classificar(validade, agora, { diasAntes: 7 }).nivel).toBe('atencao')
  })

  it('aceita data em texto ISO, como vem do banco', () => {
    const s = classificar(em(2026, 8, 30, 23, 59).toISOString(), agora)
    expect(s.nivel).toBe('hoje')
  })

  it('trata limiar zero como só hoje e vencido', () => {
    expect(classificar(em(2026, 8, 31, 23, 59), agora, { diasAntes: 0 }).nivel).toBe('ok')
    expect(classificar(em(2026, 8, 30, 23, 59), agora, { diasAntes: 0 }).nivel).toBe('hoje')
  })
})

describe('compararUrgencia', () => {
  const agora = em(2026, 8, 30, 10)

  it('coloca o que exige ação primeiro', () => {
    const situacoes = [
      classificar(em(2026, 9, 20, 23, 59), agora), // ok
      classificar(em(2026, 8, 25, 23, 59), agora), // vencido
      classificar(em(2026, 8, 30, 23, 59), agora), // hoje
      classificar(em(2026, 8, 31, 23, 59), agora), // atenção
    ]
    const ordenado = [...situacoes].sort(compararUrgencia).map((s) => s.nivel)
    expect(ordenado).toEqual(['vencido', 'hoje', 'atencao', 'ok'])
  })

  it('dentro do mesmo nível, o mais atrasado vem primeiro', () => {
    const a = classificar(em(2026, 8, 20, 23, 59), agora)
    const b = classificar(em(2026, 8, 28, 23, 59), agora)
    expect([b, a].sort(compararUrgencia)[0]).toBe(a)
  })
})
