import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { db } from '../lib/db'
import { normalizarCodigo } from '../lib/ids'
import { identificarCodigo } from '../scanning/scanner'
import { useLeitorHid } from '../scanning/useLeitorHid'

/**
 * Liga o leitor de código de barras ao app inteiro.
 *
 * Escanear um pote em qualquer tela abre a etiqueta dele. É o que torna a
 * conferência de geladeira viável: pegar o leitor, passar pelos potes um a um e
 * ver o estado de cada um sem tocar no aparelho.
 *
 * Reconhece os DOIS QR que o app imprime — o de validade (`#/l/`) e o de
 * inventário (`#/i/`) — pelo caminho da URL, e abre a tela certa para cada um.
 * Também aceita o código curto impresso, que é o que sobra quando o QR está
 * amassado; nesse caso procura nas duas tabelas.
 */
export function LeitorGlobal() {
  const navegar = useNavigate()
  const [aviso, setAviso] = useState<string | null>(null)

  useLeitorHid((codigo) => {
    void (async () => {
      // 1) Formato normal: a URL do nosso QR. O caminho diz qual das duas
      //    etiquetas é, então a tela de validade nunca recebe um pote de
      //    inventário — que não tem data nenhuma para mostrar.
      const lido = identificarCodigo(codigo)
      if (lido) {
        setAviso(null)
        navegar(lido.tipo === 'inventario' ? `/i/${lido.id}` : `/l/${lido.id}`)
        return
      }

      // 2) Código curto impresso. Procura nas duas tabelas: quem digita o
      //    código de um pote de inventário espera cair na contagem, não num
      //    "não encontrado".
      const curto = normalizarCodigo(codigo)
      if (curto.length >= 4 && curto.length <= 10) {
        const achada = await db.labels.where('short_code').equals(curto).first()
        if (achada) {
          setAviso(null)
          navegar(`/l/${achada.id}`)
          return
        }

        const doInventario = await db.inventory_tags.where('short_code').equals(curto).first()
        if (doInventario) {
          setAviso(null)
          navegar(`/i/${doInventario.id}`)
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
