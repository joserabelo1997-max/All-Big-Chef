import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'

import { ehApenasAviso, pendenciasDeConfiguracao } from '../domain/pendencias'
import { db } from '../lib/db'
import { usePreferencias } from '../lib/usePreferencias'

/**
 * O que ainda falta configurar para o estoque funcionar por inteiro.
 *
 * Aparece só enquanto houver pendência e some sozinho quando não houver — sem
 * botão de dispensar, porque um aviso que se pode fechar sem resolver vira um
 * aviso que sempre se fecha sem resolver.
 *
 * Fica na tela de Estoque, e não numa tela de boas-vindas: é aqui que a pessoa
 * está quando as consequências aparecem, e daqui os atalhos levam direto ao
 * lugar de cada ajuste.
 *
 * Como tudo vem de `useLiveQuery` sobre o Dexie, o cartão se atualiza sozinho
 * assim que o ajuste é feito, sem recarregar a página.
 */
export function PendenciasEstoque({ orgId }: { orgId: string | null }) {
  const { diasFechados } = usePreferencias(orgId)

  const fornecedores = useLiveQuery(
    async () => (orgId ? db.suppliers.where('org_id').equals(orgId).toArray() : []),
    [orgId],
    [],
  )

  const equipe = useLiveQuery(
    async () => (orgId ? db.team_members.where('org_id').equals(orgId).toArray() : []),
    [orgId],
    [],
  )

  const pendencias = pendenciasDeConfiguracao({ fornecedores, equipe, diasFechados })
  if (pendencias.length === 0) return null

  return (
    <section
      className="cartao mb-4 border-amber-300 bg-amber-50 p-4"
      aria-labelledby="titulo-pendencias"
    >
      <h2 id="titulo-pendencias" className="font-bold text-amber-900">
        Falta configurar
      </h2>
      <p className="mb-3 text-xs text-amber-800">
        Nada aqui trava o estoque — mas cada item apagado é uma função que deixa
        de funcionar em silêncio.
      </p>

      <ul className="grid gap-2">
        {pendencias.map((p) => (
          <li key={p.chave}>
            <Link
              to={p.destino}
              className="flex items-center gap-3 rounded-xl border-2 border-amber-200 bg-white p-3"
            >
              <span className="flex-1">
                {/* O título fica sozinho na linha: encaixar a ressalva dentro
                    dele partia a frase no meio e atrapalhava a leitura. */}
                <span className="block font-semibold leading-tight">{p.titulo}</span>
                <span className="block text-xs text-slate-500">
                  {p.consequencia}
                  {ehApenasAviso(p.chave) && ' Se a casa abre todo dia, ignore.'}
                </span>
                <span className="mt-1 block text-xs font-semibold text-amber-800">
                  {p.rotuloDestino}
                </span>
              </span>
              <span aria-hidden className="text-amber-300">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
