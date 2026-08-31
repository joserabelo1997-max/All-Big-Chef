import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  definir,
  gravarCarrinho,
  lerCarrinho,
  remover,
  somar,
  totalEtiquetas,
  totalProdutos,
  type Carrinho,
} from './carrinho'

interface ContextoCarrinho {
  itens: Carrinho
  quantidadeDe: (produtoId: string) => number
  somarItem: (produtoId: string, delta: number) => void
  definirItem: (produtoId: string, quantidade: number) => void
  removerItem: (produtoId: string) => void
  limpar: () => void
  totalEtiquetas: number
  totalProdutos: number
}

const Contexto = createContext<ContextoCarrinho | null>(null)

/**
 * Disponibiliza o carrinho para o app inteiro.
 *
 * Fica acima do roteador, e não dentro de uma tela, porque o pedido é montado
 * atravessando pastas — trocar de rota não pode zerar o que já foi somado.
 */
export function ProvedorCarrinho({ children }: { children: ReactNode }) {
  // Inicializa lendo o armazenamento: um tablet de cozinha é minimizado o tempo
  // todo, e perder um pedido de 20 itens no meio do pré-preparo seria pior que
  // o problema que o carrinho veio resolver.
  const [itens, setItens] = useState<Carrinho>(lerCarrinho)

  const aplicar = useCallback((proximo: Carrinho) => {
    setItens(proximo)
    gravarCarrinho(proximo)
  }, [])

  const valor = useMemo<ContextoCarrinho>(
    () => ({
      itens,
      quantidadeDe: (produtoId) => itens[produtoId] ?? 0,
      somarItem: (produtoId, delta) => aplicar(somar(itens, produtoId, delta)),
      definirItem: (produtoId, quantidade) => aplicar(definir(itens, produtoId, quantidade)),
      removerItem: (produtoId) => aplicar(remover(itens, produtoId)),
      limpar: () => aplicar({}),
      totalEtiquetas: totalEtiquetas(itens),
      totalProdutos: totalProdutos(itens),
    }),
    [itens, aplicar],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCarrinho(): ContextoCarrinho {
  const contexto = useContext(Contexto)
  if (!contexto) {
    throw new Error('useCarrinho precisa estar dentro de <ProvedorCarrinho>.')
  }
  return contexto
}
