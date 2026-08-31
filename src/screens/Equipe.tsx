import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

import { db, salvarESincronizar } from '../lib/db'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'

/**
 * Equipe da cozinha.
 *
 * Estes NÃO são usuários com login. São os nomes que aparecem na hora de
 * imprimir ou dar baixa, para que a trilha de auditoria registre quem fez o
 * quê. O login é único do restaurante e fica aberto no tablet da bancada.
 */
export function Equipe() {
  const { orgId, carregando } = useSessao()
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [podeAprovar, setPodeAprovar] = useState(false)

  const equipe = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.team_members.where('org_id').equals(orgId).toArray()
      return todos
        .filter((m) => !m.deleted_at)
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
    await salvarESincronizar('team_members', {
      id: novoId(),
      org_id: orgId,
      nome: limpo,
      cargo: cargo.trim() || null,
      ativo: true,
      pode_aprovar: podeAprovar,
      created_at: agora,
      updated_at: agora,
    })

    setNome('')
    setCargo('')
    setPodeAprovar(false)
  }

  async function alternarAprovacao(id: string) {
    const membro = await db.team_members.get(id)
    if (!membro) return
    await salvarESincronizar('team_members', {
      ...membro,
      pode_aprovar: !membro.pode_aprovar,
      updated_at: new Date().toISOString(),
    })
  }

  async function alternarAtivo(id: string) {
    const membro = await db.team_members.get(id)
    if (!membro) return
    // Desativar em vez de apagar: etiquetas antigas guardam o nome de quem as
    // imprimiu, e quem saiu do restaurante não pode sumir do histórico.
    await salvarESincronizar('team_members', {
      ...membro,
      ativo: !membro.ativo,
      updated_at: new Date().toISOString(),
    })
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Equipe</h1>
      <p className="mb-5 text-sm text-slate-500">
        Quem aparece na lista ao imprimir e ao escanear. Não são logins — o acesso
        ao app é o do restaurante.
      </p>

      <div className="cartao mb-6 p-4">
        <label className="rotulo" htmlFor="nome-membro">
          Nome
        </label>
        <input
          id="nome-membro"
          className="campo mb-3"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Maria"
        />
        <label className="rotulo" htmlFor="cargo-membro">
          Função <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="cargo-membro"
          className="campo mb-3"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
          placeholder="Ex.: Cozinheira"
        />
        <label htmlFor="aprova-membro" className="mb-3 flex min-h-toque cursor-pointer items-start gap-3">
          <input
            id="aprova-membro"
            type="checkbox"
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-2 border-slate-300 accent-slate-900"
            checked={podeAprovar}
            onChange={(e) => setPodeAprovar(e.target.checked)}
          />
          <span>
            <span className="block font-semibold leading-tight">
              Pode liberar retirada do estoque
            </span>
            <span className="block text-xs text-slate-500">
              Aprova requisições — inclusive as próprias, para o preparo não
              parar esperando alguém aparecer.
            </span>
          </span>
        </label>
        <button
          className="btn-primario w-full"
          onClick={() => void adicionar()}
          disabled={!nome.trim()}
        >
          Adicionar
        </button>
      </div>

      {equipe.length === 0 ? (
        <p className="cartao p-6 text-center text-slate-500">
          Ninguém cadastrado ainda.
        </p>
      ) : (
        <ul className="grid gap-2">
          {equipe.map((membro) => (
            <li
              key={membro.id}
              className={`cartao flex items-center gap-3 p-4 ${
                membro.ativo ? '' : 'opacity-50'
              }`}
            >
              <span className="flex-1">
                <span className="block font-semibold">
                  {membro.nome}
                  {membro.pode_aprovar && (
                    <span
                      className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-white"
                      title="Pode liberar retirada do estoque"
                    >
                      libera
                    </span>
                  )}
                </span>
                {membro.cargo && (
                  <span className="block text-sm text-slate-500">{membro.cargo}</span>
                )}
                <button
                  className="mt-1 text-xs font-semibold text-slate-500 underline"
                  onClick={() => void alternarAprovacao(membro.id)}
                >
                  {membro.pode_aprovar ? 'Tirar permissão de liberar' : 'Deixar liberar estoque'}
                </button>
              </span>
              <button
                className="min-h-[2.75rem] shrink-0 rounded-lg border-2 border-slate-200 px-3 text-sm font-semibold"
                onClick={() => void alternarAtivo(membro.id)}
              >
                {membro.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
