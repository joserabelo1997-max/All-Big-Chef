import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { situacaoDeEstoque } from '../domain/estoque'
import type { Produto } from '../domain/types'
import { db } from '../lib/db'
import { useSessao } from '../lib/useSessao'

/**
 * Lista do estoque.
 *
 * Ordenada por urgência, e não por nome: o que está abaixo do mínimo vem
 * primeiro, porque a pergunta que traz alguém a esta tela é "o que preciso
 * comprar?", não "quanto tem de farinha?". Quem quer o segundo usa a busca.
 */
export function Estoque() {
  const { orgId, carregando } = useSessao()
  const [busca, setBusca] = useState('')
  const [soFaltando, setSoFaltando] = useState(false)

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos.filter((p) => !p.deleted_at && p.ativo && p.controla_estoque)
    },
    [orgId],
    [],
  )

  const { listados, faltando } = useMemo(() => {
    const avaliados = produtos.map((produto) => ({
      produto,
      situacao: situacaoDeEstoque(produto),
    }))

    const alvo = semAcento(busca)
    const listados = avaliados
      .filter(({ produto }) => !alvo || semAcento(produto.nome).includes(alvo))
      .filter(({ situacao }) => !soFaltando || situacao.abaixo)
      .sort(
        (a, b) =>
          Number(b.situacao.abaixo) - Number(a.situacao.abaixo) ||
          a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'),
      )

    return { listados, faltando: avaliados.filter((a) => a.situacao.abaixo).length }
  }, [produtos, busca, soFaltando])

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-sm text-slate-500">
          {produtos.length} {produtos.length === 1 ? 'item controlado' : 'itens controlados'}
        </p>
      </header>

      {faltando > 0 && (
        <Link to="/estoque/repor" className="cartao mb-4 flex items-center gap-3 border-amber-300 bg-amber-50 p-4">
          <span aria-hidden className="text-2xl">
            🛒
          </span>
          <span className="flex-1">
            <span className="block font-bold text-amber-900">
              {faltando} {faltando === 1 ? 'item' : 'itens'} no mínimo ou abaixo
            </span>
            <span className="block text-sm text-amber-800">Montar o pedido</span>
          </span>
          <span aria-hidden className="text-amber-400">
            ›
          </span>
        </Link>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link to="/estoque/requisicoes" className="btn-secundario">
          📋 Requisições
        </Link>
        <Link to="/estoque/contagem" className="btn-secundario">
          🔢 Contagem
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          className="campo flex-1"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no estoque…"
          aria-label="Buscar no estoque"
        />
        <button
          className={[
            'min-h-toque shrink-0 rounded-xl border-2 px-4 font-semibold transition',
            soFaltando ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white',
          ].join(' ')}
          onClick={() => setSoFaltando((s) => !s)}
          aria-pressed={soFaltando}
        >
          Faltando
        </button>
      </div>

      {listados.length === 0 ? (
        <div className="cartao p-6 text-center">
          <p className="text-slate-500">
            {produtos.length === 0
              ? 'Nenhum produto controla estoque ainda. Marque “Controla estoque” no cadastro do produto.'
              : busca
                ? `Nenhum item com "${busca}".`
                : 'Nada abaixo do mínimo. 👍'}
          </p>
          <Link to="/produtos/novo" className="btn-primario mt-4 inline-flex">
            + Cadastrar produto
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {listados.map(({ produto, situacao }) => (
            <li key={produto.id}>
              <Link
                to={`/estoque/${produto.id}`}
                className={[
                  'cartao flex items-center gap-3 p-4',
                  situacao.abaixo ? 'border-amber-300' : '',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{produto.nome}</span>
                  <span className="block text-sm text-slate-500">
                    <Saldos produto={produto} />
                  </span>
                </span>
                {situacao.abaixo && (
                  <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                    repor
                  </span>
                )}
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

/** Só as unidades que o produto realmente acompanha. */
function Saldos({ produto }: { produto: Produto }) {
  const partes: string[] = []
  if (produto.unidade_estoque !== 'un') {
    partes.push(`${formatar(produto.saldo_kg)} kg`)
  }
  if (produto.unidade_estoque !== 'kg') {
    partes.push(`${formatar(produto.saldo_un)} un`)
  }
  return <>{partes.join(' · ')}</>
}

/** Sem casas decimais quando o número é inteiro: "4 un" lê melhor que "4,000 un". */
export function formatar(valor: number): string {
  return Number.isInteger(valor)
    ? String(valor)
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
