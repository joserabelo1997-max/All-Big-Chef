import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'

import type { Fornecedor, Produto } from '../domain/types'
import { lerTextosDoPedido, salvarTextosDoPedido } from '../lib/configuracoes'
import { contatosDisponivel, escolherDaAgenda } from '../lib/contatos'
import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import {
  ABERTURA_PADRAO,
  FECHO_PADRAO,
  montarPedido,
  type ItemDoPedido,
  type TextosDoPedido,
} from '../lib/whatsapp'

/** Os três campos que descrevem um fornecedor, em cadastro e em edição. */
interface Campos {
  nome: string
  telefone: string
  contato: string
}

const VAZIO: Campos = { nome: '', telefone: '', contato: '' }

/** Exemplo da prévia. Serve para mostrar o formato, não dados de verdade. */
const ITENS_DE_EXEMPLO: ItemDoPedido[] = [
  { nome: 'Creme de leite', quantidade: 12, unidade: 'un' },
  { nome: 'Muçarela', quantidade: 5, unidade: 'kg' },
]

/** Fornecedores. Alimentam o campo `{{fornecedor}}` da etiqueta. */
export function Fornecedores() {
  const { orgId, carregando } = useSessao()
  const [novo, setNovo] = useState<Campos>(VAZIO)
  const [editando, setEditando] = useState<string | null>(null)
  const [vinculando, setVinculando] = useState<string | null>(null)

  const fornecedores = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.suppliers.where('org_id').equals(orgId).toArray()
      return todos
        .filter((f) => !f.deleted_at)
        .sort(
          (a, b) =>
            Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'),
        )
    },
    [orgId],
    [],
  )

  /** Quantos produtos cada fornecedor tem — o vínculo, visto do lado dele. */
  const quantosProdutos = useLiveQuery(
    async () => {
      if (!orgId) return {}
      const todos = await db.products.where('org_id').equals(orgId).toArray()
      const contagem: Record<string, number> = {}
      for (const p of todos) {
        if (!p.deleted_at && p.ativo && p.supplier_id) {
          contagem[p.supplier_id] = (contagem[p.supplier_id] ?? 0) + 1
        }
      }
      return contagem
    },
    [orgId],
    {} as Record<string, number>,
  )

  async function adicionar() {
    const limpo = novo.nome.trim()
    if (!limpo || !orgId) return

    const agora = new Date().toISOString()
    await salvarESincronizar('suppliers', {
      id: novoId(),
      org_id: orgId,
      nome: limpo,
      telefone: novo.telefone.trim() || null,
      contato: novo.contato.trim() || null,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    })

    setNovo(VAZIO)
  }

  async function arquivar(id: string) {
    const fornecedor = await db.suppliers.get(id)
    if (!fornecedor) return
    await salvarESincronizar('suppliers', {
      ...fornecedor,
      ativo: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Fornecedores</h1>
      <p className="mb-5 text-sm text-slate-500">
        Sai impresso na etiqueta, serve à rastreabilidade e recebe o pedido de
        reposição pelo WhatsApp.
      </p>

      <div className="cartao mb-6 p-4">
        <CamposDoFornecedor
          prefixoId="novo"
          valores={novo}
          aoMudar={setNovo}
          aoConfirmar={() => void adicionar()}
        />
        <button
          className="btn-primario mt-3 w-full"
          onClick={() => void adicionar()}
          disabled={!novo.nome.trim()}
        >
          Adicionar
        </button>
      </div>

      {fornecedores.length === 0 ? (
        <p className="cartao p-6 text-center text-slate-500">
          Nenhum fornecedor cadastrado ainda.
        </p>
      ) : (
        <ul className="grid gap-2">
          {fornecedores.map((f) =>
            vinculando === f.id ? (
              <li key={f.id} className="cartao p-4">
                <ProdutosDoFornecedor
                  fornecedor={f}
                  orgId={orgId}
                  aoFechar={() => setVinculando(null)}
                />
              </li>
            ) : editando === f.id ? (
              <li key={f.id} className="cartao p-4">
                <LinhaEmEdicao
                  fornecedor={f}
                  aoFechar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li
                key={f.id}
                className={`cartao flex items-center gap-3 p-4 ${f.ativo ? '' : 'opacity-50'}`}
              >
                <span className="flex-1">
                  <span className="block font-semibold">{f.nome}</span>
                  <span className="block text-sm text-slate-500">
                    {quantosProdutos[f.id] ?? 0}{' '}
                    {(quantosProdutos[f.id] ?? 0) === 1 ? 'produto' : 'produtos'}
                  </span>
                  {f.telefone || f.contato ? (
                    <span className="block text-sm text-slate-500">
                      {[f.telefone, f.contato].filter(Boolean).join(' · ')}
                    </span>
                  ) : (
                    // Quem nasceu pelo atalho da tela de produto vem sem
                    // telefone, e é isso que trava o pedido no WhatsApp. Dizer
                    // o que falta é mais útil que deixar a linha muda.
                    <span className="block text-sm text-amber-700">
                      Sem WhatsApp cadastrado
                    </span>
                  )}
                </span>
                <button
                  className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
                  onClick={() => setVinculando(f.id)}
                >
                  Produtos
                </button>
                <button
                  className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
                  onClick={() => setEditando(f.id)}
                >
                  Editar
                </button>
                {f.ativo && (
                  <button
                    className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
                    onClick={() => void arquivar(f.id)}
                  >
                    Arquivar
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      <ModeloDaMensagem orgId={orgId} />
    </div>
  )
}

/**
 * Edição de um fornecedor já cadastrado.
 *
 * Existe porque antes só dava para adicionar e arquivar: um fornecedor criado
 * pelo atalho da tela de produto nascia sem telefone e não havia como dar um a
 * ele — corrigir exigia arquivar e cadastrar de novo, o que espalha o histórico
 * das etiquetas já impressas entre dois registros.
 */
function LinhaEmEdicao({
  fornecedor,
  aoFechar,
}: {
  fornecedor: Fornecedor
  aoFechar: () => void
}) {
  const [campos, setCampos] = useState<Campos>({
    nome: fornecedor.nome,
    telefone: fornecedor.telefone ?? '',
    contato: fornecedor.contato ?? '',
  })

  async function salvar() {
    const limpo = campos.nome.trim()
    if (!limpo) return
    await salvarESincronizar('suppliers', {
      ...fornecedor,
      nome: limpo,
      telefone: campos.telefone.trim() || null,
      contato: campos.contato.trim() || null,
      updated_at: new Date().toISOString(),
    })
    aoFechar()
  }

  return (
    <>
      <CamposDoFornecedor
        prefixoId={fornecedor.id}
        valores={campos}
        aoMudar={setCampos}
        aoConfirmar={() => void salvar()}
      />
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primario flex-1"
          onClick={() => void salvar()}
          disabled={!campos.nome.trim()}
        >
          Salvar
        </button>
        <button
          className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-4 font-semibold"
          onClick={aoFechar}
        >
          Cancelar
        </button>
      </div>
    </>
  )
}

/**
 * Os campos do fornecedor, com o atalho para a agenda do aparelho.
 *
 * Um componente só para cadastro e edição porque a lógica da agenda — escolher
 * entre vários números, preencher o nome junto — é a mesma nos dois, e duplicá-la
 * significaria consertar cada coisa duas vezes.
 */
function CamposDoFornecedor({
  prefixoId,
  valores,
  aoMudar,
  aoConfirmar,
}: {
  prefixoId: string
  valores: Campos
  aoMudar: (campos: Campos) => void
  aoConfirmar: () => void
}) {
  // Números do contato escolhido quando não dá para saber qual é o do WhatsApp.
  const [aEscolher, setAEscolher] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  // Calculado uma vez na renderização: a API não aparece nem some no meio do uso.
  const temAgenda = contatosDisponivel()

  async function daAgenda() {
    setAviso(null)
    setAEscolher([])

    try {
      const contato = await escolherDaAgenda()
      if (!contato) return // desistiu; não é erro

      // O nome só entra se o campo estiver vazio: sobrescrever o que a pessoa
      // acabou de digitar seria perder trabalho dela.
      const nome = valores.nome.trim() ? valores.nome : (contato.nome ?? valores.nome)

      if (contato.sugerido) {
        aoMudar({ ...valores, nome, telefone: contato.sugerido })
        return
      }

      aoMudar({ ...valores, nome })

      if (contato.telefones.length === 0) {
        setAviso('Esse contato não tem telefone salvo na agenda.')
      } else {
        setAEscolher(contato.telefones)
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível abrir a agenda.')
    }
  }

  return (
    <>
      <label className="rotulo" htmlFor={`nome-${prefixoId}`}>
        Nome
      </label>
      <input
        id={`nome-${prefixoId}`}
        className="campo mb-3"
        value={valores.nome}
        onChange={(e) => aoMudar({ ...valores, nome: e.target.value })}
        placeholder="Ex.: Laticínios São João"
      />

      <label className="rotulo" htmlFor={`telefone-${prefixoId}`}>
        WhatsApp <span className="font-normal">(opcional)</span>
      </label>
      <div className="mb-1 flex gap-2">
        <input
          id={`telefone-${prefixoId}`}
          className="campo flex-1"
          type="tel"
          inputMode="tel"
          value={valores.telefone}
          onChange={(e) => aoMudar({ ...valores, telefone: e.target.value })}
          placeholder="(11) 98765-4321"
        />
        {/* Só aparece onde a agenda existe (Android e ChromeOS). No iPhone um
            botão que só explica por que não funciona ocupa a tela toda vez e
            não resolve nada. */}
        {temAgenda && (
          <button
            className="min-h-[2.75rem] shrink-0 rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
            onClick={() => void daAgenda()}
          >
            📇 Da agenda
          </button>
        )}
      </div>

      {aEscolher.length > 0 && (
        <div className="mb-2 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-600">
            Esse contato tem mais de um número. Qual recebe o pedido?
          </p>
          <div className="flex flex-wrap gap-2">
            {aEscolher.map((numero) => (
              <button
                key={numero}
                className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 bg-white px-3 text-sm font-semibold"
                onClick={() => {
                  aoMudar({ ...valores, telefone: numero })
                  setAEscolher([])
                }}
              >
                {numero}
              </button>
            ))}
          </div>
        </div>
      )}

      {aviso && <p className="mb-2 text-xs text-amber-700">{aviso}</p>}

      <p className="mb-3 text-xs text-slate-500">
        É por aqui que o pedido de reposição abre. Pode digitar com parênteses e
        traço.
      </p>

      <label className="rotulo" htmlFor={`contato-${prefixoId}`}>
        Contato <span className="font-normal">(opcional)</span>
      </label>
      <input
        id={`contato-${prefixoId}`}
        className="campo"
        value={valores.contato}
        onChange={(e) => aoMudar({ ...valores, contato: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && aoConfirmar()}
        placeholder="Telefone ou e-mail"
      />
    </>
  )
}

/**
 * Os dois textos da mensagem de pedido.
 *
 * Duas caixas e nenhum marcador. A versão anterior tinha uma caixa só, com
 * `{{fornecedor}}` e `{{itens}}` dentro e botões que os inseriam — mas eles
 * continuavam texto comum, então dava para digitar por cima, apagar metade ou o
 * ditado por voz trocar a palavra. Foi o que aconteceu: `{{itens}}` virou
 * `{{hamach}}` e o pedido passou a sair sem produto nenhum, em silêncio.
 *
 * Aqui a lista entra sempre ENTRE as duas caixas, montada pelo app. Não há o
 * que corromper: o pior que acontece é o texto ficar esquisito.
 */
function ModeloDaMensagem({ orgId }: { orgId: string | null }) {
  const salvos = useLiveQuery(
    async () => (orgId ? lerTextosDoPedido(orgId) : undefined),
    [orgId],
  )

  const [rascunho, setRascunho] = useState<TextosDoPedido | null>(null)
  const atual = rascunho ?? salvos ?? { abertura: ABERTURA_PADRAO, fecho: FECHO_PADRAO }

  function mudar(parte: Partial<TextosDoPedido>) {
    setRascunho({ ...atual, ...parte })
  }

  function guardar() {
    if (orgId && rascunho) void salvarTextosDoPedido(orgId, rascunho)
  }

  const ehPadrao =
    atual.abertura === ABERTURA_PADRAO && atual.fecho === FECHO_PADRAO

  return (
    <section className="mt-8">
      <h2 className="rotulo">Mensagem do pedido</h2>
      <p className="mb-3 text-xs text-slate-500">
        A lista dos produtos entra sozinha no meio, montada na hora do pedido.
        Você escreve só o que vem antes e o que vem depois dela.
      </p>

      <label className="rotulo" htmlFor="pedido-abertura">
        Antes da lista
      </label>
      <textarea
        id="pedido-abertura"
        className="campo mb-3 py-3 text-sm"
        rows={2}
        value={atual.abertura}
        onChange={(e) => mudar({ abertura: e.target.value })}
        onBlur={guardar}
        placeholder={ABERTURA_PADRAO}
      />

      <label className="rotulo" htmlFor="pedido-fecho">
        Depois da lista
      </label>
      <textarea
        id="pedido-fecho"
        className="campo py-3 text-sm"
        rows={2}
        value={atual.fecho}
        onChange={(e) => mudar({ fecho: e.target.value })}
        onBlur={guardar}
        placeholder={FECHO_PADRAO}
      />

      <div className="mt-4">
        <span className="rotulo">Como o fornecedor recebe</span>
        <div className="mt-1 rounded-2xl bg-[#dcf8c6] p-3 text-sm leading-relaxed text-slate-800">
          <p className="whitespace-pre-wrap">{montarPedido(ITENS_DE_EXEMPLO, atual)}</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Os produtos acima são só exemplo. O app abre a conversa com o texto
          pronto — o pedido não é registrado.
        </p>
      </div>

      {!ehPadrao && (
        <button
          type="button"
          className="btn-secundario mt-3 w-full"
          onClick={() => {
            const padrao = { abertura: ABERTURA_PADRAO, fecho: FECHO_PADRAO }
            setRascunho(padrao)
            if (orgId) void salvarTextosDoPedido(orgId, padrao)
          }}
        >
          Voltar ao texto padrão
        </button>
      )}
    </section>
  )
}

/**
 * Quais produtos se compra deste fornecedor.
 *
 * O vínculo sempre existiu — `Produto.supplier_id` —, mas só dava para criá-lo
 * de dentro do cadastro do produto, um por um. Quem abria o fornecedor não via
 * nada e concluía, com razão, que não havia como ligar produtos a ele.
 *
 * Aqui é o mesmo campo, visto do outro lado: marcar grava `supplier_id`,
 * desmarcar apaga. Sem tabela nova, sem vínculo paralelo que pudesse divergir
 * do que a tela de produto grava.
 */
function ProdutosDoFornecedor({
  fornecedor,
  orgId,
  aoFechar,
}: {
  fornecedor: Fornecedor
  orgId: string | null
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')

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

  /**
   * Quem já estava ligado quando o painel abriu.
   *
   * A ordem é calculada a partir DISTO, e não do vínculo atual, para a lista
   * não se reordenar a cada toque. Ordenar pelo valor vivo fazia o item pular
   * para o fim da lista no instante em que era desmarcado — debaixo do dedo de
   * quem estava marcando vários seguidos, que é justamente o uso desta tela.
   */
  const [ordemInicial] = useState(() => new Set<string>())
  const [semeada, setSemeada] = useState(false)

  useEffect(() => {
    if (semeada || produtos.length === 0) return
    for (const p of produtos) {
      if (p.supplier_id === fornecedor.id) ordemInicial.add(p.id)
    }
    setSemeada(true)
  }, [produtos, fornecedor.id, ordemInicial, semeada])

  const filtrados = useMemo(() => {
    const alvo = semAcento(busca)
    // Os já ligados primeiro: é a resposta à pergunta "o que eu compro dele?".
    const ordenados = [...produtos].sort(
      (a, b) => Number(ordemInicial.has(b.id)) - Number(ordemInicial.has(a.id)),
    )
    return alvo ? ordenados.filter((p) => semAcento(p.nome).includes(alvo)) : ordenados
  }, [produtos, busca, ordemInicial, semeada])

  /**
   * O que o dedo acabou de mandar, antes de o banco responder.
   *
   * Sem isto a caixinha é controlada só pelo `supplier_id` que vem do Dexie: ao
   * tocar, o React redesenha na hora com o valor ANTIGO — a gravação ainda não
   * voltou — e a marca só muda alguns quadros depois. Num aparelho de bancada
   * isso é o toque que "não pegou": a pessoa toca de novo e desfaz o que tinha
   * acabado de fazer, sem entender por quê.
   *
   * `undefined` = ainda não mexi nisto; o valor do banco manda.
   */
  const [alterados, setAlterados] = useState<Record<string, boolean>>({})

  const estaLigado = (produto: Produto) =>
    alterados[produto.id] ?? produto.supplier_id === fornecedor.id

  async function alternar(produto: Produto, ligado: boolean) {
    setAlterados((atual) => ({ ...atual, [produto.id]: ligado }))
    await salvarESincronizar('products', {
      ...produto,
      supplier_id: ligado ? fornecedor.id : null,
      updated_at: new Date().toISOString(),
    })
  }

  const ligados = produtos.filter(estaLigado).length

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex-1">
          <span className="block font-semibold">{fornecedor.nome}</span>
          <span className="block text-sm text-slate-500">
            {ligados} {ligados === 1 ? 'produto ligado' : 'produtos ligados'}
          </span>
        </span>
        <button
          className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-4 font-semibold"
          onClick={aoFechar}
        >
          Fechar
        </button>
      </div>

      <input
        className="campo mb-2"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto…"
        aria-label={`Buscar produto para ${fornecedor.nome}`}
      />

      {filtrados.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          {produtos.length === 0
            ? 'Nenhum produto cadastrado ainda.'
            : `Nenhum produto com "${busca}".`}
        </p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {filtrados.map((produto) => {
            const ligado = estaLigado(produto)
            const deOutro = Boolean(produto.supplier_id) && !ligado

            return (
              <li key={produto.id}>
                <label className="flex min-h-toque items-center gap-3 border-b border-slate-100 py-2">
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-slate-900"
                    checked={ligado}
                    onChange={(e) => void alternar(produto, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{produto.nome}</span>
                    {/* Um produto tem um fornecedor só. Dizer de quem ele é hoje
                        evita a troca sem querer, que só apareceria no próximo
                        pedido — na conversa errada. */}
                    {deOutro && (
                      <span className="block text-xs text-amber-700">
                        hoje é de outro fornecedor
                      </span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** Busca sem acento e sem caixa, como no resto do app. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    // Faixa dos acentos combinantes, que o NFD separou da letra base.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
