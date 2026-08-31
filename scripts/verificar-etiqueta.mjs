// Verificação ponta a ponta do pipeline de impressão, num Chromium real.
//
// 1. Renderiza a etiqueta padrão e salva o PNG para conferência visual.
// 2. Roda a cadeia completa até os bytes TSPL e confere as dimensões.
// 3. Decodifica o QR a partir da imagem renderizada, provando que o ciclo
//    URL -> QR -> canvas -> leitor fecha de verdade.
// 4. Faz o mesmo com a etiqueta de INVENTÁRIO, confirmando que o QR dela
//    aponta para /i/ e nunca para /l/, e que nenhuma data foi impressa.
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

const URL_INVENTARIO =
  'https://joserabelo1997-max.github.io/All-Big-Chef/#/i/8c2d1f40-1a55-4d8f-9b23-88e1f6c42d10'

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
    manipulacao: '30/08/2026',
    abertura: '30/08/2026',
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

// A etiqueta de inventário, pelo mesmo caminho.
const inventario = await pagina.evaluate(async (url) => {
  const base = '/All-Big-Chef/src/printing'
  const { renderizarEtiqueta } = await import(`${base}/renderer.ts`)
  const { MODELO_INVENTARIO, interpolar } = await import(`${base}/template.ts`)
  const { dadosParaImpressaoInventario } = await import(
    '/All-Big-Chef/src/domain/inventoryData.ts'
  )

  const etiqueta = {
    id: '8c2d1f40-1a55-4d8f-9b23-88e1f6c42d10',
    org_id: 'org',
    produto_snapshot: 'Molho base da casa',
    short_code: 'INV042',
    quantidade: 2,
    unidade: 'kg',
    lote: 'P-12',
    status: 'em_estoque',
    printed_by_snapshot: 'Maria',
    printed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const dados = { ...dadosParaImpressaoInventario(etiqueta), url }

  const { canvas, largura, altura, rgba } = await renderizarEtiqueta(
    MODELO_INVENTARIO,
    dados,
    { dpi: 203 },
  )

  // O texto que os elementos do modelo realmente produzem, para conferir que
  // nenhuma data foi parar no papel.
  const textos = MODELO_INVENTARIO.elementos
    .filter((e) => e.tipo === 'texto')
    .map((e) => interpolar(e.conteudo, dados))

  return {
    png: canvas.toDataURL('image/png').split(',')[1],
    rgba: Array.from(rgba),
    largura,
    altura,
    textos,
    camposDeData: [dados.validade, dados.manipulacao, dados.abertura],
  }
}, URL_INVENTARIO)

writeFileSync(SAIDA.replace(/\.png$/, '-inventario.png'), Buffer.from(inventario.png, 'base64'))

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

// E o QR da etiqueta de inventário.
const lumInv = new Uint8ClampedArray(inventario.largura * inventario.altura)
for (let i = 0; i < lumInv.length; i++) {
  const p = i * 4
  lumInv[i] =
    0.299 * inventario.rgba[p] +
    0.587 * inventario.rgba[p + 1] +
    0.114 * inventario.rgba[p + 2]
}

let qrInventario = null
let qrInventarioErro = null
try {
  const fonte = new RGBLuminanceSource(lumInv, inventario.largura, inventario.altura)
  const bitmap = new BinaryBitmap(new HybridBinarizer(fonte))
  qrInventario = new MultiFormatReader().decode(bitmap).getText()
} catch (e) {
  qrInventarioErro = String(e).slice(0, 120)
}

const inventarioSemData =
  inventario.camposDeData.every((c) => c === '') &&
  // Nenhum texto impresso pode parecer uma data.
  !inventario.textos.some((t) => /\d{2}\/\d{2}\/\d{2}/.test(t))

const relatorio = {
  dimensoes: `${largura} × ${altura} dots`,
  bytesPorLinha: resultado.bytesPorLinha,
  totalBytesTspl: resultado.totalBytesTspl,
  proporcaoTinta: resultado.proporcaoTinta.toFixed(4),
  qrDecodificado: qrLido,
  qrConfere: qrLido === URL_ETIQUETA,
  qrErro,

  inventario: {
    qrDecodificado: qrInventario,
    // O QR aponta para a rota de inventário, e NÃO para a de validade: é o que
    // garante que uma leitura nunca seja confundida com a outra.
    qrConfere: qrInventario === URL_INVENTARIO,
    apontaParaInventario: Boolean(qrInventario?.includes('#/i/')),
    naoApontaParaValidade: !qrInventario?.includes('#/l/'),
    semData: inventarioSemData,
    textosImpressos: inventario.textos,
    qrErro: qrInventarioErro,
  },

  errosDePagina: erros,
}

console.log(JSON.stringify(relatorio, null, 2))

await navegador.close()
await servidor.close()

const tudoCerto =
  relatorio.qrConfere &&
  relatorio.inventario.qrConfere &&
  relatorio.inventario.apontaParaInventario &&
  relatorio.inventario.naoApontaParaValidade &&
  relatorio.inventario.semData &&
  erros.length === 0

console.log(tudoCerto ? '\n✓ etiqueta de validade e de inventário conferem' : '\n✗ falhou')

if (!tudoCerto) process.exitCode = 1
