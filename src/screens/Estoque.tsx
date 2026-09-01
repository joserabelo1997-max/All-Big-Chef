import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { situacaoDeEstoque } from '../domain/estoque'
import type { Produto } from '../domain/types'
import { formatarCodigoBarras } from '../lib/codigoBarras'
import { db, salvarESincronizar } from '../lib/db'
import { useSessao } from '../lib/useSessao'
import { PendenciasEstoque } from '../ui/PendenciasEstoque'

/**
 * Lista do estoque.
 *
 * Ordenada por urgência, e não por nome: o que está abaixo do mínimo vem
 * primeiro, porque a pergunta que traz alguém a esta tela é "o que preciso
 * comprar?", não "quanto tem de farinha?". Quem quer o segundo usa a busca.
 */
export function Estoque() {
  const { orgId, carregando } = useSessao()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [soFaltando, setSoFaltando] = useState(false)

  // Código de barras bipado que ainda não é de ninguém. O leitor manda para cá
  // em vez de para uma tela de escolha própria: a lista e a busca do estoque já
  // são o jeito de achar um produto, e duplicá-las seria manter duas.
  const vincular = params.get('vincular')

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      const vivos = todos.filter((p) => !p.deleted_at && p.ativo)
      // Vinculando, mostra TODOS os produtos: o item que a pessoa acabou de
      // bipar pode ainda não controlar estoque, e escondê-lo deixaria ela presa
      // sem entender por quê.
      return vincular ? vivos : vivos.filter((p) => p.controla_estoque)
    },
    [orgId, vincular],
    [],
  )

  /** Grava o código bipado no produto tocado e segue para ele. */
  async function vincularAo(produto: Produto) {
    if (!vincular) return
    await salvarESincronizar('products', {
      ...produto,
      codigo_barras: vincular,
      // Bipar um produto é dizer que ele é contado. Deixar a chave desligada
      // aqui faria o item sumir da lista logo depois de vinculado.
      controla_estoque: true,
      updated_at: new Date().toISOString(),
    })
    navegar(`/estoque/${produto.id}`, { replace: true })
  }

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

      {vincular ? (
        <div className="cartao mb-4 border-slate-900 bg-slate-900 p-4 text-white">
          <p className="text-sm">Código bipado, ainda sem dono:</p>
          <p className="my-1 font-mono text-lg font-bold">
            {formatarCodigoBarras(vincular)}
          </p>
          <p className="text-sm text-slate-300">
            Toque no produto que estava na embalagem. Da próxima vez que bipar,
            ele abre direto.
          </p>
          <button
            className="mt-3 min-h-toque w-full rounded-xl border-2 border-slate-600 px-4 font-semibold"
            onClick={() => navegar('/estoque', { replace: true })}
          >
            Cancelar
          </button>
        </div>
      ) : (
        /* O que falta configurar vem ANTES do que falta comprar: sem telefone
           de fornecedor, o botão de pedir não leva a lugar nenhum. */
        <PendenciasEstoque orgId={orgId} />
      )}

      {!vincular && faltando > 0 && (
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

      {!vincular && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Link to="/estoque/requisicoes" className="btn-secundario">
            📋 Requisições
          </Link>
          <Link to="/estoque/contagem" className="btn-secundario">
            🔢 Contagem
          </Link>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <input
          className="campo flex-1"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={vincular ? 'Buscar o produto…' : 'Buscar no estoque…'}
          aria-label={vincular ? 'Buscar o produto' : 'Buscar no estoque'}
        />
        {!vincular && (
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
        )}
      </div>

      {listados.length === 0 ? (
        <div className="cartao p-6 text-center">
          <p className="text-slate-500">
            {produtos.length === 0
              ? vincular
                ? 'Nenhum produto cadastrado ainda. Cadastre o produto e o código já fica vinculado.'
                : 'Nenhum produto controla estoque ainda. Marque “Controla estoque” no cadastro do produto.'
              : busca
                ? `Nenhum item com "${busca}".`
                : 'Nada abaixo do mínimo. 👍'}
          </p>
          {/* Cadastrar já levando o código bipado: sem isto, quem bipou um
              produto que ainda não existe teria de decorar treze dígitos. */}
          <Link
            to={vincular ? `/produtos/novo?codigo=${encodeURIComponent(vincular)}` : '/produtos/novo'}
            className="btn-primario mt-4 inline-flex"
          >
            + Cadastrar produto
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {listados.map(({ produto, situacao }) => {
            const conteudo = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{produto.nome}</span>
                  <span className="block text-sm text-slate-500">
                    {vincular ? (
                      produto.codigo_barras ? (
                        // Vincular por cima apaga o código antigo em silêncio;
                        // dizer que já existe um evita a troca sem querer.
                        <span className="text-amber-700">
                          já tem código {formatarCodigoBarras(produto.codigo_barras)}
                        </span>
                      ) : (
                        'sem código de barras'
                      )
                    ) : (
                      <Saldos produto={produto} />
                    )}
                  </span>
                </span>
                {!vincular && situacao.abaixo && (
                  <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                    repor
                  </span>
                )}
                <span aria-hidden className="text-slate-300">
                  ›
                </span>
              </>
            )

            const classe = [
              'cartao flex w-full items-center gap-3 p-4 text-left',
              !vincular && situacao.abaixo ? 'border-amber-300' : '',
            ].join(' ')

            return (
              <li key={produto.id}>
                {vincular ? (
                  <button className={classe} onClick={() => void vincularAo(produto)}>
                    {conteudo}
                  </button>
                ) : (
                  <Link to={`/estoque/${produto.id}`} className={classe}>
                    {conteudo}
                  </Link>
                )}
              </li>
            )
          })}
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
