// Popula etiquetas em várias faixas de validade e confere que o painel e a
// lista classificam e ordenam corretamente. Script de apoio.
//   node scripts/verificar-painel.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/painel'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5193/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5193 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 1100 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))
pagina.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))

await pagina.goto(BASE, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)

// Uma etiqueta em cada faixa de urgência.
const contagens = await pagina.evaluate(async () => {
  const { db, salvarESincronizar, registrarEvento } = await import(
    '/All-Big-Chef/src/lib/db.ts'
  )
  const { criarEtiqueta } = await import('/All-Big-Chef/src/domain/labelData.ts')
  const orgId = (await db.folders.toArray())[0].org_id

  const casos = [
    ['Salmão fresco', -2], // vencido há 2 dias
    ['Creme de leite', 0], // vence hoje
    ['Queijo minas', 1], // vence amanhã
    ['Molho de tomate', 2], // vence em 2 dias
    ['Arroz cozido', 20], // tranquilo
  ]

  for (const [nome, dias] of casos) {
    const produto = {
      id: crypto.randomUUID(),
      org_id: orgId,
      nome,
      shelf_life_days: Math.max(0, dias),
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await salvarESincronizar('products', produto)

    // Retrocede a abertura para posicionar a validade na faixa desejada.
    const abertura = new Date()
    abertura.setDate(abertura.getDate() + Math.min(0, dias))
    const { etiqueta, evento } = criarEtiqueta({
      orgId,
      produto,
      abertura,
      membroNome: 'Maria',
    })
    await salvarESincronizar('labels', etiqueta)
    await registrarEvento(evento)
  }

  return (await db.labels.toArray()).length
})

await pagina.reload({ waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/painel.png`, fullPage: true })

const texto = await pagina.textContent('body')

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

conferir('etiquetas criadas', contagens === 5, `${contagens}`)
conferir('painel mostra o vencido', texto.includes('Salmão fresco'))
conferir('painel mostra o que vence hoje', texto.includes('vence hoje'))
conferir('painel mostra o que vence amanhã', texto.includes('vence amanhã'))
conferir(
  'painel NÃO lista o que está tranquilo na seção de atenção',
  !texto.includes('Arroz cozido'),
)

// A ordem tem que ser: vencido, hoje, amanhã.
const posVencido = texto.indexOf('Salmão fresco')
const posHoje = texto.indexOf('Creme de leite')
const posAmanha = texto.indexOf('Queijo minas')
conferir(
  'ordenado por urgência: vencido antes de hoje antes de amanhã',
  posVencido < posHoje && posHoje < posAmanha,
  `${posVencido} < ${posHoje} < ${posAmanha}`,
)

await pagina.goto(`${BASE}#/etiquetas?filtro=vencidas`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/etiquetas-vencidas.png`, fullPage: true })
const textoFiltro = await pagina.textContent('body')
conferir('filtro de vencidas mostra só o vencido', textoFiltro.includes('Salmão fresco'))
conferir(
  'filtro de vencidas exclui o que está no prazo',
  !textoFiltro.includes('Arroz cozido') && !textoFiltro.includes('Queijo minas'),
)

const falhas = checagens.filter((c) => !c.ok)
console.log(JSON.stringify({ checagens, problemas }, null, 2))
console.log(
  falhas.length === 0
    ? `\n✓ ${checagens.length} checagens passaram`
    : `\n✗ ${falhas.length} de ${checagens.length} falharam`,
)

await navegador.close()
await servidor.close()

if (falhas.length > 0 || problemas.length > 0) process.exitCode = 1
