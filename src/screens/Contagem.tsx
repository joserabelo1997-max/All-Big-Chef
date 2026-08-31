import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { formatarDataHora } from '../domain/expiry'
import type {
  ContagemEstoque,
  ItemContagem,
  Produto,
  UnidadeMovimento,
} from '../domain/types'
import { db, registrarMovimento, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { SeletorMembro } from '../ui/SeletorMembro'

import { formatar } from './Estoque'

/**
 * Contagem de inventário.
 *
 * A decisão que define a tela: ao finalizar, a diferença vira MOVIMENTO DE
 * AJUSTE, e não sobrescrita do saldo. A diferença é justamente a informação
 * valiosa — é ela que revela perda, furto ou lançamento esquecido. Um sistema
 * que apenas grava o número contado apaga o problema junto com o erro.
 *
 * `quantidade_sistema` é congelada no momento em que o item entra na contagem:
 * comparar com o saldo de agora contaminaria a diferença com as saídas que
 * aconteceram durante a própria contagem.
 */
export function Contagem() {
  const { orgId, carregando } = useSessao()
  const navegar = useNavigate()

  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)

  const aberta = useLiveQuery(
    async () => {
      if (!orgId) return undefined
      const todas = await db.stock_counts.where('org_id').equals(orgId).toArray()
      return todas
        .filter((c) => !c.deleted_at && c.status === 'aberta')
        .sort((a, b) => (a.iniciada_em < b.iniciada_em ? 1 : -1))[0]
    },
    [orgId],
  )

  const itens = useLiveQuery(
    async () => {
      if (!aberta) return []
      return db.stock_count_items.where('count_id').equals(aberta.id).toArray()
    },
    [aberta?.id],
    [],
  )

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos
        .filter((p) => !p.deleted_at && p.ativo && p.controla_estoque)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  const finalizadas = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.stock_counts.where('org_id').equals(orgId).toArray()
      return todas
        .filter((c) => c.status === 'finalizada')
        .sort((a, b) => (a.iniciada_em < b.iniciada_em ? 1 : -1))
        .slice(0, 5)
    },
    [orgId],
    [],
  )

  const porProduto = useMemo(() => {
    const mapa = new Map(produtos.map((p) => [p.id, p]))
    return (id: string) => mapa.get(id)
  }, [produtos])

  /** Contados e ainda por contar, para a barra de andamento. */
  const contados = itens.filter((i) => i.quantidade_contada != null).length

  async function comecar() {
    if (!orgId) return
    const agora = new Date().toISOString()

    const contagem: ContagemEstoque = {
      id: novoId(),
      org_id: orgId,
      nome: `Contagem de ${new Date().toLocaleDateString('pt-BR')}`,
      status: 'aberta',
      member_id: membroId,
      member_snapshot: membroNome,
      iniciada_em: agora,
      created_at: agora,
      updated_at: agora,
    }
    await salvarESincronizar('stock_counts', contagem)

    // Todos os itens já entram na contagem, com o saldo do sistema congelado.
    // Um produto que ninguém contar fica com `quantidade_contada` nula e não
    // gera ajuste — "não contei" é diferente de "contei zero".
    for (const produto of produtos) {
      const unidades: UnidadeMovimento[] =
        produto.unidade_estoque === 'ambos' ? ['kg', 'un'] : [produto.unidade_estoque]

      for (const unidade of unidades) {
        const item: ItemContagem = {
          id: novoId(),
          org_id: orgId,
          count_id: contagem.id,
          product_id: produto.id,
          unidade,
          quantidade_sistema: unidade === 'kg' ? produto.saldo_kg : produto.saldo_un,
          quantidade_contada: null,
          created_at: agora,
          updated_at: agora,
        }
        await salvarESincronizar('stock_count_items', item)
      }
    }
  }

  async function anotar(item: ItemContagem, texto: string) {
    const limpo = texto.trim()
    const numero = limpo === '' ? null : Number(limpo.replace(',', '.'))
    if (numero != null && !Number.isFinite(numero)) return

    await salvarESincronizar('stock_count_items', {
      ...item,
      quantidade_contada: numero,
      updated_at: new Date().toISOString(),
    })
  }

  async function finalizar() {
    if (!orgId || !aberta || finalizando) return
    setFinalizando(true)

    try {
      const agora = new Date().toISOString()

      for (const item of itens) {
        if (item.quantidade_contada == null) continue
        const diferenca = item.quantidade_contada - item.quantidade_sistema
        if (diferenca === 0) continue

        // Diferença para MAIS vira ajuste; para MENOS vira perda, porque é isso
        // que ela é: produto que estava lançado e não está na prateleira.
        await registrarMovimento({
          id: novoId(),
          org_id: orgId,
          product_id: item.product_id,
          tipo: diferenca > 0 ? 'ajuste' : 'perda',
          quantidade: Math.abs(diferenca),
          unidade: item.unidade,
          member_id: membroId,
          member_snapshot: membroNome,
          motivo: `Contagem de inventário (sistema ${item.quantidade_sistema}, contado ${item.quantidade_contada})`,
          ocorrido_em: agora,
          created_at: agora,
        })
      }

      await salvarESincronizar('stock_counts', {
        ...aberta,
        status: 'finalizada',
        finalizada_em: agora,
        updated_at: agora,
      })
    } finally {
      setFinalizando(false)
    }
  }

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button className="mb-3 text-sm text-slate-500" onClick={() => navegar('/estoque')}>
        ‹ Estoque
      </button>

      <h1 className="text-2xl font-bold">Contagem</h1>
      <p className="mb-5 text-sm text-slate-500">
        Confere o físico contra o sistema. A diferença vira movimento, e não
        sobrescrita — é ela que mostra onde o produto está sumindo.
      </p>

      <section className="mb-5">
        <span className="rotulo block">Quem está contando</span>
        <SeletorMembro
          orgId={orgId}
          selecionado={membroId}
          aoSelecionar={(id, nome) => {
            setMembroId(id)
            setMembroNome(nome)
            selecionarMembro(id)
          }}
        />
      </section>

      {!aberta ? (
        <>
          <button
            className="btn-primario mb-6 w-full"
            onClick={() => void comecar()}
            disabled={produtos.length === 0}
          >
            Começar contagem
          </button>
          {produtos.length === 0 && (
            <p className="cartao p-6 text-center text-slate-500">
              Nenhum produto controla estoque ainda.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="cartao mb-4 p-4">
            <p className="font-semibold">{aberta.nome}</p>
            <p className="text-sm text-slate-500">
              {contados} de {itens.length} contados · aberta em{' '}
              {formatarDataHora(aberta.iniciada_em)}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-slate-900 transition-all"
                style={{ width: `${itens.length ? (contados / itens.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <ul className="mb-6 grid gap-2">
            {itens.map((item) => (
              <LinhaContagem
                key={item.id}
                item={item}
                produto={porProduto(item.product_id)}
                aoAnotar={(texto) => void anotar(item, texto)}
              />
            ))}
          </ul>

          <button
            className="btn-primario w-full"
            onClick={() => void finalizar()}
            disabled={finalizando || contados === 0}
          >
            {finalizando ? 'Gerando ajustes…' : `Finalizar e ajustar (${contados} itens)`}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            O que não foi contado fica de fora: “não contei” é diferente de
            “contei zero”.
          </p>
        </>
      )}

      {finalizadas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Contagens anteriores
          </h2>
          <ul className="cartao divide-y divide-slate-100">
            {finalizadas.map((c) => (
              <li key={c.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className="flex-1 font-semibold">{c.nome}</span>
                <span className="text-xs text-slate-400">
                  {c.finalizada_em && formatarDataHora(c.finalizada_em)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * Uma linha da contagem.
 *
 * O saldo do sistema fica ESCONDIDO até a pessoa digitar. Mostrar antes induz
 * a "confirmar" o número em vez de contar — e uma contagem que só confirma o
 * sistema não serve para nada.
 */
function LinhaContagem({
  item,
  produto,
  aoAnotar,
}: {
  item: ItemContagem
  produto: Produto | undefined
  aoAnotar: (texto: string) => void
}) {
  const [texto, setTexto] = useState(
    item.quantidade_contada != null ? String(item.quantidade_contada) : '',
  )

  const contado = item.quantidade_contada
  const diferenca = contado != null ? contado - item.quantidade_sistema : null

  return (
    <li className="cartao p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {produto?.nome ?? 'Produto removido'}
          </span>
          <span className="block text-xs text-slate-400">{item.unidade}</span>
        </span>
        <input
          className="min-h-toque w-24 rounded-lg border-2 border-slate-200 px-2 text-center text-lg font-semibold"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => aoAnotar(texto)}
          placeholder="—"
          aria-label={`Contagem de ${produto?.nome ?? 'produto'} em ${item.unidade}`}
        />
      </div>

      {diferenca != null && diferenca !== 0 && (
        <p
          className={`mt-2 text-sm font-semibold ${
            diferenca > 0 ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          {diferenca > 0 ? 'Sobra' : 'Falta'} {formatar(Math.abs(diferenca))} {item.unidade}{' '}
          <span className="font-normal text-slate-500">
            (sistema: {formatar(item.quantidade_sistema)})
          </span>
        </p>
      )}
      {diferenca === 0 && <p className="mt-2 text-sm text-slate-500">Bateu certo.</p>}
    </li>
  )
}
