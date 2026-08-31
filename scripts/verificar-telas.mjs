// Abre as telas num Chromium real, captura screenshots e reporta qualquer erro
// de console ou de página. Script de apoio, não faz parte do app.
//   node ui_check.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/telas'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const ROTAS = [
  ['painel', '#/'],
  ['pastas', '#/pastas'],
  ['produtos', '#/produtos'],
  ['produto-novo', '#/produtos/novo'],
  ['fila', '#/fila'],
  ['equipe', '#/config/equipe'],
  ['fornecedores', '#/config/fornecedores'],
  ['configuracoes', '#/config'],
  ['impressora', '#/config/impressora'],
]

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5198 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({
  viewport: { width: 412, height: 900 }, // celular típico de bancada
  deviceScaleFactor: 2,
})

const problemas = []
pagina.on('pageerror', (e) => problemas.push({ tipo: 'pageerror', texto: String(e) }))
pagina.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) {
    problemas.push({ tipo: 'console', texto: m.text() })
  }
})

for (const [nome, rota] of ROTAS) {
  await pagina.goto(`http://localhost:5198/All-Big-Chef/${rota}`, {
    waitUntil: 'networkidle',
  })
  await pagina.waitForTimeout(400)
  await pagina.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: true })
}

console.log(JSON.stringify({ telas: ROTAS.map((r) => r[0]), problemas }, null, 2))

await navegador.close()
await servidor.close()
