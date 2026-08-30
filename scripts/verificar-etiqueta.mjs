// Verificação ponta a ponta do pipeline de impressão, num Chromium real.
//
// 1. Renderiza a etiqueta padrão e salva o PNG para conferência visual.
// 2. Roda a cadeia completa até os bytes TSPL e confere as dimensões.
// 3. Decodifica o QR a partir da imagem renderizada, provando que o ciclo
//    URL -> QR -> canvas -> leitor fecha de verdade.
//
// Script de apoio, não faz parte do app. Rode com:
//   node render_check.mjs [saida.png]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
import {
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library'

const SAIDA = process.argv[2] ?? '/tmp/etiqueta.png'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5199 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage()

const erros = []
pagina.on('pageerror', (e) => erros.push(String(e)))

await pagina.goto('http://localhost:5199/All-Big-Chef/', { waitUntil: 'load' })

const URL_ETIQUETA =
  'https://joserabelo1997-max.github.io/All-Big-Chef/#/l/6f1c2a30-9b44-4c7e-8a12-77d0e5b31c99'

const resultado = await pagina.evaluate(async (url) => {
  const base = '/All-Big-Chef/src/printing'
  const { renderizarEtiqueta } = await import(`${base}/renderer.ts`)
  const { MODELO_PADRAO } = await import(`${base}/template.ts`)
  const { paraMonocromatico } = await import(`${base}/monochrome.ts`)
  const { codificarTspl } = await import(`${base}/encoders/tspl.ts`)

  const dados = {
    produto: 'Molho bechamel de alho-poró',
    fornecedor: 'Laticínios São João',
    pasta: 'Molhos',
    abertura: '30/08/2026 14:20',
    validade: '02/09/2026',
    lote: 'L-4412',
    responsavel: 'Maria',
    codigo: 'A7K293',
    quantidade: '1 L',
    url,
  }

  const { canvas, largura, altura, rgba } = await renderizarEtiqueta(
    MODELO_PADRAO,
    dados,
    { dpi: 203 },
  )
  const bitmap = paraMonocromatico(rgba, largura, altura)
  const bytes = codificarTspl(bitmap, {
    larguraMm: 60,
    alturaMm: 40,
    dpi: 203,
    densidade: 8,
    gapMm: 2,
  })

  // Proporção de dots queimados. Perto de 0 = etiqueta em branco; perto de 1 =
  // etiqueta toda preta. Os dois casos significam pipeline quebrado.
  let acesos = 0
  for (const b of bitmap.dados) acesos += b.toString(2).split('1').length - 1

  return {
    png: canvas.toDataURL('image/png').split(',')[1],
    rgba: Array.from(rgba),
    largura,
    altura,
    bytesPorLinha: bitmap.bytesPorLinha,
    totalBytesTspl: bytes.length,
    proporcaoTinta: acesos / (bitmap.dados.length * 8),
  }
}, URL_ETIQUETA)

writeFileSync(SAIDA, Buffer.from(resultado.png, 'base64'))

// Decodifica o QR direto dos pixels renderizados.
const { largura, altura } = resultado
const luminancia = new Uint8ClampedArray(largura * altura)
for (let i = 0; i < largura * altura; i++) {
  const p = i * 4
  luminancia[i] =
    0.299 * resultado.rgba[p] + 0.587 * resultado.rgba[p + 1] + 0.114 * resultado.rgba[p + 2]
}

let qrLido = null
let qrErro = null
try {
  const fonte = new RGBLuminanceSource(luminancia, largura, altura)
  const bitmap = new BinaryBitmap(new HybridBinarizer(fonte))
  qrLido = new MultiFormatReader().decode(bitmap).getText()
} catch (e) {
  qrErro = String(e).slice(0, 120)
}

const relatorio = {
  dimensoes: `${largura} × ${altura} dots`,
  bytesPorLinha: resultado.bytesPorLinha,
  totalBytesTspl: resultado.totalBytesTspl,
  proporcaoTinta: resultado.proporcaoTinta.toFixed(4),
  qrDecodificado: qrLido,
  qrConfere: qrLido === URL_ETIQUETA,
  qrErro,
  errosDePagina: erros,
}

console.log(JSON.stringify(relatorio, null, 2))

await navegador.close()
await servidor.close()

if (!relatorio.qrConfere) process.exitCode = 1
