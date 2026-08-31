// Confere, num Chromium real, que a etiqueta de inventário não conflita com a
// de validade:
//
//   - cada unidade recebe um QR e um código curto próprios;
//   - o QR abre a tela de contagem, e nunca a de validade;
//   - a tela não mostra validade nenhuma;
//   - marcar como consumida tira da contagem, e dá para desfazer;
//   - o código curto de inventário também é encontrado pela busca.
//
//   node scripts/verificar-inventario.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/inventario'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5196
const BASE = `http://localhost:${PORTA}/All-Big-Chef/`

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: PORTA },
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

await pagina.goto(BASE, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)

// --- Cenário: um produto da casa, guardado em porções -----------------------
const cenario = await pagina.evaluate(async () => {
  const { db, salvarESincronizar } = await import('/All-Big-Chef/src/lib/db.ts')
  const { PADROES_PRODUTO } = await import('/All-Big-Chef/src/domain/types.ts')
  const { criarEtiquetaInventario } = await import(
    '/All-Big-Chef/src/domain/inventoryData.ts'
  )
  const agora = new Date().toISOString()
  const orgId = (await db.folders.toArray())[0].org_id

  const produto = {
    ...PADROES_PRODUTO,
    id: crypto.randomUUID(),
    org_id: orgId,
    nome: 'Molho base da casa',
    shelf_life_days: 5,
    controla_estoque: true,
    unidade_estoque: 'kg',
    ativo: true,
    created_at: agora,
    updated_at: agora,
  }
  await salvarESincronizar('products', produto)

  // Três porções guardadas no freezer, uma etiqueta para cada.
  const etiquetas = []
  for (let i = 0; i < 3; i++) {
    const etiqueta = criarEtiquetaInventario({
      orgId,
      produto,
      quantidade: 2,
      unidade: 'kg',
      lote: 'P-12',
      membroNome: 'Maria',
    })
    await salvarESincronizar('inventory_tags', etiqueta)
    etiquetas.push({ id: etiqueta.id, codigo: etiqueta.short_code })
  }

  return { orgId, produtoId: produto.id, etiquetas }
})

const ids = cenario.etiquetas.map((e) => e.id)
const codigos = cenario.etiquetas.map((e) => e.codigo)

conferir('cada porção recebe um id próprio', new Set(ids).size === 3, ids.join(', '))
conferir(
  'cada porção recebe um código curto próprio',
  new Set(codigos).size === 3,
  codigos.join(', '),
)

// --- 1. A etiqueta de inventário NÃO entra no painel de validades ----------
await pagina.goto(`${BASE}#/`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/painel.png`, fullPage: true })

const painel = await pagina.textContent('body')
conferir(
  'etiqueta de inventário não aparece no painel de validades',
  !painel.includes('Molho base da casa'),
)
conferir('painel continua sem etiquetas ativas', painel.includes('0 etiquetas ativas'))

await pagina.goto(`${BASE}#/etiquetas`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
conferir(
  'etiqueta de inventário não aparece na lista de etiquetas ativas',
  !(await pagina.textContent('body')).includes('Molho base da casa'),
)

// --- 2. O QR abre a tela de contagem, e ela não mostra validade ------------
await pagina.goto(`${BASE}#/i/${ids[0]}`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/etiqueta-inventario.png`, fullPage: true })

const tela = await pagina.textContent('body')
conferir('a tela se identifica como etiqueta de inventário', tela.includes('Etiqueta de inventário'))
conferir('mostra o produto e a quantidade', tela.includes('Molho base da casa') && tela.includes('2 kg'))
conferir('começa em estoque', tela.includes('Em estoque'))
conferir(
  'não mostra validade nem vencimento',
  !tela.includes('Validade') && !tela.includes('vence') && !tela.includes('Vencida'),
)
conferir(
  'não oferece descartar por vencimento',
  !tela.includes('Descartar') && !tela.includes('Consumido'),
)

// --- 3. Marcar como consumida, e desfazer ---------------------------------
await pagina.click('button:has-text("Marcar como consumida")')
await pagina.waitForTimeout(700)

const consumida = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return (await db.inventory_tags.get(id)).status
}, ids[0])
conferir('marcar como consumida tira da contagem', consumida === 'consumida', consumida)

await pagina.click('button:has-text("Voltar para o estoque")')
await pagina.waitForTimeout(700)

const devolvida = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return (await db.inventory_tags.get(id)).status
}, ids[0])
// Escanear o pote errado no meio de uma conferência acontece; precisa desfazer.
conferir('dá para desfazer', devolvida === 'em_estoque', devolvida)

// --- 4. Buscar pelo código curto do inventário ------------------------------
await pagina.goto(`${BASE}#/escanear`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)
await pagina.fill('#codigo', codigos[1].toLowerCase())
await pagina.click('button:has-text("Buscar")')
await pagina.waitForTimeout(700)

conferir(
  'o código curto de inventário leva à tela de contagem, não à de validade',
  pagina.url().includes(`#/i/${ids[1]}`),
  pagina.url(),
)

// --- 5. O item do estoque conta as etiquetas em estoque --------------------
await pagina.goto(`${BASE}#/estoque/${cenario.produtoId}`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/item-com-inventario.png`, fullPage: true })

const item = await pagina.textContent('body')
conferir('o item do estoque mostra o acesso às etiquetas de inventário', item.includes('Etiquetas de inventário'))

// --- 6. A tela de impressão existe e usa o modelo sem data -----------------
await pagina.goto(`${BASE}#/estoque/${cenario.produtoId}/inventario`, {
  waitUntil: 'networkidle',
})
await pagina.waitForTimeout(900)
await pagina.screenshot({ path: `${SAIDA}/imprimir-inventario.png`, fullPage: true })

const impressao = await pagina.textContent('body')
conferir('a tela de impressão avisa que é sem validade', impressao.includes('Sem data de validade'))
conferir('a prévia é renderizada', (await pagina.locator('canvas').count()) > 0)

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
