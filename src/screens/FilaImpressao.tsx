import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { criarEtiqueta, dadosParaImpressao } from '../domain/labelData'
import type { Produto } from '../domain/types'
import { db, registrarEvento, salvarESincronizar } from '../lib/db'
import { modeloAtivo } from '../lib/modelos'
import { membroSelecionado, selecionarMembro } from '../lib/sessao'
import { useCarrinho } from '../lib/useCarrinho'
import { useSessao } from '../lib/useSessao'
import { abrirConexao, foiCancelado, motivoNaoPodeImprimir } from '../printing/conectar'
import { imprimir } from '../printing/imprimir'
import {
  lerPerfilLocal,
  perfilEstaCompleto,
  type PerfilImpressora,
} from '../printing/printerProfile'
import { MODELO_PADRAO, type ModeloEtiqueta } from '../printing/template'
import { PreviaEtiqueta } from '../ui/PreviaEtiqueta'
import { SeletorMembro } from '../ui/SeletorMembro'
import { StepperQuantidade } from '../ui/StepperQuantidade'

/**
 * Conferência e impressão da fila.
 *
 * Substitui as antigas telas de impressão avulsa e em lote — que faziam a mesma
 * coisa com caminhos diferentes. Alcançada só pela barra do carrinho, nunca
 * pela navegação inferior: não é um lugar onde se "entra", é a conclusão de um
 * gesto que começou na lista de produtos.
 *
 * Duas regras herdadas que não podem se perder nesta reescrita:
 *
 * 1. **A etiqueta é gravada ANTES de ir para a impressora.** Se o Bluetooth
 *    falhar no meio, o registro já existe e dá para reimprimir; o inverso
 *    deixaria papel colado no pote sem correspondência no sistema, que é o pior
 *    estado possível numa auditoria.
 * 2. **Cada cópia é uma etiqueta própria**, com id e código curto distintos.
 *    Três papéis com o mesmo id fariam a baixa de um marcar os três.
 */
export function FilaImpressao() {
  const { orgId, carregando } = useSessao()
  const { itens, somarItem, limpar, totalEtiquetas } = useCarrinho()
  const navegar = useNavigate()

  /**
   * Lote digitado na bancada, por produto — só quando difere do cadastrado.
   *
   * O lote padrão vem de `produto.lote_atual`, porque ele está impresso na
   * embalagem do fabricante e não muda a cada impressão. Este mapa guarda
   * apenas a exceção: a caixa aberta hoje que veio de outro lote.
   */
  const [lotes, setLotes] = useState<Record<string, string>>({})
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
  const naoPodeImprimir = motivoNaoPodeImprimir(perfil)

  /**
   * Produtos do carrinho, lidos do banco na hora.
   *
   * O carrinho guarda só ids: um produto renomeado ou arquivado entre a escolha
   * e a impressão precisa aparecer aqui com o estado atual, não com uma cópia
   * velha do momento em que foi somado.
   */
  const linhas = useLiveQuery(
    async () => {
      const ids = Object.keys(itens)
      if (ids.length === 0) return []
      const produtos = await db.products.bulkGet(ids)
      return produtos
        .filter((p): p is Produto => Boolean(p))
        .map((produto) => ({ produto, quantidade: itens[produto.id] ?? 0 }))
        .filter((l) => l.quantidade > 0)
    },
    [itens],
    [],
  )

  /** O lote que vai sair impresso: o da bancada, se houver; senão o do cadastro. */
  function loteDe(produto: Produto): string {
    return lotes[produto.id] ?? produto.lote_atual ?? ''
  }

  /** Etiqueta de exemplo do primeiro item, só para a prévia. Nada é gravado. */
  const previa = useMemo(() => {
    const primeira = linhas[0]
    if (!primeira || !orgId) return null
    return criarEtiqueta({
      orgId,
      produto: primeira.produto,
      membroId,
      membroNome,
      lote: lotes[primeira.produto.id] ?? primeira.produto.lote_atual ?? '',
    }).etiqueta
  }, [linhas, orgId, membroId, membroNome, lotes])

  async function executar() {
    if (linhas.length === 0 || !orgId || ocupado) return

    setErro(null)
    setSucesso(null)
    setOcupado(true)

    let impressas = 0

    try {
      const conexao = await abrirConexao(perfil as PerfilImpressora)

      for (const { produto, quantidade } of linhas) {
        const fornecedor = produto.supplier_id
          ? await db.suppliers.get(produto.supplier_id)
          : undefined
        const pasta = produto.folder_id ? await db.folders.get(produto.folder_id) : undefined

        for (let i = 0; i < quantidade; i++) {
          const { etiqueta, evento } = criarEtiqueta({
            orgId,
            produto,
            fornecedor,
            pasta,
            membroId,
            membroNome,
            lote: loteDe(produto),
          })

          await salvarESincronizar('labels', etiqueta)
          await registrarEvento(evento)

          setProgresso(`${impressas + 1} de ${totalEtiquetas} — ${produto.nome}`)

          await imprimir(
            conexao,
            modelo,
            dadosParaImpressao(etiqueta),
            perfil as PerfilImpressora,
          )
          impressas++
        }
      }

      limpar()
      setSucesso(`${impressas} etiquetas impressas.`)
    } catch (e) {
      if (foiCancelado(e)) {
        setErro(null)
      } else {
        setErro(
          `Parou na etiqueta ${impressas + 1} de ${totalEtiquetas}. As ${impressas} já ` +
            'impressas estão registradas e não serão perdidas. ' +
            (e instanceof Error ? e.message : ''),
        )
      }
    } finally {
      setOcupado(false)
      setProgresso(null)
    }
  }

  if (carregando) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  if (linhas.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-5xl">🏷️</p>
        <h1 className="mt-4 text-xl font-bold">
          {sucesso ? 'Tudo impresso' : 'Nada na fila'}
        </h1>
        {sucesso && <p className="mt-2 text-validade-ok">{sucesso}</p>}
        <p className="mt-2 text-slate-500">
          Some etiquetas tocando no <span className="font-bold">+</span> dos produtos.
        </p>
        <Link to="/pastas" className="btn-primario mt-6 inline-flex">
          Ir para os produtos
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conferir e imprimir</h1>
          <p className="text-sm text-slate-500">
            {totalEtiquetas} {totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'} ·{' '}
            {linhas.length} {linhas.length === 1 ? 'produto' : 'produtos'}
          </p>
        </div>
        <button className="btn-secundario px-4" onClick={() => navegar('/pastas')}>
          + Somar
        </button>
      </header>

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

      <ul className="mb-6 grid gap-2">
        {linhas.map(({ produto, quantidade }) => (
          <li key={produto.id} className="cartao p-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{produto.nome}</span>
                <span className="block text-sm text-slate-500">
                  vence em {produto.shelf_life_days}{' '}
                  {produto.shelf_life_days === 1 ? 'dia' : 'dias'}
                </span>
              </span>
              <StepperQuantidade
                quantidade={quantidade}
                rotulo={produto.nome}
                aoSomar={(delta) => somarItem(produto.id, delta)}
              />
            </div>

            {/* O lote é por produto, e não um campo único para a fila inteira:
                ele vem da embalagem do fabricante, e dois produtos na mesma fila
                quase nunca compartilham lote. */}
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              Lote
              <input
                className="min-h-[2.5rem] flex-1 rounded-lg border-2 border-slate-200 px-2 font-mono text-sm uppercase"
                value={loteDe(produto)}
                onChange={(e) =>
                  setLotes((atual) => ({ ...atual, [produto.id]: e.target.value }))
                }
                placeholder="Sem lote"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Lote de ${produto.nome}`}
              />
            </label>
          </li>
        ))}
      </ul>

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

      {previa && (
        <section className="mb-6">
          <label className="rotulo">Como vai sair</label>
          <PreviaEtiqueta
            modelo={modelo}
            dados={dadosParaImpressao(previa)}
            dpi={perfil?.dpi ?? 203}
          />
        </section>
      )}

      <button
        className="btn-primario w-full"
        onClick={() => void executar()}
        disabled={ocupado || !impressoraPronta || Boolean(naoPodeImprimir)}
      >
        {progresso ?? `Imprimir ${totalEtiquetas} etiquetas`}
      </button>

      <button
        className="btn-secundario mt-2 w-full text-red-700"
        onClick={limpar}
        disabled={ocupado}
      >
        Esvaziar fila
      </button>
    </div>
  )
}
