import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { destinoDaLeitura, resolverLeitura } from '../lib/leitura'
import { useSessao } from '../lib/useSessao'
import { useLeitorHid } from '../scanning/useLeitorHid'

/**
 * Liga o leitor de código de barras ao app inteiro.
 *
 * Escanear em qualquer tela é o que torna a conferência de geladeira viável:
 * pegar o leitor, passar pelos potes um a um e ver o estado de cada um sem
 * tocar no aparelho.
 *
 * A decisão de para onde ir mora em `lib/leitura.ts`, onde dá para exercitá-la
 * com testes. Aqui só sobra obedecer ao resultado e dizer algo quando não há
 * para onde ir.
 */
export function LeitorGlobal() {
  const navegar = useNavigate()
  const { orgId } = useSessao()
  const [aviso, setAviso] = useState<string | null>(null)

  useLeitorHid((codigo) => {
    void (async () => {
      if (!orgId) return

      const leitura = await resolverLeitura(codigo, orgId)
      const destino = destinoDaLeitura(leitura)

      if (destino) {
        setAviso(null)
        navegar(destino)
        return
      }

      // Avisar é melhor que ignorar em silêncio: quem bipou precisa saber que o
      // aparelho leu, mas que aquele código não é de nada que o app conheça —
      // senão bipa de novo achando que o leitor falhou.
      setAviso(`Código lido, mas não é de uma etiqueta nem de um produto: ${codigo.slice(0, 24)}`)
      setTimeout(() => setAviso(null), 4000)
    })()
  })

  if (!aviso) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-2 z-20 mx-auto max-w-md rounded-xl border-2
        border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 shadow-lg"
    >
      {aviso}
    </div>
  )
}
