import QRCode from 'qrcode'

import { alinharEm8 } from './monochrome'
import {
  interpolar,
  type DadosEtiqueta,
  type ElementoEtiqueta,
  type ElementoQrcode,
  type ElementoTexto,
  type ModeloEtiqueta,
} from './template'

/**
 * Desenha a etiqueta num canvas com as dimensões EXATAS em dots da impressora.
 *
 * O mesmo canvas alimenta a pré-visualização na tela e os bytes enviados à
 * impressora — é literalmente a mesma imagem. Isso elimina a classe inteira de
 * bug em que a prévia mostra uma coisa e o papel sai outra: se coube na tela,
 * coube na etiqueta.
 *
 * Por que rasterizar em vez de usar os comandos de texto nativos da impressora:
 * o gerador de fonte embutido das térmicas chinesas quase nunca traz a
 * acentuação portuguesa completa — "Pêssego" e "Manjericão" saem com caractere
 * trocado ou em branco. Rasterizar resolve acento, fonte, QR e posicionamento
 * livre de uma vez, e funciona igual nas três linguagens de comando.
 */

/** Milímetros por polegada. */
const MM_POR_POLEGADA = 25.4

export function mmParaDots(mm: number, dpi: number): number {
  return (mm * dpi) / MM_POR_POLEGADA
}

/** Alguma coisa em que dá para desenhar: canvas do DOM ou offscreen. */
type Superficie = HTMLCanvasElement | OffscreenCanvas

export interface OpcoesRenderizacao {
  dpi: number
  /** Escala aplicada só à prévia na tela; a impressão sempre usa 1. */
  escala?: number
}

function criarCanvas(largura: number, altura: number): Superficie {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    return canvas
  }
  return new OffscreenCanvas(largura, altura)
}

function contexto(canvas: Superficie): CanvasRenderingContext2D {
  const ctx = (canvas as HTMLCanvasElement).getContext('2d')
  if (!ctx) throw new Error('Não foi possível obter o contexto 2D do canvas.')
  return ctx as CanvasRenderingContext2D
}

/**
 * Encontra o maior tamanho de fonte que faz o texto caber na largura dada.
 *
 * Nome de produto de cozinha vai de "Leite" a "Molho bechamel de alho-poró", e
 * uma etiqueta com o nome cortado é uma etiqueta inútil — ninguém sabe o que
 * tem no pote. Busca binária em vez de reduzir de 1 em 1 porque isso roda a
 * cada tecla digitada na prévia.
 */
function ajustarFonte(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMaxima: number,
  alturaDesejada: number,
  negrito: boolean,
): number {
  const fonteCom = (tamanho: number) =>
    `${negrito ? 'bold ' : ''}${tamanho}px system-ui, sans-serif`

  ctx.font = fonteCom(alturaDesejada)
  if (ctx.measureText(texto).width <= larguraMaxima) return alturaDesejada

  let menor = 1
  let maior = alturaDesejada
  while (maior - menor > 0.5) {
    const meio = (menor + maior) / 2
    ctx.font = fonteCom(meio)
    if (ctx.measureText(texto).width <= larguraMaxima) menor = meio
    else maior = meio
  }
  return menor
}

/** Quebra o texto em até `maxLinhas`, cortando com reticências se estourar. */
function quebrarLinhas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMaxima: number,
  maxLinhas: number,
): string[] {
  if (maxLinhas <= 1) return [texto]

  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (ctx.measureText(tentativa).width <= larguraMaxima || !atual) {
      atual = tentativa
    } else {
      linhas.push(atual)
      atual = palavra
      if (linhas.length === maxLinhas) break
    }
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual)

  // Se sobrou texto, sinaliza o corte em vez de mentir que coube.
  if (linhas.length === maxLinhas) {
    const consumido = linhas.join(' ')
    if (consumido.length < texto.length) {
      const ultima = linhas[maxLinhas - 1]!
      let cortada = ultima
      while (
        cortada.length > 1 &&
        ctx.measureText(`${cortada}…`).width > larguraMaxima
      ) {
        cortada = cortada.slice(0, -1)
      }
      linhas[maxLinhas - 1] = `${cortada}…`
    }
  }

  return linhas
}

function desenharTexto(
  ctx: CanvasRenderingContext2D,
  elemento: ElementoTexto,
  dados: DadosEtiqueta,
  dpi: number,
): void {
  let conteudo = interpolar(elemento.conteudo, dados).trim()
  if (!conteudo) return
  if (elemento.maiuscula) conteudo = conteudo.toLocaleUpperCase('pt-BR')

  const x = mmParaDots(elemento.x, dpi)
  const y = mmParaDots(elemento.y, dpi)
  const largura = mmParaDots(elemento.largura, dpi)
  const alturaFonte = mmParaDots(elemento.alturaFonte, dpi)
  const maxLinhas = Math.max(1, elemento.linhas ?? 1)
  const negrito = elemento.negrito ?? true

  let tamanho = alturaFonte
  let linhas = [conteudo]

  if (maxLinhas > 1) {
    ctx.font = `${negrito ? 'bold ' : ''}${tamanho}px system-ui, sans-serif`
    linhas = quebrarLinhas(ctx, conteudo, largura, maxLinhas)
    // Com mais de uma linha, encolhe até a linha mais larga caber.
    if (elemento.ajustar !== false) {
      const maisLarga = linhas.reduce(
        (a, b) => (ctx.measureText(a).width >= ctx.measureText(b).width ? a : b),
        '',
      )
      tamanho = ajustarFonte(ctx, maisLarga, largura, alturaFonte, negrito)
      ctx.font = `${negrito ? 'bold ' : ''}${tamanho}px system-ui, sans-serif`
      linhas = quebrarLinhas(ctx, conteudo, largura, maxLinhas)
    }
  } else if (elemento.ajustar !== false) {
    tamanho = ajustarFonte(ctx, conteudo, largura, alturaFonte, negrito)
  }

  ctx.font = `${negrito ? 'bold ' : ''}${tamanho}px system-ui, sans-serif`
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const alinhamento = elemento.alinhamento ?? 'esquerda'
  ctx.textAlign =
    alinhamento === 'centro' ? 'center' : alinhamento === 'direita' ? 'right' : 'left'
  const ancoraX =
    alinhamento === 'centro' ? x + largura / 2 : alinhamento === 'direita' ? x + largura : x

  // Entrelinha de 1.12 — apertada de propósito: em 40 mm cada décimo conta.
  const alturaLinha = tamanho * 1.12
  linhas.forEach((linha, i) => {
    ctx.fillText(linha, ancoraX, y + i * alturaLinha)
  })
}

async function desenharQrcode(
  ctx: CanvasRenderingContext2D,
  elemento: ElementoQrcode,
  dados: DadosEtiqueta,
  dpi: number,
): Promise<void> {
  const conteudo = interpolar(elemento.conteudo, dados)
  if (!conteudo) return

  const lado = Math.round(mmParaDots(elemento.tamanho, dpi))

  // Nível de correção M (~15%): o mínimo confiável para uma etiqueta que vai
  // pegar gordura e condensação dentro da geladeira, sem inflar o QR a ponto de
  // não caber. `margin: 0` porque o espaço em volta já é do layout.
  const url = await QRCode.toDataURL(conteudo, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: lado,
    color: { dark: '#000000ff', light: '#ffffffff' },
  })

  const imagem = await carregarImagem(url)
  ctx.drawImage(
    imagem,
    Math.round(mmParaDots(elemento.x, dpi)),
    Math.round(mmParaDots(elemento.y, dpi)),
    lado,
    lado,
  )
}

function carregarImagem(url: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao renderizar o QR Code.'))
    img.src = url
  })
}

function desenharElementoSimples(
  ctx: CanvasRenderingContext2D,
  elemento: ElementoEtiqueta,
  dpi: number,
): void {
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'

  if (elemento.tipo === 'linha') {
    ctx.fillRect(
      mmParaDots(elemento.x, dpi),
      mmParaDots(elemento.y, dpi),
      mmParaDots(elemento.largura, dpi),
      Math.max(1, mmParaDots(elemento.espessura, dpi)),
    )
    return
  }

  if (elemento.tipo === 'retangulo') {
    const x = mmParaDots(elemento.x, dpi)
    const y = mmParaDots(elemento.y, dpi)
    const l = mmParaDots(elemento.largura, dpi)
    const a = mmParaDots(elemento.altura, dpi)
    if (elemento.preenchido) {
      ctx.fillRect(x, y, l, a)
    } else {
      ctx.lineWidth = Math.max(1, mmParaDots(elemento.espessura, dpi))
      ctx.strokeRect(x, y, l, a)
    }
  }
}

export interface EtiquetaRenderizada {
  canvas: Superficie
  largura: number
  altura: number
  /** Pixels RGBA prontos para `paraMonocromatico`. */
  rgba: Uint8ClampedArray
}

/**
 * Renderiza o modelo com os dados informados.
 *
 * A largura é arredondada para múltiplo de 8 já aqui, e não só no empacotamento:
 * assim a prévia mostra exatamente a mesma área física que será impressa,
 * incluindo a sobra à direita.
 */
export async function renderizarEtiqueta(
  modelo: ModeloEtiqueta,
  dados: DadosEtiqueta,
  opcoes: OpcoesRenderizacao,
): Promise<EtiquetaRenderizada> {
  const { dpi } = opcoes

  const largura = alinharEm8(Math.round(mmParaDots(modelo.larguraMm, dpi)))
  const altura = Math.round(mmParaDots(modelo.alturaMm, dpi))

  const canvas = criarCanvas(largura, altura)
  const ctx = contexto(canvas)

  // Fundo branco explícito: um canvas novo é transparente, e transparente sem
  // tratamento vira preto sólido no bitmap — queimando a fita inteira.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largura, altura)

  for (const elemento of modelo.elementos) {
    if (elemento.tipo === 'texto') desenharTexto(ctx, elemento, dados, dpi)
    else if (elemento.tipo === 'qrcode') await desenharQrcode(ctx, elemento, dados, dpi)
    else desenharElementoSimples(ctx, elemento, dpi)
  }

  const { data } = ctx.getImageData(0, 0, largura, altura)
  return { canvas, largura, altura, rgba: data }
}
