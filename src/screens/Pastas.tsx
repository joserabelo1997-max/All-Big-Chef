import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'

/**
 * Pastas de produtos (Laticínios, Pescados, Carnes…).
 *
 * Grade de cartões grandes em vez de lista: a navegação é feita com o polegar,
 * muitas vezes com luva, e o alvo precisa perdoar imprecisão.
 */
export function Pastas() {
  const { orgId, carregando } = useSessao()
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')

  const pastas = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todas = await db.folders.where('org_id').equals(orgId).toArray()
      return todas
        .filter((p) => !p.deleted_at)
        .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  const contagens = useLiveQuery<Record<string, number>, Record<string, number>>(
    async () => {
      if (!orgId) return {}
      const produtos = await db.products.where('org_id').equals(orgId).toArray()
      const mapa: Record<string, number> = {}
      for (const p of produtos) {
        if (p.deleted_at || !p.folder_id) continue
        mapa[p.folder_id] = (mapa[p.folder_id] ?? 0) + 1
      }
      return mapa
    },
    [orgId],
    {},
  )

  async function criar() {
    const limpo = nome.trim()
    if (!limpo || !orgId) return

    const agora = new Date().toISOString()
    await salvarESincronizar('folders', {
      id: novoId(),
      org_id: orgId,
      nome: limpo,
      cor: '#64748b',
      ordem: (pastas.at(-1)?.ordem ?? 0) + 1,
      created_at: agora,
      updated_at: agora,
    })

    setNome('')
    setCriando(false)
  }

  if (carregando) return <Carregando />

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-slate-500">Organizados por pasta</p>
        </div>
        <button
          className="btn-secundario px-4"
          onClick={() => setCriando((v) => !v)}
          aria-label="Nova pasta"
        >
          + Pasta
        </button>
      </header>

      {criando && (
        <div className="cartao mb-4 p-4">
          <label className="rotulo" htmlFor="nova-pasta">
            Nome da pasta
          </label>
          <input
            id="nova-pasta"
            className="campo mb-3"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void criar()}
            placeholder="Ex.: Sobremesas"
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn-primario flex-1" onClick={() => void criar()}>
              Criar
            </button>
            <button className="btn-secundario" onClick={() => setCriando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {pastas.map((pasta) => (
          <Link
            key={pasta.id}
            to={`/produtos?pasta=${pasta.id}`}
            className="cartao flex min-h-[7rem] flex-col justify-between p-4"
            style={{ borderLeftColor: pasta.cor, borderLeftWidth: 6 }}
          >
            <span aria-hidden className="text-3xl">
              {pasta.icone ?? '📁'}
            </span>
            <span>
              <span className="block font-semibold leading-tight">{pasta.nome}</span>
              <span className="block text-sm text-slate-500">
                {contagens[pasta.id] ?? 0}{' '}
                {(contagens[pasta.id] ?? 0) === 1 ? 'produto' : 'produtos'}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <Link to="/produtos" className="btn-secundario mt-4 w-full">
        Ver todos os produtos
      </Link>
    </div>
  )
}

function Carregando() {
  return (
    <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  )
}
