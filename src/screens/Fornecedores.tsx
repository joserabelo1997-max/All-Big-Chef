import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'

import type { Fornecedor } from '../domain/types'
import { salvarMensagemPedido } from '../lib/configuracoes'
import { contatosDisponivel, escolherDaAgenda } from '../lib/contatos'
import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import { MENSAGEM_PADRAO, montarMensagem, type ItemDoPedido } from '../lib/whatsapp'

/** Os três campos que descrevem um fornecedor, em cadastro e em edição. */
interface Campos {
  nome: string
  telefone: string
  contato: string
}

const VAZIO: Campos = { nome: '', telefone: '', contato: '' }

/** Os campos que o app preenche sozinho, com nome de gente em vez de sintaxe. */
const CAMPOS_DA_MENSAGEM = [
  { marca: '{{fornecedor}}', rotulo: 'nome do fornecedor' },
  { marca: '{{itens}}', rotulo: 'lista do que falta' },
] as const

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
            editando === f.id ? (
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
 * Modelo da mensagem de pedido.
 *
 * Editável porque cada casa fala com o fornecedor de um jeito, e uma mensagem
 * genérica escrita pelo sistema soa como robô — o que atrapalha justamente na
 * relação que faz o pedido chegar rápido.
 */
function ModeloDaMensagem({ orgId }: { orgId: string | null }) {
  const salvo = useLiveQuery(
    async () => (orgId ? db.org_settings.get(orgId) : undefined),
    [orgId],
  )

  const caixa = useRef<HTMLTextAreaElement>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const atual = texto ?? salvo?.mensagem_pedido ?? MENSAGEM_PADRAO

  function guardar(novoTexto: string) {
    setTexto(novoTexto)
    if (orgId) void salvarMensagemPedido(orgId, novoTexto)
  }

  /**
   * Insere o campo onde o cursor está — e não no fim.
   *
   * É o que faz os botões substituírem de fato a digitação do `{{...}}`: quem
   * está escrevendo "Olá, " quer o nome ali, naquele ponto da frase.
   */
  function inserir(marca: string) {
    const el = caixa.current
    const inicio = el?.selectionStart ?? atual.length
    const fim = el?.selectionEnd ?? atual.length
    const novoTexto = atual.slice(0, inicio) + marca + atual.slice(fim)
    guardar(novoTexto)

    // O cursor precisa continuar depois do que foi inserido, senão o próximo
    // botão joga o campo seguinte no lugar errado.
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(inicio + marca.length, inicio + marca.length)
    })
  }

  return (
    <section className="mt-8">
      <h2 className="rotulo" id="rotulo-mensagem">
        Mensagem do pedido
      </h2>
      <p className="mb-2 text-xs text-slate-500">
        O texto que abre no WhatsApp. Os dois botões abaixo põem no lugar do
        cursor o que o app preenche sozinho na hora do pedido.
      </p>

      <div className="mb-2 flex flex-wrap gap-2">
        {CAMPOS_DA_MENSAGEM.map(({ marca, rotulo }) => (
          <button
            key={marca}
            type="button"
            className="min-h-toque rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-semibold"
            onClick={() => inserir(marca)}
          >
            + {rotulo}
          </button>
        ))}
      </div>

      <textarea
        ref={caixa}
        className="campo py-3 text-sm"
        rows={5}
        aria-labelledby="rotulo-mensagem"
        value={atual}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => orgId && texto != null && void salvarMensagemPedido(orgId, texto)}
      />

      <div className="mt-3">
        <span className="rotulo">Como o fornecedor recebe</span>
        {/* A prévia é o que torna a caixa entendível sem explicar sintaxe: em
            vez de dizer o que `{{itens}}` significa, mostramos o resultado. */}
        <div className="mt-1 rounded-2xl bg-[#dcf8c6] p-3 text-sm leading-relaxed text-slate-800">
          <p className="whitespace-pre-wrap">
            {montarMensagem('Laticínios São João', ITENS_DE_EXEMPLO, atual)}
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Nomes e quantidades acima são só exemplo. O app abre a conversa com o
          texto pronto — o pedido não é registrado.
        </p>
      </div>

      {atual !== MENSAGEM_PADRAO && (
        <button
          type="button"
          className="btn-secundario mt-3 w-full"
          onClick={() => guardar(MENSAGEM_PADRAO)}
        >
          Voltar ao texto padrão
        </button>
      )}
    </section>
  )
}
