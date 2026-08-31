import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { db } from '../lib/db'
import { normalizarCodigo } from '../lib/ids'
import { extrairIdDaEtiqueta } from '../scanning/scanner'
import { useLeitorHid } from '../scanning/useLeitorHid'

/**
 * Liga o leitor de código de barras ao app inteiro.
 *
 * Escanear um pote em qualquer tela abre a etiqueta dele. É o que torna a
 * conferência de geladeira viável: pegar o leitor, passar pelos potes um a um e
 * ver o estado de cada um sem tocar no aparelho.
 *
 * Aceita as duas formas que podem estar impressas: a URL completa do nosso QR e
 * o código curto de seis caracteres, que é o que sobra quando o QR está
 * amassado e alguém imprimiu só ele.
 */
export function LeitorGlobal() {
  const navegar = useNavigate()
  const [aviso, setAviso] = useState<string | null>(null)

  useLeitorHid((codigo) => {
    void (async () => {
      // 1) Formato normal: a URL do nosso QR, da qual extraímos o uuid.
      const id = extrairIdDaEtiqueta(codigo)
      if (id) {
        setAviso(null)
        navegar(`/l/${id}`)
        return
      }

      // 2) Código curto impresso na etiqueta.
      const curto = normalizarCodigo(codigo)
      if (curto.length >= 4 && curto.length <= 10) {
        const achada = await db.labels.where('short_code').equals(curto).first()
        if (achada) {
          setAviso(null)
          navegar(`/l/${achada.id}`)
          return
        }
      }

      // 3) Qualquer outro código — um EAN de embalagem, por exemplo. Avisar é
      // melhor que ignorar em silêncio: quem escaneou precisa saber que o
      // aparelho leu, mas que aquele código não é de uma etiqueta nossa.
      setAviso(`Código lido, mas não é de uma etiqueta: ${codigo.slice(0, 24)}`)
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
