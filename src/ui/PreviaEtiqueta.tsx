import { useEffect, useRef, useState } from 'react'

import { paraMonocromatico } from '../printing/monochrome'
import { renderizarEtiqueta } from '../printing/renderer'
import type { DadosEtiqueta, ModeloEtiqueta } from '../printing/template'

/**
 * Pré-visualização fiel da etiqueta.
 *
 * Renderiza pelo mesmo caminho da impressão e, por padrão, aplica também a
 * conversão para 1 bit. Isso importa: uma prévia em tons de cinza esconde
 * justamente os problemas que só aparecem no papel — texto fino que some,
 * borda que engorda, QR que perde contraste. Mostrar o bitmap real é mostrar a
 * etiqueta real.
 */
export function PreviaEtiqueta({
  modelo,
  dados,
  dpi = 203,
  larguraExibicao = 320,
  monocromatico = true,
  semBorda = false,
  className,
}: {
  modelo: ModeloEtiqueta
  dados: DadosEtiqueta
  dpi?: number
  /** Largura em pixels de CSS. A resolução interna é sempre a da impressora. */
  larguraExibicao?: number
  monocromatico?: boolean
  /**
   * Remove a borda e a legenda. Usado pelo editor, onde os alvos de arrasto
   * ficam sobrepostos ao canvas: 2 px de borda desalinhariam tudo.
   */
  semBorda?: boolean
  className?: string
}) {
  const destino = useRef<HTMLCanvasElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    void (async () => {
      try {
        const { rgba, largura, altura } = await renderizarEtiqueta(modelo, dados, { dpi })
        if (cancelado) return

        const canvas = destino.current
        if (!canvas) return
        canvas.width = largura
        canvas.height = altura

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const imagem = ctx.createImageData(largura, altura)

        if (monocromatico) {
          const bitmap = paraMonocromatico(rgba, largura, altura)
          for (let y = 0; y < altura; y++) {
            for (let x = 0; x < largura; x++) {
              const bit =
                (bitmap.dados[y * bitmap.bytesPorLinha + (x >> 3)]! >> (7 - (x % 8))) & 1
              const tom = bit ? 0 : 255
              const p = (y * largura + x) * 4
              imagem.data[p] = tom
              imagem.data[p + 1] = tom
              imagem.data[p + 2] = tom
              imagem.data[p + 3] = 255
            }
          }
        } else {
          imagem.data.set(rgba)
        }

        ctx.putImageData(imagem, 0, 0)
        setErro(null)
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha ao gerar a prévia.')
      }
    })()

    return () => {
      cancelado = true
    }
  }, [modelo, dados, dpi, monocromatico])

  const alturaExibicao = (larguraExibicao * modelo.alturaMm) / modelo.larguraMm

  return (
    <div className={className}>
      <div
        className={`relative overflow-hidden bg-white ${
          semBorda ? '' : 'rounded-lg border-2 border-slate-300 shadow-sm'
        }`}
        style={{ width: larguraExibicao, height: alturaExibicao }}
      >
        <canvas
          ref={destino}
          className="h-full w-full"
          // A etiqueta é desenhada em dots da impressora e reduzida na tela.
          // Sem isso o navegador suaviza e a prévia mente sobre a nitidez real.
          style={{ imageRendering: 'pixelated' }}
        />
        {erro && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 px-3 text-center text-xs text-red-700">
            {erro}
          </div>
        )}
      </div>
      {!semBorda && (
        <p className="mt-1.5 text-xs text-slate-500">
          {modelo.larguraMm} × {modelo.alturaMm} mm · {dpi} dpi
        </p>
      )}
    </div>
  )
}
