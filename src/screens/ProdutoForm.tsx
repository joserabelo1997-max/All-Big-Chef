import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { PADROES_PRODUTO, type Produto, type UnidadeEstoque } from '../domain/types'
import { normalizarCodigoBarras } from '../lib/codigoBarras'
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

  /**
   * Código de barras da embalagem. Já vem preenchido quando a pessoa chegou
   * aqui bipando um produto que ainda não existia — decorar treze dígitos para
   * redigitá-los seria o oposto de bipar.
   */
  const [codigoBarras, setCodigoBarras] = useState(
    () => normalizarCodigoBarras(params.get('codigo') ?? ''),
  )

  /**
   * As duas facetas. O catálogo é ÚNICO: "Creme de leite" é cadastrado uma vez
   * e pode participar das duas coisas. Papel toalha entra só no estoque;
   * pré-preparo da casa, só em etiqueta.
   */
  const [geraEtiqueta, setGeraEtiqueta] = useState<boolean>(PADROES_PRODUTO.gera_etiqueta)
  const [controlaEstoque, setControlaEstoque] = useState<boolean>(
    PADROES_PRODUTO.controla_estoque,
  )
  const [unidadeEstoque, setUnidadeEstoque] = useState<UnidadeEstoque>(
    PADROES_PRODUTO.unidade_estoque,
  )
  const [minimoKg, setMinimoKg] = useState(0)
  const [minimoUn, setMinimoUn] = useState(0)

  useEffect(() => {
    if (!existente) return
    setNome(existente.nome)
    setDias(existente.shelf_life_days)
    setPastaId(existente.folder_id ?? '')
    setLote(existente.lote_atual ?? '')
    setUnidade(existente.unidade ?? '')
    setObservacoes(existente.observacoes ?? '')
    setCodigoBarras(existente.codigo_barras ?? '')
    setGeraEtiqueta(existente.gera_etiqueta ?? PADROES_PRODUTO.gera_etiqueta)
    setControlaEstoque(existente.controla_estoque ?? PADROES_PRODUTO.controla_estoque)
    setUnidadeEstoque(existente.unidade_estoque ?? PADROES_PRODUTO.unidade_estoque)
    setMinimoKg(existente.estoque_minimo_kg ?? 0)
    setMinimoUn(existente.estoque_minimo_un ?? 0)
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
      gera_etiqueta: geraEtiqueta,
      controla_estoque: controlaEstoque,
      unidade_estoque: unidadeEstoque,
      estoque_minimo_kg: minimoKg,
      estoque_minimo_un: minimoUn,
      unidade: unidade.trim() || null,
      codigo_barras: codigoBarras || null,
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
          <label className="rotulo" htmlFor="codigo-barras">
            Código de barras <span className="font-normal">(opcional)</span>
          </label>
          <div className="flex gap-2">
            <input
              id="codigo-barras"
              className="campo flex-1 font-mono"
              inputMode="numeric"
              autoComplete="off"
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(normalizarCodigoBarras(e.target.value))}
              placeholder="Toque aqui e bipe a embalagem"
            />
            {codigoBarras && (
              <button
                type="button"
                className="min-h-toque shrink-0 rounded-xl border-2 border-slate-200 px-4 font-semibold"
                onClick={() => setCodigoBarras('')}
              >
                Limpar
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {/* Com o cursor dentro do campo, o leitor digita ali em vez de o app
                sequestrar a leitura — é o comportamento de `useLeitorHid`. */}
            Com o cursor no campo, o leitor escreve direto aqui. Depois disso,
            bipar a embalagem abre este produto no estoque.
          </p>
        </div>

        {/* As duas facetas, lado a lado. Um produto pode ser as duas coisas:
            "Creme de leite" é etiquetado E contado. Papel toalha só é contado;
            um pré-preparo da casa só é etiquetado. */}
        <fieldset className="cartao p-4">
          <legend className="rotulo px-1">Este produto</legend>
          <Faceta
            id="gera-etiqueta"
            marcada={geraEtiqueta}
            aoMudar={setGeraEtiqueta}
            titulo="Gera etiqueta de validade"
            descricao="Aparece na lista de etiquetar e vai para a impressora."
          />
          <Faceta
            id="controla-estoque"
            marcada={controlaEstoque}
            aoMudar={setControlaEstoque}
            titulo="Controla estoque"
            descricao="Entra e sai do estoque, com saldo e aviso de mínimo."
          />
          {!geraEtiqueta && !controlaEstoque && (
            <p className="mt-2 text-xs text-amber-700">
              Sem nenhuma das duas, o produto não aparece em lugar nenhum.
            </p>
          )}
        </fieldset>

        {controlaEstoque && (
          <fieldset className="cartao p-4">
            <legend className="rotulo px-1">Como é contado</legend>

            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ['un', 'Por unidade'],
                  ['kg', 'Por quilo'],
                  ['ambos', 'Os dois'],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setUnidadeEstoque(valor)}
                  className={[
                    'min-h-toque rounded-xl border-2 px-4 font-semibold transition',
                    unidadeEstoque === valor
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {unidadeEstoque === 'ambos' && (
              <p className="mb-3 text-xs text-slate-500">
                Duas contagens independentes, sem conversão entre elas: o saco
                fechado e o granel são coisas diferentes na prateleira.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {unidadeEstoque !== 'un' && (
                <div>
                  <label className="rotulo" htmlFor="minimo-kg">
                    Mínimo (kg)
                  </label>
                  <input
                    id="minimo-kg"
                    type="number"
                    min={0}
                    step="0.001"
                    className="campo"
                    value={minimoKg}
                    onChange={(e) => setMinimoKg(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              )}
              {unidadeEstoque !== 'kg' && (
                <div>
                  <label className="rotulo" htmlFor="minimo-un">
                    Mínimo (unidades)
                  </label>
                  <input
                    id="minimo-un"
                    type="number"
                    min={0}
                    className="campo"
                    value={minimoUn}
                    onChange={(e) => setMinimoUn(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Zero significa “não acompanhe”. Chegar no mínimo já é hora de
              pedir — ele é o ponto de pedido, não o ponto de acabar.
            </p>
          </fieldset>
        )}

        {geraEtiqueta && (
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
        )}

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

/**
 * Uma faceta do produto, como interruptor.
 *
 * Caixa de seleção grande e a linha inteira clicável: quem cadastra está de
 * avental, muitas vezes com a mão molhada, e um alvo de toque pequeno erra.
 */
function Faceta({
  id,
  marcada,
  aoMudar,
  titulo,
  descricao,
}: {
  id: string
  marcada: boolean
  aoMudar: (valor: boolean) => void
  titulo: string
  descricao: string
}) {
  return (
    <label htmlFor={id} className="flex min-h-toque cursor-pointer items-start gap-3 py-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-6 w-6 shrink-0 rounded border-2 border-slate-300 accent-slate-900"
        checked={marcada}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span>
        <span className="block font-semibold leading-tight">{titulo}</span>
        <span className="block text-xs text-slate-500">{descricao}</span>
      </span>
    </label>
  )
}
