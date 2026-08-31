import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'

import { db } from '../lib/db'
import { acharPorNome } from '../lib/fornecedores'

/**
 * Campo de fornecedor que aceita um nome novo.
 *
 * É um `<input list=…>` e não um `<select>`, e a diferença é o ponto do
 * componente: o `select` só oferece o que já existe, e obriga quem está com a
 * caixa na mão a sair da tela, cadastrar o fornecedor em outro lugar e voltar.
 * Aqui a pessoa digita o nome que está na nota e segue; o fornecedor inédito é
 * criado junto com o produto.
 *
 * O `datalist` é nativo: no celular ele vira a lista de sugestões do teclado,
 * sem depender de biblioteca nem de JavaScript de autocomplete que se comporta
 * mal com dedo molhado.
 */
export function CampoFornecedor({
  orgId,
  valor,
  aoMudar,
}: {
  orgId: string | null
  /** Nome do fornecedor, não o id — é o que a pessoa digita e lê. */
  valor: string
  aoMudar: (nome: string) => void
}) {
  const idCampo = useId()
  const idLista = `${idCampo}-lista`

  const fornecedores = useLiveQuery(
    async () => {
      if (!orgId) return []
      const todos = await db.suppliers.where('org_id').equals(orgId).toArray()
      return todos
        .filter((f) => !f.deleted_at && f.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [orgId],
    [],
  )

  // Compara ignorando acento e caixa, então digitar "sao joao" reconhece o
  // "São João" já cadastrado em vez de anunciar um fornecedor novo.
  const jaExiste = Boolean(acharPorNome(fornecedores, valor))
  const digitou = valor.trim().length > 0

  return (
    <div>
      <label className="rotulo" htmlFor={idCampo}>
        Fornecedor padrão
      </label>
      <input
        id={idCampo}
        list={idLista}
        className="campo"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Digite ou escolha"
        autoComplete="off"
        autoCorrect="off"
      />
      <datalist id={idLista}>
        {fornecedores.map((f) => (
          <option key={f.id} value={f.nome} />
        ))}
      </datalist>

      <p className="mt-1 text-xs text-slate-500">
        {digitou && !jaExiste ? (
          <span className="font-semibold text-emerald-700">
            Fornecedor novo — será cadastrado ao salvar o produto.
          </span>
        ) : (
          'Sai impresso na etiqueta. Pode ser trocado na hora de imprimir.'
        )}
      </p>
    </div>
  )
}
