// Exercita o editor de etiqueta: arrasta um campo, salva o modelo e confere que
// a posição nova persiste e passa a valer para a impressão. Script de apoio.
//   node scripts/verificar-editor.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/editor'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5192/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5192 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 1000 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))
pagina.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

await pagina.goto(`${BASE}#/editor`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(900)
await pagina.screenshot({ path: `${SAIDA}/editor.png`, fullPage: true })

const alvos = await pagina.locator('[aria-label^="Mover"]').count()
conferir('editor renderiza um alvo por campo do modelo', alvos === 9, `${alvos} alvos`)

// Arrasta o campo do fornecedor 6 mm para baixo.
const alvo = pagina.locator('[aria-label="Mover fornecedor"]')
const caixa = await alvo.boundingBox()
await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
await pagina.mouse.down()
await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2 + 6 * 5.6, {
  steps: 8,
})
await pagina.mouse.up()
await pagina.waitForTimeout(400)

conferir('campo fica selecionado ao ser arrastado', await pagina.locator('text=Texto').first().isVisible())
await pagina.screenshot({ path: `${SAIDA}/editor-arrastado.png`, fullPage: true })

// Salva e confere a persistência.
await pagina.click('button:has-text("Salvar modelo")')
await pagina.waitForTimeout(700)

const salvo = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const modelos = await db.label_templates.toArray()
  const m = modelos[0]
  return m
    ? {
        total: modelos.length,
        padrao: m.is_default,
        fornecedorY: m.elements.find((e) => e.id === 'fornecedor')?.y,
        naFila: await db.outbox.where('tabela').equals('label_templates').count(),
      }
    : null
})

conferir('modelo persistido no banco local', salvo?.total === 1)
conferir('marcado como padrão', salvo?.padrao === true)
conferir('modelo entrou na fila de sincronização', salvo?.naFila > 0)
// O padrão tem o fornecedor em y = 28; após arrastar 6 mm deve ficar perto de 34.
conferir(
  'posição arrastada foi persistida',
  salvo?.fornecedorY > 32 && salvo?.fornecedorY < 36,
  `y = ${salvo?.fornecedorY}`,
)

// A tela de impressão precisa passar a usar o modelo salvo, não o embutido.
const usadoNaImpressao = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const { modeloAtivo } = await import('/All-Big-Chef/src/lib/modelos.ts')
  const orgId = (await db.folders.toArray())[0].org_id
  const m = await modeloAtivo(orgId)
  return { id: m.id, fornecedorY: m.elementos.find((e) => e.id === 'fornecedor')?.y }
})

conferir(
  'impressão passa a usar o modelo editado, não o embutido',
  usadoNaImpressao.id !== 'padrao-60x40' && usadoNaImpressao.fornecedorY > 32,
  `id=${usadoNaImpressao.id} y=${usadoNaImpressao.fornecedorY}`,
)

// Recarrega para confirmar que o editor reabre com o modelo salvo.
await pagina.goto(`${BASE}#/editor`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(900)
const aposRecarregar = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const m = (await db.label_templates.toArray())[0]
  return m.elements.find((e) => e.id === 'fornecedor')?.y
})
conferir('modelo sobrevive ao recarregamento', aposRecarregar > 32, `y = ${aposRecarregar}`)

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
