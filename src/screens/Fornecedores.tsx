import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

import { salvarMensagemPedido } from '../lib/configuracoes'
import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import { MENSAGEM_PADRAO } from '../lib/whatsapp'

/** Fornecedores. Alimentam o campo `{{fornecedor}}` da etiqueta. */
export function Fornecedores() {
  const { orgId, carregando } = useSessao()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [contato, setContato] = useState('')

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
    const limpo = nome.trim()
    if (!limpo || !orgId) return

    const agora = new Date().toISOString()
    await salvarESincronizar('suppliers', {
      id: novoId(),
      org_id: orgId,
      nome: limpo,
      telefone: telefone.trim() || null,
      contato: contato.trim() || null,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    })

    setNome('')
    setTelefone('')
    setContato('')
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
        <label className="rotulo" htmlFor="nome-fornecedor">
          Nome
        </label>
        <input
          id="nome-fornecedor"
          className="campo mb-3"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Laticínios São João"
        />
        <label className="rotulo" htmlFor="telefone-fornecedor">
          WhatsApp <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="telefone-fornecedor"
          className="campo mb-1"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(11) 98765-4321"
        />
        <p className="mb-3 text-xs text-slate-500">
          É por aqui que o pedido de reposição abre. Pode digitar com
          parênteses e traço.
        </p>
        <label className="rotulo" htmlFor="contato-fornecedor">
          Contato <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="contato-fornecedor"
          className="campo mb-3"
          value={contato}
          onChange={(e) => setContato(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
          placeholder="Telefone ou e-mail"
        />
        <button
          className="btn-primario w-full"
          onClick={() => void adicionar()}
          disabled={!nome.trim()}
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
          {fornecedores.map((f) => (
            <li
              key={f.id}
              className={`cartao flex items-center gap-3 p-4 ${f.ativo ? '' : 'opacity-50'}`}
            >
              <span className="flex-1">
                <span className="block font-semibold">{f.nome}</span>
                {(f.telefone || f.contato) && (
                  <span className="block text-sm text-slate-500">
                    {[f.telefone, f.contato].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {f.ativo && (
                <button
                  className="min-h-[2.75rem] rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
                  onClick={() => void arquivar(f.id)}
                >
                  Arquivar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ModeloDaMensagem orgId={orgId} />
    </div>
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

  const [texto, setTexto] = useState<string | null>(null)
  const atual = texto ?? salvo?.mensagem_pedido ?? MENSAGEM_PADRAO

  return (
    <section className="mt-8">
      <h2 className="rotulo" id="rotulo-mensagem">
        Mensagem do pedido
      </h2>
      <textarea
        className="campo py-3 font-mono text-sm"
        rows={5}
        aria-labelledby="rotulo-mensagem"
        value={atual}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => orgId && texto != null && void salvarMensagemPedido(orgId, texto)}
      />
      <p className="mt-1 text-xs text-slate-500">
        <code>{'{{fornecedor}}'}</code> vira o nome e <code>{'{{itens}}'}</code> vira a
        lista do que está faltando. O app só abre o WhatsApp com o texto pronto —
        o pedido não é registrado.
      </p>
    </section>
  )
}
