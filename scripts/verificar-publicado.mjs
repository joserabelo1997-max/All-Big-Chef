// Confere o app JÁ PUBLICADO, não o servidor de desenvolvimento.
//
// Workflow verde não prova que o app funciona: o Pages pode servir o caminho
// errado, um ícone pode faltar (e aí o iPhone instala com o quadrado em branco),
// ou o service worker pode não registrar (e aí não há offline nem alerta).
//
//   node scripts/verificar-publicado.mjs [url] [pasta-de-saida]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL_APP =
  process.argv[2] ?? 'https://joserabelo1997-max.github.io/All-Big-Chef/'
const SAIDA = process.argv[3] ?? '/tmp/publicado'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

mkdirSync(SAIDA, { recursive: true })

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 900 } })

const erros = []
pagina.on('pageerror', (e) => erros.push(String(e)))
pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

const resposta = await pagina.goto(URL_APP, { waitUntil: 'networkidle' })
conferir('página responde 200', resposta?.status() === 200, `HTTP ${resposta?.status()}`)

await pagina.waitForTimeout(2500)
await pagina.screenshot({ path: `${SAIDA}/painel.png`, fullPage: true })

const texto = await pagina.textContent('body')
conferir('o app renderizou', texto.includes('All Big Chef'))
conferir('as pastas foram semeadas na primeira abertura', texto.includes('Imprimir etiqueta'))

// O manifest e os ícones decidem se o iOS instala direito ou com ícone vazio.
const manifest = await pagina.evaluate(async (base) => {
  const r = await fetch(new URL('manifest.webmanifest', base))
  return { status: r.status, json: r.ok ? await r.json() : null }
}, URL_APP)

conferir('manifest responde 200', manifest.status === 200)
conferir(
  'manifest aponta para o subcaminho do Pages',
  manifest.json?.start_url === '/All-Big-Chef/' && manifest.json?.scope === '/All-Big-Chef/',
  `start_url=${manifest.json?.start_url}`,
)
conferir('manifest pede tela cheia', manifest.json?.display === 'standalone')

const icones = await pagina.evaluate(async (base) => {
  const nomes = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png']
  const saida = {}
  for (const nome of nomes) {
    const r = await fetch(new URL(nome, base))
    saida[nome] = r.status
  }
  return saida
}, URL_APP)

conferir(
  'os três ícones respondem 200',
  Object.values(icones).every((s) => s === 200),
  JSON.stringify(icones),
)

// Sem service worker não há offline nem notificação de validade.
const sw = await pagina.evaluate(() =>
  navigator.serviceWorker.getRegistration().then((r) => Boolean(r)),
)
conferir('service worker registrado', sw)

// O QR das etiquetas aponta para uma rota com hash: ela precisa abrir direto.
await pagina.goto(`${URL_APP}#/config/impressora`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1200)
const textoRota = await pagina.textContent('body')
conferir(
  'rota profunda abre direto (é o caminho do QR)',
  textoRota.includes('impressora') || textoRota.includes('Impressora'),
)
await pagina.screenshot({ path: `${SAIDA}/impressora.png`, fullPage: true })

const falhas = checagens.filter((c) => !c.ok)
console.log(JSON.stringify({ url: URL_APP, checagens, erros }, null, 2))
console.log(
  falhas.length === 0
    ? `\n✓ ${checagens.length} checagens passaram — o app está no ar e instalável`
    : `\n✗ ${falhas.length} de ${checagens.length} falharam`,
)

await navegador.close()
if (falhas.length > 0 || erros.length > 0) process.exitCode = 1
