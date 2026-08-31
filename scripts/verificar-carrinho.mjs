// Reproduz num Chromium real o roteiro exato que motivou esta mudança:
// "cinco de creme de leite, apago a pesquisa, mais dez de pescado, mais cinco
// de carne" — com os três produtos em PASTAS DIFERENTES, que é o caso em que um
// carrinho local se perderia.
//
//   node scripts/verificar-carrinho.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/carrinho'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5190/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5190 },
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

// Três produtos em três pastas diferentes, como na cozinha real.
const pastas = await pagina.evaluate(async () => {
  const { db, salvarESincronizar } = await import('/All-Big-Chef/src/lib/db.ts')
  const todasPastas = await db.folders.toArray()
  const orgId = todasPastas[0].org_id
  const acha = (nome) => todasPastas.find((p) => p.nome === nome)

  const receita = [
    ['Creme de leite', 'Laticínios', 3],
    ['Pescada branca', 'Pescados', 2],
    ['Carne moída', 'Carnes', 2],
  ]
  const ids = {}
  for (const [nome, pastaNome, dias] of receita) {
    const pasta = acha(pastaNome)
    const produto = {
      id: crypto.randomUUID(),
      org_id: orgId,
      folder_id: pasta.id,
      nome,
      shelf_life_days: dias,
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await salvarESincronizar('products', produto)
    ids[nome] = { produtoId: produto.id, pastaId: pasta.id }
  }
  return ids
})

const lerCarrinho = () =>
  pagina.evaluate(() => JSON.parse(localStorage.getItem('abc:carrinho') ?? '{}'))

const somar = async (nomeProduto, vezes) => {
  for (let i = 0; i < vezes; i++) {
    const alvo =
      i === 0
        ? `button[aria-label="Adicionar ${nomeProduto}"]`
        : `button[aria-label="Mais um de ${nomeProduto}"]`
    await pagina.click(alvo)
    await pagina.waitForTimeout(80)
  }
}

// --- 1. Cinco de creme de leite, buscando pelo nome ---------------------------
await pagina.goto(`${BASE}#/produtos`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)
await pagina.fill('input[type="search"]', 'creme')
await pagina.waitForTimeout(300)
await somar('Creme de leite', 5)

let carrinho = await lerCarrinho()
conferir(
  'somou 5 de creme de leite',
  carrinho[pastas['Creme de leite'].produtoId] === 5,
  JSON.stringify(carrinho),
)

// --- 2. Apaga a busca e soma dez de pescado ----------------------------------
await pagina.click('button[aria-label="Limpar busca"]')
await pagina.waitForTimeout(300)
await pagina.fill('input[type="search"]', 'pescada')
await pagina.waitForTimeout(300)
await somar('Pescada branca', 10)

carrinho = await lerCarrinho()
conferir(
  'a busca nova NÃO apagou o creme de leite',
  carrinho[pastas['Creme de leite'].produtoId] === 5,
)
conferir('somou 10 de pescada', carrinho[pastas['Pescada branca'].produtoId] === 10)

// --- 3. Troca de PASTA e soma cinco de carne ---------------------------------
// É aqui que um carrinho local morreria: a rota muda.
await pagina.goto(`${BASE}#/produtos?pasta=${pastas['Carne moída'].pastaId}`, {
  waitUntil: 'networkidle',
})
await pagina.waitForTimeout(600)
await somar('Carne moída', 5)

carrinho = await lerCarrinho()
conferir(
  'o carrinho sobreviveu à troca de pasta',
  carrinho[pastas['Creme de leite'].produtoId] === 5 &&
    carrinho[pastas['Pescada branca'].produtoId] === 10 &&
    carrinho[pastas['Carne moída'].produtoId] === 5,
  JSON.stringify(carrinho),
)

await pagina.screenshot({ path: `${SAIDA}/produtos.png`, fullPage: true })

// --- 4. A barra mostra o total de ETIQUETAS, não de produtos -----------------
const textoBarra = await pagina.textContent('body')
conferir('a barra mostra 20 etiquetas', textoBarra.includes('20'), 'esperado 5+10+5')
conferir('a barra menciona os 3 produtos', textoBarra.includes('3 produtos'))

// --- 5. Sobrevive a recarregar (app minimizado) ------------------------------
await pagina.reload({ waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
carrinho = await lerCarrinho()
conferir(
  'o carrinho sobreviveu ao recarregamento',
  Object.keys(carrinho).length === 3,
  JSON.stringify(carrinho),
)

// --- 6. A barra leva à fila, e a fila lista os três --------------------------
await pagina.click('text=Imprimir')
await pagina.waitForTimeout(800)
const textoFila = await pagina.textContent('body')
conferir('a barra abriu a fila', pagina.url().includes('/fila'))
conferir(
  'a fila lista os três produtos',
  textoFila.includes('Creme de leite') &&
    textoFila.includes('Pescada branca') &&
    textoFila.includes('Carne moída'),
)
conferir('a fila anuncia 20 etiquetas', textoFila.includes('20'))
await pagina.screenshot({ path: `${SAIDA}/fila.png`, fullPage: true })

// --- 7. Não existe mais aba de imprimir --------------------------------------
// O que esta checagem protege é a ausência da aba "Imprimir": a impressão
// começa nos produtos e termina na barra do carrinho. O número de abas em si
// pode crescer — o Estoque entrou como a quinta.
const abas = await pagina.locator('nav a').allTextContents()
conferir(
  'a navegação não tem aba "Imprimir"',
  !abas.some((a) => a.includes('Imprimir')),
  abas.join(' | '),
)

// --- 8. Diminuir até zero remove o item --------------------------------------
for (let i = 0; i < 5; i++) {
  await pagina.click('button[aria-label="Menos um de Carne moída"]')
  await pagina.waitForTimeout(80)
}
carrinho = await lerCarrinho()
conferir(
  'zerar remove o produto em vez de guardar zero',
  !(pastas['Carne moída'].produtoId in carrinho),
  JSON.stringify(carrinho),
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
