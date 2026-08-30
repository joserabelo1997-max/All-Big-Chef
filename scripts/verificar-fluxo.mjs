// Teste funcional ponta a ponta num Chromium real: cadastra um produto pela
// interface, gera uma etiqueta, abre a tela do QR e dá baixa — verificando que
// o status e a trilha de auditoria ficam corretos no IndexedDB.
//
// A impressão em si não entra: exige uma impressora Bluetooth física. Tudo o
// que vem antes e depois dela é exercitado.
//
//   node scripts/verificar-fluxo.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/fluxo'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5197/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5197 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 900 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))
pagina.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) problemas.push(m.text())
})

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

// --- 1. Cadastrar um produto pela interface -------------------------------
await pagina.goto(`${BASE}#/produtos/novo`, { waitUntil: 'networkidle' })
await pagina.fill('#nome', 'Creme de leite')
await pagina.click('button:has-text("5d")')
await pagina.click('button:has-text("Salvar produto")')
await pagina.waitForTimeout(600)

const produtoSalvo = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const todos = await db.products.toArray()
  return todos[0] ?? null
})
conferir('produto cadastrado pela interface', produtoSalvo?.nome === 'Creme de leite')
conferir('validade gravada com os 5 dias escolhidos', produtoSalvo?.shelf_life_days === 5)

const naFila = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return db.outbox.count()
})
conferir('cadastro entrou na fila de sincronização', naFila > 0, `${naFila} na fila`)

// --- 2. Gerar a etiqueta (o que a impressão faria) -------------------------
const etiqueta = await pagina.evaluate(async () => {
  const { db, salvarESincronizar, registrarEvento } = await import(
    '/All-Big-Chef/src/lib/db.ts'
  )
  const { criarEtiqueta } = await import('/All-Big-Chef/src/domain/labelData.ts')

  const produto = (await db.products.toArray())[0]
  const { etiqueta, evento } = criarEtiqueta({
    orgId: produto.org_id,
    produto,
    membroNome: 'Maria',
    lote: 'L-4412',
  })
  await salvarESincronizar('labels', etiqueta)
  await registrarEvento(evento)
  return { id: etiqueta.id, codigo: etiqueta.short_code, vence: etiqueta.expires_at }
})

conferir('etiqueta criada com código curto de 6 caracteres', etiqueta.codigo.length === 6)
conferir(
  'código curto sem caracteres ambíguos',
  !/[ILOU]/.test(etiqueta.codigo),
  etiqueta.codigo,
)

const diasAteVencer = Math.round(
  (new Date(etiqueta.vence) - new Date()) / 86_400_000,
)
conferir('validade caiu 5 dias à frente', diasAteVencer === 5, `${diasAteVencer} dias`)

// --- 3. Abrir a tela do QR ------------------------------------------------
await pagina.goto(`${BASE}#/l/${etiqueta.id}`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)
await pagina.screenshot({ path: `${SAIDA}/etiqueta-ativa.png`, fullPage: true })

const textoDetalhe = await pagina.textContent('body')
conferir('tela do QR mostra o produto', textoDetalhe.includes('Creme de leite'))
conferir('tela do QR mostra o código curto', textoDetalhe.includes(etiqueta.codigo))
conferir('histórico mostra a impressão', textoDetalhe.includes('Impressa'))

// --- 4. Dar baixa ---------------------------------------------------------
await pagina.click('button:has-text("Consumido")')
await pagina.waitForTimeout(200)
await pagina.click('button:has-text("Confirmar")')
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/etiqueta-baixada.png`, fullPage: true })

const depois = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const etiqueta = await db.labels.get(id)
  const eventos = await db.label_events.where('label_id').equals(id).toArray()
  return { status: etiqueta?.status, eventos: eventos.map((e) => e.tipo) }
}, etiqueta.id)

conferir('status virou consumida', depois.status === 'consumida', depois.status)
conferir(
  'trilha guardou impressão E consumo, sem sobrescrever',
  depois.eventos.length === 2 &&
    depois.eventos.includes('impressa') &&
    depois.eventos.includes('consumida'),
  depois.eventos.join(', '),
)

const textoFinal = await pagina.textContent('body')
conferir('botões de baixa somem depois de baixada', !textoFinal.includes('🗑 Descartar'))

// --- 5. Busca pelo código curto digitado ----------------------------------
await pagina.goto(`${BASE}#/baixa`, { waitUntil: 'networkidle' })
// Digita em minúsculas de propósito: a normalização precisa dar conta.
await pagina.fill('#codigo', etiqueta.codigo.toLowerCase())
await pagina.click('button:has-text("Buscar")')
await pagina.waitForTimeout(600)
conferir(
  'busca pelo código digitado em minúsculas encontra a etiqueta',
  pagina.url().includes(etiqueta.id),
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
