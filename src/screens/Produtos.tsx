import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { db } from '../lib/db'
import { useCarrinho } from '../lib/useCarrinho'
import { useSessao } from '../lib/useSessao'
import { StepperQuantidade } from '../ui/StepperQuantidade'

/**
 * Lista de produtos — e o ponto de partida da impressão.
 *
 * Não existe mais uma tela separada só para imprimir. Aqui a pessoa soma as
 * quantidades direto nos cards, troca a busca, entra em outra pasta, soma mais,
 * e o carrinho acompanha tudo isso sem se perder. Foi para permitir esse gesto
 * que o carrinho virou estado global (ver `lib/carrinho.ts`).
 *
 * A busca ignora acento de propósito: quem procura "pessego" com pressa precisa
 * achar "Pêssego". Exigir a digitação exata do acento no meio do serviço é
 * atrito sem contrapartida.
 */
export function Produtos() {
  const { orgId, carregando } = useSessao()
  const [params] = useSearchParams()
  const pastaId = params.get('pasta')
  const [busca, setBusca] = useState('')

  const { quantidadeDe, somarItem } = useCarrinho()

  // Trocar de pasta limpa a busca. Sem isso, entrar em "Carnes" com "pescada"
  // ainda digitado mostra "nenhum produto encontrado", e a pasta parece vazia —
  // o filtro invisível fica no campo, que rolou para fora da tela.
  useEffect(() => setBusca(''), [pastaId])

  const pasta = useLiveQuery(
    async () => (pastaId ? db.folders.get(pastaId) : undefined),
    [pastaId],
  )

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos
        .filter((p) => !p.deleted_at && p.ativo)
        // Só o que gera etiqueta: papel toalha é controlado no estoque e não
        // tem o que fazer aqui. `!== false` porque produto cadastrado antes das
        // facetas não tem o campo, e todos eles eram de etiqueta.
        .filter((p) => p.gera_etiqueta !== false)
        .filter((p) => !pastaId || p.folder_id === pastaId)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId, pastaId],
    [],
  )

  const filtrados = useMemo(() => {
    const alvo = semAcento(busca)
    if (!alvo) return produtos
    return produtos.filter((p) => semAcento(p.nome).includes(alvo))
  }, [produtos, busca])

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{pasta?.nome ?? 'Todos os produtos'}</h1>
        <p className="text-sm text-slate-500">
          Toque no <span className="font-bold">+</span> para somar etiquetas
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        <input
          className="campo flex-1"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
        />
        {busca && (
          <button
            className="btn-secundario px-4"
            onClick={() => setBusca('')}
            aria-label="Limpar busca"
          >
            Limpar
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="cartao p-6 text-center">
          <p className="text-slate-500">
            {busca
              ? `Nenhum produto com "${busca}".`
              : 'Nenhum produto cadastrado nesta pasta ainda.'}
          </p>
          <Link
            to={pastaId ? `/produtos/novo?pasta=${pastaId}` : '/produtos/novo'}
            className="btn-primario mt-4 inline-flex"
          >
            + Cadastrar produto
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {filtrados.map((produto) => {
            const quantidade = quantidadeDe(produto.id)
            return (
              <li
                key={produto.id}
                className={[
                  'cartao flex items-center gap-3 p-3 transition',
                  quantidade > 0 ? 'border-slate-900 ring-1 ring-slate-900' : '',
                ].join(' ')}
              >
                {/* O nome leva à edição; o stepper fica fora do link para que
                    somar quantidade nunca navegue por engano. */}
                <Link to={`/produtos/${produto.id}`} className="min-w-0 flex-1 py-1">
                  <span className="block truncate font-semibold">{produto.nome}</span>
                  <span className="block text-sm text-slate-500">
                    {produto.shelf_life_days}{' '}
                    {produto.shelf_life_days === 1 ? 'dia' : 'dias'}
                  </span>
                </Link>

                <StepperQuantidade
                  quantidade={quantidade}
                  rotulo={produto.nome}
                  aoSomar={(delta) => somarItem(produto.id, delta)}
                />
              </li>
            )
          })}
        </ul>
      )}

      {filtrados.length > 0 && (
        <Link
          to={pastaId ? `/produtos/novo?pasta=${pastaId}` : '/produtos/novo'}
          className="btn-secundario mt-4 w-full"
        >
          + Cadastrar produto
        </Link>
      )}
    </div>
  )
}

/**
 * Remove acentos para comparação de busca.
 *
 * NFD separa a letra do sinal diacrítico; a faixa ̀-ͯ cobre esses sinais
 * combinantes, então funciona para todo o português sem tabela de substituição.
 */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
