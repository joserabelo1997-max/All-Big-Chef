/**
 * Conversão de imagem RGBA para bitmap monocromático empacotado.
 *
 * Impressoras térmicas não têm tons de cinza: cada dot queima ou não queima. Este
 * módulo é a fronteira entre o mundo do canvas (RGBA, 8 bits por canal) e o
 * mundo da impressora (1 bit por ponto).
 */

export interface BitmapMono {
  /** Largura em dots, já arredondada para múltiplo de 8. */
  largura: number
  altura: number
  /** Bytes por linha (`largura / 8`). */
  bytesPorLinha: number
  /**
   * Dados empacotados, linha a linha, sem padding entre linhas.
   * Bit 1 = ponto PRETO (queima). O bit mais significativo de cada byte é o
   * pixel mais à esquerda.
   *
   * Essa é a convenção do ESC/POS e do CPCL. O TSPL usa o oposto (1 = branco),
   * e é o encoder do TSPL que inverte — não este módulo. Manter uma única
   * convenção aqui evita que cada encoder tenha que adivinhar o que recebeu.
   */
  dados: Uint8Array
}

/** Arredonda para cima até o múltiplo de 8 mais próximo. */
export function alinharEm8(valor: number): number {
  return Math.ceil(valor / 8) * 8
}

/**
 * Luminância perceptual (Rec. 601). Usar a média simples dos canais escureceria
 * o vermelho e clarearia o azul de forma visível num logo colorido.
 */
function luminancia(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export interface OpcoesMono {
  /** Ponto de corte 0–255. Acima disso vira branco. Padrão 128. */
  limiar?: number
  /**
   * Difusão de erro Floyd–Steinberg, para imagens com tons contínuos (um logo
   * fotográfico, por exemplo).
   *
   * Desligado por padrão, e deve continuar desligado para etiquetas normais:
   * dithering em texto pequeno produz borda serrilhada, e num QR Code chega a
   * quebrar a leitura, porque espalha erro para dentro dos módulos e desfaz o
   * contraste que o leitor procura.
   */
  dithering?: boolean
}

/**
 * Converte pixels RGBA em bitmap 1bpp.
 *
 * Pixels transparentes são tratados como brancos: um canvas recém-criado começa
 * transparente, e sem isso a etiqueta inteira sairia preta — queimando a fita e
 * gastando a cabeça térmica à toa.
 */
export function paraMonocromatico(
  rgba: Uint8ClampedArray,
  larguraOriginal: number,
  altura: number,
  opcoes: OpcoesMono = {},
): BitmapMono {
  const { limiar = 128, dithering = false } = opcoes

  if (larguraOriginal <= 0 || altura <= 0) {
    throw new Error('Dimensões da imagem devem ser positivas.')
  }
  if (rgba.length < larguraOriginal * altura * 4) {
    throw new Error(
      `Buffer RGBA menor que o esperado: ${rgba.length} bytes para ` +
        `${larguraOriginal}×${altura} (esperado ${larguraOriginal * altura * 4}).`,
    )
  }

  const largura = alinharEm8(larguraOriginal)
  const bytesPorLinha = largura / 8
  const dados = new Uint8Array(bytesPorLinha * altura)

  // Escala de cinza, já compondo a transparência sobre branco.
  const cinza = new Float32Array(larguraOriginal * altura)
  for (let i = 0; i < larguraOriginal * altura; i++) {
    const p = i * 4
    const alfa = rgba[p + 3]! / 255
    const valor = luminancia(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!)
    cinza[i] = valor * alfa + 255 * (1 - alfa)
  }

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < larguraOriginal; x++) {
      const i = y * larguraOriginal + x
      const antigo = cinza[i]!
      const preto = antigo < limiar

      if (preto) {
        const bit = 7 - (x % 8)
        dados[y * bytesPorLinha + (x >> 3)]! |= 1 << bit
      }

      if (dithering) {
        // Floyd–Steinberg: distribui o erro para os vizinhos ainda não visitados.
        const erro = antigo - (preto ? 0 : 255)
        const espalhar = (dx: number, dy: number, peso: number) => {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= larguraOriginal || ny >= altura) return
          cinza[ny * larguraOriginal + nx]! += (erro * peso) / 16
        }
        espalhar(1, 0, 7)
        espalhar(-1, 1, 3)
        espalhar(0, 1, 5)
        espalhar(1, 1, 1)
      }
    }
    // As colunas de padding (entre larguraOriginal e largura) ficam em 0 =
    // branco, que é o correto: são área física da etiqueta que não deve queimar.
  }

  return { largura, altura, bytesPorLinha, dados }
}

/** Inverte todos os bits. Usado pelo TSPL, cuja convenção é 1 = branco. */
export function inverterBits(bitmap: BitmapMono): BitmapMono {
  const dados = new Uint8Array(bitmap.dados.length)
  for (let i = 0; i < bitmap.dados.length; i++) dados[i] = ~bitmap.dados[i]! & 0xff
  return { ...bitmap, dados }
}

/**
 * Recorta um intervalo de linhas. O ESC/POS limita a altura por bloco raster,
 * então a etiqueta precisa ser enviada em faixas.
 */
export function fatiarLinhas(
  bitmap: BitmapMono,
  inicio: number,
  quantidade: number,
): BitmapMono {
  const fim = Math.min(inicio + quantidade, bitmap.altura)
  const altura = Math.max(0, fim - inicio)
  return {
    largura: bitmap.largura,
    altura,
    bytesPorLinha: bitmap.bytesPorLinha,
    dados: bitmap.dados.slice(
      inicio * bitmap.bytesPorLinha,
      fim * bitmap.bytesPorLinha,
    ),
  }
}
