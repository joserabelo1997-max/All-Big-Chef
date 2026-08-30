import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { criarEtiqueta, dadosParaImpressao } from '../domain/labelData'
import type { Produto } from '../domain/types'
import { db, registrarEvento, salvarESincronizar } from '../lib/db'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { useSessao } from '../lib/useSessao'
import { imprimir } from '../printing/imprimir'
import {
  lerPerfilLocal,
  perfilEstaCompleto,
  type PerfilImpressora,
} from '../printing/printerProfile'
import { MODELO_PADRAO } from '../printing/template'
import { escolherImpressora, motivoIndisponivel } from '../printing/transport/ble'
import { PreviaEtiqueta } from '../ui/PreviaEtiqueta'
import { SeletorMembro } from '../ui/SeletorMembro'

/**
 * Impressão de etiqueta.
 *
 * A ordem da tela segue a ordem do gesto real na bancada: escolher o produto,
 * conferir a validade que o sistema calculou, dizer quantas etiquetas, e
 * imprimir. Tudo o mais é opcional e fica abaixo.
 *
 * As etiquetas são gravadas ANTES do envio à impressora. Se o Bluetooth falhar
 * no meio, o registro já existe e a pessoa pode reimprimir — o inverso
 * (imprimir e só depois gravar) deixaria papel colado no pote sem
 * correspondência no sistema, que é o pior estado possível para rastreabilidade.
 */
export function Imprimir() {
  const { orgId, carregando } = useSessao()
  const [params] = useSearchParams()

  const [produtoId, setProdutoId] = useState(params.get('produto') ?? '')
  const [busca, setBusca] = useState('')
  const [copias, setCopias] = useState(1)
  const [lote, setLote] = useState('')
  const [membroId, setMembroId] = useState<string | null>(membroSelecionado())
  const [membroNome, setMembroNome] = useState<string | null>(null)

  const [device, setDevice] = useState<BluetoothDevice | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const perfil = lerPerfilLocal()
  const impressoraPronta = perfilEstaCompleto(perfil)
  const bluetoothIndisponivel = motivoIndisponivel()

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

  const produto = produtos.find((p) => p.id === produtoId)

  const fornecedor = useLiveQuery(
    async () => (produto?.supplier_id ? db.suppliers.get(produto.supplier_id) : undefined),
    [produto?.supplier_id],
  )

  const pasta = useLiveQuery(
    async () => (produto?.folder_id ? db.folders.get(produto.folder_id) : undefined),
    [produto?.folder_id],
  )

  /** Etiqueta de exemplo para a prévia, sem gravar nada. */
  const previa = useMemo(() => {
    if (!produto || !orgId) return null
    return criarEtiqueta({
      orgId,
      produto,
      fornecedor,
      pasta,
      membroId,
      membroNome,
      lote,
    }).etiqueta
  }, [produto, orgId, fornecedor, pasta, membroId, membroNome, lote])

  async function executarImpressao() {
    if (!produto || !orgId || ocupado) return

    setErro(null)
    setSucesso(null)
    setOcupado(true)

    try {
      let aparelho = device
      if (!aparelho) {
        aparelho = await escolherImpressora()
        setDevice(aparelho)
      }

      let impressas = 0
      for (let i = 0; i < copias; i++) {
        // Cada etiqueta física é um registro próprio, com id e código curto
        // distintos. Imprimir 3 cópias do MESMO id colaria três papéis que
        // apontam para o mesmo pote — a baixa de um marcaria os três.
        const { etiqueta, evento } = criarEtiqueta({
          orgId,
          produto,
          fornecedor,
          pasta,
          membroId,
          membroNome,
          lote,
        })

        await salvarESincronizar('labels', etiqueta)
        await registrarEvento(evento)

        await imprimir(
          aparelho,
          MODELO_PADRAO,
          dadosParaImpressao(etiqueta),
          perfil as PerfilImpressora,
          {
            aoProgredir: (p) => {
              if (p.etapa === 'enviando' && p.total) {
                const pct = Math.round((p.enviados! / p.total) * 100)
                setProgresso(`Etiqueta ${i + 1} de ${copias} — ${pct}%`)
              }
            },
          },
        )
        impressas++
      }

      setSucesso(
        `${impressas} ${impressas === 1 ? 'etiqueta impressa' : 'etiquetas impressas'}.`,
      )
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') {
        setErro(null) // a pessoa fechou o seletor de aparelhos
      } else {
        setErro(
          (e instanceof Error ? e.message : 'Falha ao imprimir.') +
            ' As etiquetas já foram registradas — você pode reimprimir pela lista.',
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
      <h1 className="mb-5 text-2xl font-bold">Imprimir etiqueta</h1>

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
          <p className="mt-1 text-sm text-amber-800">
            Toque para parear a etiquetadora antes de imprimir.
          </p>
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

      <section className="mb-6">
        <label className="rotulo" htmlFor="busca-produto">
          Produto
        </label>
        {produtos.length === 0 ? (
          <Link to="/produtos/novo" className="cartao block p-4 text-center text-slate-600">
            Nenhum produto cadastrado. Toque para criar o primeiro.
          </Link>
        ) : (
          <>
            <input
              id="busca-produto"
              type="search"
              className="campo mb-2"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar…"
            />
            <div className="max-h-64 overflow-y-auto rounded-xl border-2 border-slate-200">
              {filtrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProdutoId(p.id)}
                  className={[
                    'flex min-h-toque w-full items-center justify-between px-4 text-left transition',
                    produtoId === p.id ? 'bg-slate-900 text-white' : 'bg-white',
                  ].join(' ')}
                >
                  <span className="font-semibold">{p.nome}</span>
                  <span className="text-sm opacity-70">{p.shelf_life_days}d</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {produto && previa && (
        <>
          <ResumoValidade produto={produto} validade={previa.expires_at} />

          <section className="mb-6">
            <label className="rotulo">Quantas etiquetas</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-secundario w-16"
                onClick={() => setCopias((c) => Math.max(1, c - 1))}
                aria-label="Menos uma"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-3xl font-bold tabular-nums">
                {copias}
              </span>
              <button
                type="button"
                className="btn-secundario w-16"
                onClick={() => setCopias((c) => Math.min(50, c + 1))}
                aria-label="Mais uma"
              >
                +
              </button>
            </div>
          </section>

          <section className="mb-6">
            <label className="rotulo" htmlFor="lote">
              Lote <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="lote"
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

          <section className="mb-6">
            <label className="rotulo">Como vai sair</label>
            <PreviaEtiqueta
              modelo={MODELO_PADRAO}
              dados={dadosParaImpressao(previa)}
              dpi={perfil?.dpi ?? 203}
            />
          </section>

          <button
            className="btn-primario w-full"
            onClick={() => void executarImpressao()}
            disabled={ocupado || !impressoraPronta || Boolean(bluetoothIndisponivel)}
          >
            {progresso ??
              (ocupado
                ? 'Imprimindo…'
                : `Imprimir ${copias} ${copias === 1 ? 'etiqueta' : 'etiquetas'}`)}
          </button>
        </>
      )}
    </div>
  )
}

function ResumoValidade({ produto, validade }: { produto: Produto; validade: string }) {
  const data = new Date(validade)
  return (
    <div className="cartao mb-6 flex items-center justify-between p-4">
      <div>
        <p className="text-sm text-slate-500">Vence em</p>
        <p className="text-2xl font-bold tabular-nums">
          {data.toLocaleDateString('pt-BR')}
        </p>
      </div>
      <p className="text-right text-sm text-slate-500">
        {produto.shelf_life_days} {produto.shelf_life_days === 1 ? 'dia' : 'dias'}
        <br />
        após abertura
      </p>
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
