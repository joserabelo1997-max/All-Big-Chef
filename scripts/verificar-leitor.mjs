// Simula num Chromium real o leitor Goldensky GS-CH6 em modo teclado: digita o
// conteúdo do código em rajada e fecha com Enter, exatamente como o aparelho
// faz ao escanear.
//
//   node scripts/verificar-leitor.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/leitor'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5189/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5189 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 900 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))
pagina.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

/** Emite as teclas como o leitor: rajada rápida terminada em Enter. */
async function escanear(texto, intervaloMs = 8) {
  for (const caractere of texto) {
    await pagina.keyboard.press(caractere === ' ' ? 'Space' : caractere, { delay: 0 })
    await pagina.waitForTimeout(intervaloMs)
  }
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(600)
}

/** Digita em velocidade humana, para provar que NÃO vira leitura. */
async function digitarDevagar(texto) {
  for (const caractere of texto) {
    await pagina.keyboard.press(caractere, { delay: 0 })
    await pagina.waitForTimeout(150)
  }
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(500)
}

await pagina.goto(BASE, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)

// Uma etiqueta real para escanear.
const etiqueta = await pagina.evaluate(async () => {
  const { db, salvarESincronizar, registrarEvento } = await import(
    '/All-Big-Chef/src/lib/db.ts'
  )
  const { criarEtiqueta, urlDaEtiqueta } = await import(
    '/All-Big-Chef/src/domain/labelData.ts'
  )
  const orgId = (await db.folders.toArray())[0].org_id
  const produto = {
    id: crypto.randomUUID(),
    org_id: orgId,
    nome: 'Creme de leite',
    shelf_life_days: 3,
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await salvarESincronizar('products', produto)
  const { etiqueta, evento } = criarEtiqueta({ orgId, produto, membroNome: 'Maria' })
  await salvarESincronizar('labels', etiqueta)
  await registrarEvento(evento)
  return { id: etiqueta.id, codigo: etiqueta.short_code, url: urlDaEtiqueta(etiqueta.id) }
})

// --- 1. Escanear o QR (URL completa) a partir do Painel ----------------------
await pagina.goto(BASE, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await escanear(etiqueta.url)

conferir(
  'escanear o QR do Painel abre a etiqueta',
  pagina.url().includes(etiqueta.id),
  pagina.url().split('#')[1] ?? '',
)
const texto = await pagina.textContent('body')
conferir('a etiqueta certa foi aberta', texto.includes('Creme de leite'))
await pagina.screenshot({ path: `${SAIDA}/apos-leitura.png`, fullPage: true })

// --- 2. Funciona de OUTRA tela também ----------------------------------------
await pagina.goto(`${BASE}#/relatorios`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await escanear(etiqueta.url)
conferir('escanear funciona de qualquer tela', pagina.url().includes(etiqueta.id))

// --- 3. O código curto impresso também abre ----------------------------------
await pagina.goto(`${BASE}#/pastas`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await escanear(etiqueta.codigo)
conferir(
  'escanear o código curto abre a etiqueta',
  pagina.url().includes(etiqueta.id),
  etiqueta.codigo,
)

// --- 4. Digitação humana NÃO pode virar leitura ------------------------------
await pagina.goto(`${BASE}#/pastas`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
const antes = pagina.url()
await digitarDevagar(etiqueta.codigo)
conferir('digitar devagar não dispara o leitor', pagina.url() === antes)

// --- 5. Código desconhecido avisa em vez de sumir em silêncio ----------------
await escanear('7891234567890')
const aviso = await pagina.textContent('body')
conferir(
  'código que não é etiqueta gera aviso visível',
  aviso.includes('não é de uma etiqueta'),
)
await pagina.screenshot({ path: `${SAIDA}/codigo-desconhecido.png`, fullPage: true })

// --- 6. Com o foco num campo, o leitor digita no campo ----------------------
await pagina.goto(`${BASE}#/produtos`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.click('input[type="search"]')
await escanear('creme')
const valorBusca = await pagina.inputValue('input[type="search"]')
conferir(
  'com foco num campo, o texto vai para o campo',
  valorBusca.includes('creme'),
  `campo = "${valorBusca}"`,
)
conferir('e não navegou para lugar nenhum', pagina.url().includes('/produtos'))

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
