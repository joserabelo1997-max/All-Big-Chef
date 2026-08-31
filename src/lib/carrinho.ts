/**
 * Carrinho de impressão: o que está prestes a ser etiquetado.
 *
 * O estado precisa ser GLOBAL, e não da tela de produtos, porque montar um
 * pedido real atravessa a navegação: "cinco de creme de leite, dez de pescado,
 * cinco de carne" passa por três pastas diferentes. Um estado local morreria na
 * primeira troca de rota, que é justamente o gesto que o fluxo exige.
 *
 * Guarda apenas `produtoId → quantidade`. Os dados do produto são lidos do
 * Dexie na hora de imprimir, para que uma edição de cadastro feita no meio do
 * caminho não deixe o carrinho trabalhando com uma cópia velha.
 */

export type Carrinho = Record<string, number>

const CHAVE = 'abc:carrinho'

/** Limite por item. Passar disso é quase sempre engano de toque repetido. */
export const MAXIMO_POR_PRODUTO = 99

export function lerCarrinho(): Carrinho {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return {}

    const dados = JSON.parse(bruto) as unknown
    if (typeof dados !== 'object' || dados === null) return {}

    // Sanitiza o que voltou: um valor corrompido no armazenamento não pode
    // quebrar a tela de produtos nem mandar lixo para a impressora.
    const limpo: Carrinho = {}
    for (const [id, quantidade] of Object.entries(dados as Record<string, unknown>)) {
      const n = Number(quantidade)
      if (Number.isInteger(n) && n > 0) limpo[id] = Math.min(n, MAXIMO_POR_PRODUTO)
    }
    return limpo
  } catch {
    // Janela privada, cookies bloqueados ou JSON inválido: começar vazio é
    // melhor do que deixar a tela sem carregar.
    return {}
  }
}

export function gravarCarrinho(carrinho: Carrinho): void {
  try {
    if (Object.keys(carrinho).length === 0) localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, JSON.stringify(carrinho))
  } catch {
    // Perder a persistência é aceitável; o carrinho segue vivo em memória
    // enquanto o app estiver aberto.
  }
}

/**
 * Soma (ou subtrai) uma quantidade de um produto.
 *
 * Chegar a zero REMOVE a chave em vez de guardar `0`. Sem isso o carrinho
 * acumularia produtos zerados que contam como "itens" na barra e apareceriam na
 * fila de impressão como linhas vazias.
 */
export function somar(carrinho: Carrinho, produtoId: string, delta: number): Carrinho {
  const atual = carrinho[produtoId] ?? 0
  const novo = Math.min(Math.max(atual + delta, 0), MAXIMO_POR_PRODUTO)

  const copia = { ...carrinho }
  if (novo === 0) delete copia[produtoId]
  else copia[produtoId] = novo
  return copia
}

export function definir(carrinho: Carrinho, produtoId: string, quantidade: number): Carrinho {
  return somar({ ...carrinho, [produtoId]: 0 }, produtoId, quantidade)
}

export function remover(carrinho: Carrinho, produtoId: string): Carrinho {
  const copia = { ...carrinho }
  delete copia[produtoId]
  return copia
}

/** Total de etiquetas que serão impressas — a soma, não a contagem de produtos. */
export function totalEtiquetas(carrinho: Carrinho): number {
  return Object.values(carrinho).reduce((soma, n) => soma + n, 0)
}

export function totalProdutos(carrinho: Carrinho): number {
  return Object.keys(carrinho).length
}
