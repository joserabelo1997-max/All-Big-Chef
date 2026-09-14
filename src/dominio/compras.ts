import type { NoArvore } from './arvore'
import { percorrer } from './arvore'
import type { Insumo, Unidade, Uuid } from './tipos'
import { formatarMedida, formatarReais, tentarConverter } from './unidades'

/**
 * A lista de compras não é um cadastro novo: é a mesma árvore das receitas
 * achatada até as folhas. Escrever a ficha uma vez já produz a lista.
 */

export interface LinhaCompra {
  insumoId: Uuid
  nome: string
  categoria: string
  fornecedor: string
  /** Soma do que precisa comprar (líquido × fator de correção), na unidade de uso. */
  quantidadeBruta: number
  unidadeUso: Unidade
  /** A mesma quantidade na unidade em que você compra — é assim que se pede ao fornecedor. */
  quantidadeCompra: number | null
  unidadeCompra: Unidade
  custo: number | null
  /** Em que pratos esse insumo entra, para você saber o que cai se cortar um item. */
  usadoEm: string[]
}

export interface RaizDeCompra {
  /** Nome que aparece em `usadoEm`. Normalmente o prato. */
  rotulo: string
  no: NoArvore
}

/**
 * Percorre as árvores de todos os pratos do menu e acumula por insumo. O mesmo
 * alho que aparece em seis pratos vira uma linha só, com a soma — que é como o
 * fornecedor precisa receber o pedido.
 */
export function achatarParaInsumos(
  raizes: RaizDeCompra[],
  insumos: Map<Uuid, Insumo>,
): LinhaCompra[] {
  const acumulado = new Map<Uuid, LinhaCompra>()

  for (const { rotulo, no } of raizes) {
    percorrer(no, (atual) => {
      if (atual.tipo !== 'insumo') return
      const insumo = insumos.get(atual.refId)
      if (!insumo) return

      const bruta = atual.quantidadeBruta ?? atual.quantidade
      const existente = acumulado.get(atual.refId)

      if (existente) {
        existente.quantidadeBruta += bruta
        existente.custo =
          existente.custo === null || atual.custo === null ? null : existente.custo + atual.custo
        if (!existente.usadoEm.includes(rotulo)) existente.usadoEm.push(rotulo)
        return
      }

      acumulado.set(atual.refId, {
        insumoId: insumo.id,
        nome: insumo.nome,
        categoria: insumo.categoria || 'Sem categoria',
        fornecedor: insumo.fornecedor || 'Sem fornecedor',
        quantidadeBruta: bruta,
        unidadeUso: insumo.unidade_uso,
        quantidadeCompra: null,
        unidadeCompra: insumo.unidade_compra,
        custo: atual.custo,
        usadoEm: [rotulo],
      })
    })
  }

  // A conversão para a unidade de compra só faz sentido no fim, com a soma fechada.
  for (const linha of acumulado.values()) {
    const convertida = tentarConverter(linha.quantidadeBruta, linha.unidadeUso, linha.unidadeCompra)
    linha.quantidadeCompra = convertida.ok ? convertida.valor : null
  }

  return [...acumulado.values()].sort(
    (a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
  )
}

export type ChaveAgrupamento = 'categoria' | 'fornecedor'

export interface Grupo {
  titulo: string
  linhas: LinhaCompra[]
  custo: number | null
}

export function agrupar(linhas: LinhaCompra[], chave: ChaveAgrupamento): Grupo[] {
  const mapa = new Map<string, LinhaCompra[]>()
  for (const linha of linhas) {
    const titulo = linha[chave]
    const lista = mapa.get(titulo)
    if (lista) lista.push(linha)
    else mapa.set(titulo, [linha])
  }

  return [...mapa.entries()]
    .map(([titulo, itens]) => ({
      titulo,
      linhas: itens,
      custo: itens.some((i) => i.custo === null)
        ? null
        : itens.reduce((s, i) => s + (i.custo ?? 0), 0),
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function custoTotal(linhas: LinhaCompra[]): number | null {
  if (linhas.some((l) => l.custo === null)) return null
  return linhas.reduce((s, l) => s + (l.custo ?? 0), 0)
}

/**
 * A lista em texto puro, para colar no WhatsApp do fornecedor. Sem emoji e sem
 * enfeite: o que chega do outro lado precisa ser lido rápido e sem ambiguidade.
 */
export function listaEmTexto(
  grupos: Grupo[],
  opcoes: { titulo: string; incluirCusto: boolean },
): string {
  const linhas: string[] = [opcoes.titulo, '']

  for (const grupo of grupos) {
    linhas.push(`*${grupo.titulo}*`)
    for (const item of grupo.linhas) {
      const quantidade =
        item.quantidadeCompra !== null
          ? formatarMedida(item.quantidadeCompra, item.unidadeCompra)
          : formatarMedida(item.quantidadeBruta, item.unidadeUso)
      const custo = opcoes.incluirCusto && item.custo !== null ? ` — ${formatarReais(item.custo)}` : ''
      linhas.push(`- ${item.nome}: ${quantidade}${custo}`)
    }
    linhas.push('')
  }

  if (opcoes.incluirCusto) {
    const total = grupos.every((g) => g.custo !== null)
      ? grupos.reduce((s, g) => s + (g.custo ?? 0), 0)
      : null
    if (total !== null) linhas.push(`Total estimado: ${formatarReais(total)}`)
  }

  return linhas.join('\n').trim()
}
