import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

/**
 * Lista de produtos, opcionalmente filtrada por pasta.
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

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{pasta?.nome ?? 'Todos os produtos'}</h1>
        <p className="text-sm text-slate-500">
          {produtos.length} {produtos.length === 1 ? 'produto' : 'produtos'}
        </p>
      </header>

      <input
        className="campo mb-4"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto…"
        aria-label="Buscar produto"
      />

      <Link
        to={pastaId ? `/produtos/novo?pasta=${pastaId}` : '/produtos/novo'}
        className="btn-primario mb-4 w-full"
      >
        + Novo produto
      </Link>

      {filtrados.length === 0 ? (
        <p className="cartao p-6 text-center text-slate-500">
          {busca
            ? 'Nenhum produto encontrado com esse nome.'
            : 'Nenhum produto cadastrado nesta pasta ainda.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {filtrados.map((produto) => (
            <li key={produto.id}>
              <Link
                to={`/produtos/${produto.id}`}
                className="cartao flex items-center gap-3 p-4"
              >
                <span className="flex-1">
                  <span className="block font-semibold">{produto.nome}</span>
                  <span className="block text-sm text-slate-500">
                    {produto.shelf_life_days}{' '}
                    {produto.shelf_life_days === 1 ? 'dia' : 'dias'} após abertura
                  </span>
                </span>
                <span aria-hidden className="text-slate-300">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Remove acentos para comparação de busca.
 *
 * NFD separa a letra do sinal diacrítico; a faixa ̀-ͯ cobre esses
 * sinais combinantes, então a remoção funciona para todo o português sem
 * precisar de tabela de substituição.
 */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
