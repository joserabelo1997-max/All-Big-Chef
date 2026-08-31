import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { PADROES_PRODUTO, type Produto } from '../domain/types'
import { db, salvarESincronizar } from '../lib/db'
import { resolverFornecedor } from '../lib/fornecedores'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import { CampoFornecedor } from '../ui/CampoFornecedor'

/** Atalhos de validade que cobrem a maioria dos casos de cozinha. */
const DIAS_COMUNS = [1, 2, 3, 5, 7, 10, 15, 30]

export function ProdutoForm() {
  const { produtoId } = useParams()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { orgId, carregando } = useSessao()

  const editando = produtoId && produtoId !== 'novo'
  const existente = useLiveQuery(
    async () => (editando ? db.products.get(produtoId) : undefined),
    [produtoId, editando],
  )

  const [nome, setNome] = useState('')
  const [dias, setDias] = useState(3)
  const [pastaId, setPastaId] = useState(params.get('pasta') ?? '')
  /** O NOME do fornecedor, e não o id: o campo aceita um nome ainda inédito. */
  const [fornecedor, setFornecedor] = useState('')
  const [lote, setLote] = useState('')
  const [unidade, setUnidade] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!existente) return
    setNome(existente.nome)
    setDias(existente.shelf_life_days)
    setPastaId(existente.folder_id ?? '')
    setLote(existente.lote_atual ?? '')
    setUnidade(existente.unidade ?? '')
    setObservacoes(existente.observacoes ?? '')
  }, [existente])

  // O nome do fornecedor vem numa busca à parte porque o produto guarda o id.
  useEffect(() => {
    if (!existente?.supplier_id) return
    void db.suppliers.get(existente.supplier_id).then((f) => {
      if (f) setFornecedor(f.nome)
    })
  }, [existente?.supplier_id])

  const pastas = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.folders.where('org_id').equals(orgId).toArray()
      return todas.filter((p) => !p.deleted_at).sort((a, b) => a.ordem - b.ordem)
    },
    [orgId],
    [],
  )

  async function salvar() {
    const limpo = nome.trim()
    if (!limpo || !orgId || salvando) return

    setSalvando(true)
    const agora = new Date().toISOString()

    // Cria o fornecedor inédito antes de gravar o produto, para que o produto
    // já nasça apontando para ele. Se a rede estiver fora, os dois saem juntos
    // na outbox, nesta ordem.
    const fornecedorId = await resolverFornecedor(orgId, fornecedor)

    const registro: Produto = {
      // Ao editar, as facetas existentes prevalecem; o padrão só preenche o que
      // um produto antigo ainda não tem.
      ...PADROES_PRODUTO,
      ...existente,
      id: existente?.id ?? novoId(),
      org_id: orgId,
      folder_id: pastaId || null,
      supplier_id: fornecedorId,
      nome: limpo,
      shelf_life_days: dias,
      // Lote da embalagem do fabricante: fica no produto porque não é valor
      // livre por impressão — muda quando muda o lote comprado.
      lote_atual: lote.trim() || null,
      unidade: unidade.trim() || null,
      observacoes: observacoes.trim() || null,
      ativo: true,
      created_at: existente?.created_at ?? agora,
      updated_at: agora,
    }

    await salvarESincronizar('products', registro)
    navegar(pastaId ? `/produtos?pasta=${pastaId}` : '/produtos')
  }

  async function arquivar() {
    if (!existente) return
    // Exclusão lógica: etiquetas já impressas continuam apontando para este
    // produto, e um DELETE físico quebraria o histórico da rastreabilidade.
    await salvarESincronizar('products', {
      ...existente,
      ativo: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    navegar('/produtos')
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">
        {editando ? 'Editar produto' : 'Novo produto'}
      </h1>

      <div className="grid gap-4">
        <div>
          <label className="rotulo" htmlFor="nome">
            Nome do produto
          </label>
          <input
            id="nome"
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Creme de leite"
            autoFocus={!editando}
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="dias">
            Validade após abertura
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {DIAS_COMUNS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDias(d)}
                className={[
                  'min-h-[2.75rem] min-w-[3.25rem] rounded-xl border-2 px-3 font-semibold transition',
                  dias === d
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                {d}d
              </button>
            ))}
          </div>
          <input
            id="dias"
            type="number"
            min={0}
            className="campo"
            value={dias}
            onChange={(e) => setDias(Math.max(0, Number(e.target.value)))}
          />
          <p className="mt-1 text-xs text-slate-500">
            Dias contados a partir da abertura. A etiqueta vence no fim do dia
            calculado.
          </p>
        </div>

        <div>
          <label className="rotulo" htmlFor="pasta">
            Pasta
          </label>
          <select
            id="pasta"
            className="campo"
            value={pastaId}
            onChange={(e) => setPastaId(e.target.value)}
          >
            <option value="">Sem pasta</option>
            {pastas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <CampoFornecedor orgId={orgId} valor={fornecedor} aoMudar={setFornecedor} />

        <div>
          <label className="rotulo" htmlFor="lote">
            Lote da embalagem <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="lote"
            className="campo font-mono"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            placeholder="Como vem impresso na caixa"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-slate-500">
            Sai em todas as etiquetas deste produto. Troque aqui quando trocar o
            lote comprado — na hora de imprimir ainda dá para ajustar.
          </p>
        </div>

        <div>
          <label className="rotulo" htmlFor="unidade">
            Unidade <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="unidade"
            className="campo"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            placeholder="kg, L, unidade…"
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="obs">
            Observações <span className="font-normal">(opcional)</span>
          </label>
          <textarea
            id="obs"
            className="campo py-3"
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>

        <button
          className="btn-primario"
          onClick={() => void salvar()}
          disabled={!nome.trim() || salvando}
        >
          {salvando ? 'Salvando…' : 'Salvar produto'}
        </button>

        {editando && existente && (
          <button className="btn-secundario text-red-700" onClick={() => void arquivar()}>
            Arquivar produto
          </button>
        )}
      </div>
    </div>
  )
}
