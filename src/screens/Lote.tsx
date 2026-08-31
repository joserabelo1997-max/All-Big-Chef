import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { criarEtiqueta, dadosParaImpressao } from '../domain/labelData'
import type { Produto } from '../domain/types'
import { db, registrarEvento, salvarESincronizar } from '../lib/db'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { modeloAtivo } from '../lib/modelos'
import { useSessao } from '../lib/useSessao'
import { imprimir } from '../printing/imprimir'
import {
  lerPerfilLocal,
  perfilEstaCompleto,
  type PerfilImpressora,
} from '../printing/printerProfile'
import { MODELO_PADRAO, type ModeloEtiqueta } from '../printing/template'
import { abrirConexao, foiCancelado, motivoNaoPodeImprimir } from '../printing/conectar'
import { SeletorMembro } from '../ui/SeletorMembro'

/**
 * Impressão em lote.
 *
 * Feita para o pré-preparo da manhã, quando a cozinha abre dez produtos em
 * sequência e etiquetar um por vez seria dez idas e voltas na mesma tela. Monta
 * a fila inteira primeiro e só depois imprime.
 *
 * A fila é resiliente por desenho: cada etiqueta é gravada antes de ir para a
 * impressora, e uma falha no meio não perde o que já foi registrado — a tela
 * mostra exatamente onde parou.
 */

interface ItemFila {
  produto: Produto
  copias: number
}

export function Lote() {
  const { orgId, carregando } = useSessao()
  const [fila, setFila] = useState<ItemFila[]>([])
  const [busca, setBusca] = useState('')
  const [lote, setLote] = useState('')
  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)

  const [modelo, setModelo] = useState<ModeloEtiqueta>(MODELO_PADRAO)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  useEffect(() => {
    if (orgId) void modeloAtivo(orgId).then(setModelo)
  }, [orgId])

  const perfil = lerPerfilLocal()
  const impressoraPronta = perfilEstaCompleto(perfil)
  const bluetoothIndisponivel = motivoNaoPodeImprimir(perfil)

  const produtos = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      return todos
        .filter((p) => !p.deleted_at && p.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  const filtrados = useMemo(() => {
    const alvo = semAcento(busca)
    return alvo ? produtos.filter((p) => semAcento(p.nome).includes(alvo)) : produtos
  }, [produtos, busca])

  const totalEtiquetas = fila.reduce((soma, item) => soma + item.copias, 0)

  function adicionar(produto: Produto) {
    setFila((atual) => {
      const existente = atual.find((i) => i.produto.id === produto.id)
      if (existente) {
        return atual.map((i) =>
          i.produto.id === produto.id ? { ...i, copias: i.copias + 1 } : i,
        )
      }
      return [...atual, { produto, copias: 1 }]
    })
  }

  function ajustar(produtoId: string, delta: number) {
    setFila((atual) =>
      atual
        .map((i) =>
          i.produto.id === produtoId ? { ...i, copias: i.copias + delta } : i,
        )
        .filter((i) => i.copias > 0),
    )
  }

  async function imprimirFila() {
    if (fila.length === 0 || !orgId || ocupado) return

    setErro(null)
    setSucesso(null)
    setOcupado(true)

    let impressas = 0

    try {
      const aberta = await abrirConexao(perfil as PerfilImpressora)

      for (const item of fila) {
        const fornecedor = item.produto.supplier_id
          ? await db.suppliers.get(item.produto.supplier_id)
          : undefined
        const pasta = item.produto.folder_id
          ? await db.folders.get(item.produto.folder_id)
          : undefined

        for (let i = 0; i < item.copias; i++) {
          const { etiqueta, evento } = criarEtiqueta({
            orgId,
            produto: item.produto,
            fornecedor,
            pasta,
            membroId,
            membroNome,
            lote,
          })

          await salvarESincronizar('labels', etiqueta)
          await registrarEvento(evento)

          setProgresso(
            `${impressas + 1} de ${totalEtiquetas} — ${item.produto.nome}`,
          )

          await imprimir(
            aberta,
            modelo,
            dadosParaImpressao(etiqueta),
            perfil as PerfilImpressora,
          )
          impressas++
        }
      }

      setSucesso(`${impressas} etiquetas impressas.`)
      setFila([])
    } catch (e) {
      if (foiCancelado(e)) {
        setErro(null)
      } else {
        setErro(
          `Parou na etiqueta ${impressas + 1} de ${totalEtiquetas}. ` +
            `As ${impressas} já impressas estão registradas. ` +
            (e instanceof Error ? e.message : ''),
        )
      }
    } finally {
      setOcupado(false)
      setProgresso(null)
    }
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Impressão em lote</h1>
      <p className="mb-5 text-sm text-slate-500">
        Monte a fila do pré-preparo e imprima tudo de uma vez.
      </p>

      {bluetoothIndisponivel && (
        <div className="cartao mb-4 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{bluetoothIndisponivel}</p>
        </div>
      )}

      {!impressoraPronta && !bluetoothIndisponivel && (
        <Link
          to="/config/impressora"
          className="cartao mb-4 block border-amber-300 bg-amber-50 p-4"
        >
          <p className="font-semibold text-amber-900">Impressora não configurada</p>
        </Link>
      )}

      {erro && (
        <p className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="mb-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {sucesso}
        </p>
      )}

      {fila.length > 0 && (
        <section className="mb-6">
          <h2 className="rotulo">
            Fila · {totalEtiquetas} {totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'}
          </h2>
          <ul className="grid gap-2">
            {fila.map((item) => (
              <li key={item.produto.id} className="cartao flex items-center gap-3 p-3">
                <span className="flex-1 font-semibold">{item.produto.nome}</span>
                <button
                  className="min-h-[2.75rem] w-11 rounded-lg border-2 border-slate-200 font-bold"
                  onClick={() => ajustar(item.produto.id, -1)}
                  aria-label={`Menos uma de ${item.produto.nome}`}
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums">
                  {item.copias}
                </span>
                <button
                  className="min-h-[2.75rem] w-11 rounded-lg border-2 border-slate-200 font-bold"
                  onClick={() => ajustar(item.produto.id, 1)}
                  aria-label={`Mais uma de ${item.produto.nome}`}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <label className="rotulo" htmlFor="busca-lote">
          Adicionar produto
        </label>
        <input
          id="busca-lote"
          type="search"
          className="campo mb-2"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
        />
        <div className="max-h-56 overflow-y-auto rounded-xl border-2 border-slate-200">
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => adicionar(p)}
              className="flex min-h-toque w-full items-center justify-between bg-white px-4 text-left"
            >
              <span className="font-semibold">{p.nome}</span>
              <span className="text-sm text-slate-400">+</span>
            </button>
          ))}
        </div>
      </section>

      {fila.length > 0 && (
        <>
          <section className="mb-6">
            <label className="rotulo" htmlFor="lote-comum">
              Lote <span className="font-normal">(aplicado a todas)</span>
            </label>
            <input
              id="lote-comum"
              className="campo"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Ex.: L-4412"
            />
          </section>

          <section className="mb-6">
            <label className="rotulo">Responsável</label>
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

          <button
            className="btn-primario w-full"
            onClick={() => void imprimirFila()}
            disabled={ocupado || !impressoraPronta || Boolean(bluetoothIndisponivel)}
          >
            {progresso ?? `Imprimir ${totalEtiquetas} etiquetas`}
          </button>
        </>
      )}
    </div>
  )
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
