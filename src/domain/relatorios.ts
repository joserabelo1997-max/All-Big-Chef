import type { Etiqueta, EventoEtiqueta } from './types'

/**
 * Cálculo dos relatórios.
 *
 * Funções puras sobre etiquetas e eventos, separadas da tela para poderem ser
 * testadas — números de desperdício viram decisão de compra, e um erro aqui
 * custa dinheiro ou faz a cozinha comprar de menos.
 */

export interface Periodo {
  de: Date
  ate: Date
}

export interface ResumoOperacao {
  impressas: number
  consumidas: number
  descartadas: number
  ativas: number
  /**
   * Percentual do que foi *finalizado* (consumido + descartado) que acabou
   * consumido.
   *
   * Calculado só sobre o que já teve desfecho, e não sobre o total impresso.
   * Incluir as etiquetas ainda ativas puniria a cozinha por ter estoque
   * saudável na geladeira — o aproveitamento cairia sempre que se etiquetasse
   * mais, o que é exatamente o comportamento que se quer incentivar.
   */
  aproveitamento: number | null
}

export interface LinhaDesperdicio {
  chave: string
  rotulo: string
  descartadas: number
  consumidas: number
  /** Fração descartada sobre o total finalizado. */
  taxaDescarte: number
}

function dentro(iso: string, periodo: Periodo): boolean {
  const momento = new Date(iso).getTime()
  return momento >= periodo.de.getTime() && momento <= periodo.ate.getTime()
}

export function resumir(
  etiquetas: Etiqueta[],
  eventos: EventoEtiqueta[],
  periodo: Periodo,
): ResumoOperacao {
  const impressas = etiquetas.filter((e) => dentro(e.printed_at, periodo)).length

  // Contamos pelos EVENTOS, não pelo status atual da etiqueta: o status diz o
  // que a etiqueta é hoje, e o relatório precisa do que aconteceu no período.
  const noPeriodo = eventos.filter((e) => dentro(e.ocorrido_em, periodo))
  const consumidas = noPeriodo.filter((e) => e.tipo === 'consumida').length
  const descartadas = noPeriodo.filter((e) => e.tipo === 'descartada').length

  const finalizadas = consumidas + descartadas

  return {
    impressas,
    consumidas,
    descartadas,
    ativas: etiquetas.filter((e) => e.status === 'ativa' && !e.deleted_at).length,
    aproveitamento: finalizadas > 0 ? consumidas / finalizadas : null,
  }
}

/**
 * Agrupa o desfecho das etiquetas por produto ou por pasta.
 *
 * Usa os snapshots gravados na etiqueta, e não o cadastro atual: se um produto
 * foi renomeado no meio do período, o relatório precisa refletir o que estava
 * escrito nas etiquetas daquela época.
 */
export function agruparDesperdicio(
  etiquetas: Etiqueta[],
  eventos: EventoEtiqueta[],
  periodo: Periodo,
  por: 'produto' | 'pasta',
): LinhaDesperdicio[] {
  const porId = new Map(etiquetas.map((e) => [e.id, e]))
  const acumulado = new Map<string, { descartadas: number; consumidas: number }>()

  for (const evento of eventos) {
    if (evento.tipo !== 'consumida' && evento.tipo !== 'descartada') continue
    if (!dentro(evento.ocorrido_em, periodo)) continue

    const etiqueta = porId.get(evento.label_id)
    if (!etiqueta) continue

    const chave =
      por === 'produto'
        ? etiqueta.produto_snapshot
        : (etiqueta.pasta_snapshot ?? 'Sem pasta')

    const atual = acumulado.get(chave) ?? { descartadas: 0, consumidas: 0 }
    if (evento.tipo === 'descartada') atual.descartadas++
    else atual.consumidas++
    acumulado.set(chave, atual)
  }

  return [...acumulado.entries()]
    .map(([chave, valores]) => {
      const total = valores.descartadas + valores.consumidas
      return {
        chave,
        rotulo: chave,
        descartadas: valores.descartadas,
        consumidas: valores.consumidas,
        taxaDescarte: total > 0 ? valores.descartadas / total : 0,
      }
    })
    // Mais descartes primeiro: o relatório existe para apontar onde se perde
    // comida, então o pior caso tem que estar no topo, não escondido na ordem
    // alfabética.
    .sort((a, b) => b.descartadas - a.descartadas || b.taxaDescarte - a.taxaDescarte)
}

/** Períodos prontos, cobrindo o dia inteiro nas duas pontas. */
export function ultimosDias(dias: number): Periodo {
  const ate = new Date()
  ate.setHours(23, 59, 59, 999)
  const de = new Date()
  de.setDate(de.getDate() - dias + 1)
  de.setHours(0, 0, 0, 0)
  return { de, ate }
}

/**
 * Monta um CSV.
 *
 * Usa ponto e vírgula, e não vírgula: o Excel em português abre CSV separado
 * por vírgula como uma coluna só, e o relatório existe justamente para ser
 * aberto e conferido pela vigilância sanitária ou pela contabilidade.
 */
export function montarCsv(cabecalho: string[], linhas: Array<Array<string | number>>): string {
  const escapar = (valor: string | number): string => {
    const texto = String(valor)
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }

  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(escapar).join(';'))
    .join('\r\n')

  // BOM para que o Excel reconheça UTF-8 e não estrague a acentuação — sem ele,
  // "Laticínios" abre como "LaticiÌ81nios".
  return `﻿${corpo}`
}
