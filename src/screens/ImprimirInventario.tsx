import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  criarEtiquetaInventario,
  dadosParaImpressaoInventario,
} from '../domain/inventoryData'
import type { UnidadeMovimento } from '../domain/types'
import { db, salvarESincronizar } from '../lib/db'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { abrirConexao, foiCancelado, motivoNaoPodeImprimir } from '../printing/conectar'
import { imprimir } from '../printing/imprimir'
import {
  lerPerfilLocal,
  perfilEstaCompleto,
  type PerfilImpressora,
} from '../printing/printerProfile'
import { MODELO_INVENTARIO } from '../printing/template'
import { PreviaEtiqueta } from '../ui/PreviaEtiqueta'
import { SeletorMembro } from '../ui/SeletorMembro'

/**
 * Impressão de etiquetas de inventário.
 *
 * Uma etiqueta POR UNIDADE, cada uma com seu QR — é isso que faz a conferência
 * do freezer virar passar o leitor pote a pote, em vez de contar de cabeça e
 * anotar num papel.
 *
 * Vale aqui a mesma regra da fila de impressão de validade: a etiqueta é
 * gravada ANTES de ir para a impressora. Se o Bluetooth cair no meio, o
 * registro já existe e dá para reimprimir; o inverso deixaria papel colado no
 * pote sem correspondência no sistema.
 */
export function ImprimirInventario() {
  const { produtoId } = useParams()
  const navegar = useNavigate()
  const { orgId } = useSessao()

  const [copias, setCopias] = useState(1)
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState<UnidadeMovimento | ''>('')
  const [lote, setLote] = useState('')
  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)

  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const produto = useLiveQuery(
    async () => (produtoId ? db.products.get(produtoId) : undefined),
    [produtoId],
  )

  const perfil = lerPerfilLocal()
  const impressoraPronta = perfilEstaCompleto(perfil)
  const naoPodeImprimir = motivoNaoPodeImprimir(perfil)

  if (!produto) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-5xl">📦</p>
        <h1 className="mt-4 text-xl font-bold">Produto não encontrado</h1>
        <Link to="/estoque" className="btn-secundario mt-6 inline-flex">
          Voltar ao estoque
        </Link>
      </div>
    )
  }

  const numero = quantidade.trim() ? Number(quantidade.replace(',', '.')) : null

  const previa = criarEtiquetaInventario({
    orgId: orgId ?? '',
    produto,
    quantidade: numero,
    unidade: unidade || null,
    lote,
    membroId,
    membroNome,
  })

  async function executar() {
    if (!orgId || !produto || ocupado) return

    setErro(null)
    setSucesso(null)
    setOcupado(true)
    let impressas = 0

    try {
      const conexao = await abrirConexao(perfil as PerfilImpressora)

      for (let i = 0; i < copias; i++) {
        // Cada cópia é uma etiqueta PRÓPRIA, com id e código curto distintos:
        // dois potes com o mesmo código fariam a leitura de um contar pelos
        // dois, que é exatamente o erro que a etiqueta existe para evitar.
        const etiqueta = criarEtiquetaInventario({
          orgId,
          produto,
          quantidade: numero,
          unidade: unidade || null,
          lote,
          membroId,
          membroNome,
        })

        await salvarESincronizar('inventory_tags', etiqueta)
        setProgresso(`${i + 1} de ${copias}`)

        await imprimir(
          conexao,
          MODELO_INVENTARIO,
          dadosParaImpressaoInventario(etiqueta),
          perfil as PerfilImpressora,
        )
        impressas++
      }

      setSucesso(`${impressas} etiquetas de inventário impressas.`)
    } catch (e) {
      if (foiCancelado(e)) {
        setErro(null)
      } else {
        setErro(
          `Parou na etiqueta ${impressas + 1} de ${copias}. As ${impressas} já impressas ` +
            'estão registradas e não serão perdidas. ' +
            (e instanceof Error ? e.message : ''),
        )
      }
    } finally {
      setOcupado(false)
      setProgresso(null)
    }
  }

  const unidades: UnidadeMovimento[] =
    produto.unidade_estoque === 'ambos' ? ['kg', 'un'] : [produto.unidade_estoque]

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        className="mb-3 text-sm text-slate-500"
        onClick={() => navegar(`/estoque/${produto.id}`)}
      >
        ‹ {produto.nome}
      </button>

      <h1 className="text-2xl font-bold">Etiquetas de inventário</h1>
      <p className="mb-5 text-sm text-slate-500">
        Uma etiqueta por unidade guardada, com QR único para a contagem.{' '}
        <span className="font-semibold">Sem data de validade</span> — o que
        precisa de validade leva a etiqueta de validade.
      </p>

      {naoPodeImprimir && (
        <div className="cartao mb-4 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{naoPodeImprimir}</p>
        </div>
      )}

      {!impressoraPronta && !naoPodeImprimir && (
        <Link
          to="/config/impressora"
          className="cartao mb-4 block border-amber-300 bg-amber-50 p-4"
        >
          <p className="font-semibold text-amber-900">Impressora não configurada</p>
          <p className="mt-1 text-sm text-amber-800">Toque para parear a etiquetadora.</p>
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

      <div className="mb-4">
        <label className="rotulo" htmlFor="copias">
          Quantas etiquetas
        </label>
        <div className="flex items-center gap-3">
          <button
            className="min-h-toque w-14 rounded-xl border-2 border-slate-200 text-2xl font-bold"
            onClick={() => setCopias((c) => Math.max(1, c - 1))}
            aria-label="Menos uma etiqueta"
          >
            −
          </button>
          <input
            id="copias"
            className="campo flex-1 text-center text-2xl font-bold"
            inputMode="numeric"
            value={copias}
            onChange={(e) => setCopias(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
          />
          <button
            className="min-h-toque w-14 rounded-xl border-2 border-slate-200 text-2xl font-bold"
            onClick={() => setCopias((c) => Math.min(99, c + 1))}
            aria-label="Mais uma etiqueta"
          >
            +
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <label className="rotulo" htmlFor="qtd-inv">
            Quanto tem em cada <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="qtd-inv"
            className="campo"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex.: 2"
          />
        </div>
        <div>
          <span className="rotulo block">Unidade</span>
          <div className="flex gap-1">
            {unidades.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnidade(unidade === u ? '' : u)}
                className={[
                  'min-h-toque w-14 rounded-xl border-2 font-semibold transition',
                  unidade === u
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="rotulo" htmlFor="lote-inv">
          Lote <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="lote-inv"
          className="campo font-mono"
          value={lote}
          onChange={(e) => setLote(e.target.value)}
          placeholder="Ex.: P-12"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className="mb-4">
        <span className="rotulo block">Responsável</span>
        <SeletorMembro
          orgId={orgId}
          selecionado={membroId}
          aoSelecionar={(id, nome) => {
            setMembroId(id)
            setMembroNome(nome)
            selecionarMembro(id)
          }}
        />
      </div>

      <section className="mb-5">
        <span className="rotulo block">Como vai sair</span>
        <PreviaEtiqueta
          modelo={MODELO_INVENTARIO}
          dados={dadosParaImpressaoInventario(previa)}
          dpi={perfil?.dpi ?? 203}
        />
      </section>

      <button
        className="btn-primario w-full"
        onClick={() => void executar()}
        disabled={ocupado || !impressoraPronta || Boolean(naoPodeImprimir)}
      >
        {progresso ?? `Imprimir ${copias} ${copias === 1 ? 'etiqueta' : 'etiquetas'}`}
      </button>
    </div>
  )
}
