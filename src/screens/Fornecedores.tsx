import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'

/** Fornecedores. Alimentam o campo `{{fornecedor}}` da etiqueta. */
export function Fornecedores() {
  const { orgId, carregando } = useSessao()
  const [nome, setNome] = useState('')
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
      contato: contato.trim() || null,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    })

    setNome('')
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
        Sai impresso na etiqueta e serve à rastreabilidade.
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
                {f.contato && (
                  <span className="block text-sm text-slate-500">{f.contato}</span>
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
    </div>
  )
}
