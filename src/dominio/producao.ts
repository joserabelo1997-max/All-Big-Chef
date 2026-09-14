import type { Contexto, NoArvore } from './arvore'
import { percorrer } from './arvore'
import type { Unidade, Uuid } from './tipos'
import { tentarConverter } from './unidades'

/**
 * A lista de produção sai da mesma árvore das receitas, lida de outro jeito:
 * em vez de somar custo, marca o que está feito.
 *
 * A tarefa é a FICHA, não a posição na árvore. Se o mesmo fundo entra em três
 * pratos, fazer o fundo é um trabalho só — e é por isso que a visão consolidada
 * existe: a visão por prato mostra a estrutura, mas quem está produzindo precisa
 * saber quantos litros de fundo fazer no total, uma vez.
 */

export interface TarefaConsolidada {
  fichaId: Uuid
  nome: string
  tipo: 'prato' | 'preparo'
  /** Total a produzir, na unidade de rendimento da própria ficha. */
  quantidade: number
  unidade: Unidade
  /** Em que pratos do serviço este preparo entra. */
  usadoEm: string[]
  /**
   * Quão fundo o item está na árvore. Ordena a lista: o que está mais embaixo
   * precisa estar pronto antes — não se monta o prato sem o molho, nem o molho
   * sem o fundo.
   */
  profundidade: number
  custo: number | null
  /** Alguma soma não fechou por diferença de unidade. */
  incerta: boolean
}

export interface RaizDeProducao {
  rotulo: string
  no: NoArvore
}

export function consolidarProducao(
  raizes: RaizDeProducao[],
  ctx: Contexto,
): TarefaConsolidada[] {
  const acumulado = new Map<Uuid, TarefaConsolidada>()

  for (const { rotulo, no } of raizes) {
    percorrer(no, (atual) => {
      if (atual.tipo !== 'ficha') return
      const ficha = ctx.fichas.get(atual.refId)
      if (!ficha) return

      // Cada nó traz a quantidade na unidade pedida por quem o chamou; para somar
      // é preciso trazer tudo para a unidade em que a ficha rende.
      const convertida = tentarConverter(atual.quantidade, atual.unidade, ficha.rendimento_unidade)
      const existente = acumulado.get(ficha.id)

      if (existente) {
        if (convertida.ok) existente.quantidade += convertida.valor
        else existente.incerta = true
        existente.custo =
          existente.custo === null || atual.custo === null ? null : existente.custo + atual.custo
        existente.profundidade = Math.max(existente.profundidade, atual.profundidade)
        if (!existente.usadoEm.includes(rotulo)) existente.usadoEm.push(rotulo)
        return
      }

      acumulado.set(ficha.id, {
        fichaId: ficha.id,
        nome: ficha.nome,
        tipo: ficha.tipo,
        quantidade: convertida.ok ? convertida.valor : atual.quantidade,
        unidade: convertida.ok ? ficha.rendimento_unidade : atual.unidade,
        usadoEm: [rotulo],
        profundidade: atual.profundidade,
        custo: atual.custo,
        incerta: !convertida.ok,
      })
    })
  }

  return [...acumulado.values()].sort(
    // Mais fundo primeiro: fundo antes do molho, molho antes da montagem.
    (a, b) => b.profundidade - a.profundidade || a.nome.localeCompare(b.nome, 'pt-BR'),
  )
}

export interface Progresso {
  feitos: number
  total: number
  fracao: number
}

export function calcularProgresso(
  fichaIds: Uuid[],
  statusPorFicha: Map<Uuid, string>,
): Progresso {
  const total = fichaIds.length
  const feitos = fichaIds.filter((id) => statusPorFicha.get(id) === 'feito').length
  return { feitos, total, fracao: total > 0 ? feitos / total : 0 }
}
