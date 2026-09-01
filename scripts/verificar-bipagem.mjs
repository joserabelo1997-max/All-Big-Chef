// Exercita o caminho do leitor de código de barras num Chromium real.
//
// O leitor GS-CH6 funciona em modo teclado: ele "digita" o código e dá Enter.
// Por isso dá para simular fielmente aqui — o que o app vê é exatamente uma
// rajada de teclas, e é isso que `pagina.keyboard` produz.
//
//   node scripts/verificar-bipagem.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/bipagem'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5194
const BASE = `http://localhost:${PORTA}/All-Big-Chef/`

// EAN-13 de verdade, com dígito verificador que fecha.
const EAN = '7898357410015'
/** Segundo código, para o produto que NÃO controla estoque. */
const EAN_2 = '7891000100103'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: PORTA },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 900 } })

const RUIDO = /favicon|ERR_CONNECTION_RESET|supabase\.co/
const problemas = []
pagina.on('pageerror', (e) => {
  if (!RUIDO.test(String(e))) problemas.push(String(e))
})
pagina.on('console', (m) => {
  if (m.type() === 'error' && !RUIDO.test(m.text())) problemas.push(m.text())
})

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

/** Uma bipada: o leitor em modo teclado digita rápido e termina com Enter. */
async function bipar(codigo) {
  await pagina.evaluate(() => document.body.focus())
  for (const c of codigo) await pagina.keyboard.press(c, { delay: 8 })
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(900)
}

const irPara = async (rota) => {
  await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
}

// --- 1. Cadastrar um produto de estoque, sem código ainda ------------------
await irPara('#/produtos/novo')
await pagina.fill('#nome', 'Farinha de trigo')
conferir('o cadastro tem campo de código de barras', await pagina.isVisible('#codigo-barras'))

await pagina.click('label[for="controla-estoque"], #controla-estoque')
await pagina.waitForTimeout(300)
conferir('ligar "controla estoque" revela o mínimo', await pagina.isVisible('#minimo-un'))
await pagina.screenshot({ path: `${SAIDA}/cadastro.png`, fullPage: true })
await pagina.click('button:has-text("Salvar")')
await pagina.waitForTimeout(900)

// --- 2. Bipar um código que ainda não é de ninguém --------------------------
await irPara('#/estoque')
await bipar(EAN)
await pagina.screenshot({ path: `${SAIDA}/vincular.png`, fullPage: true })

const naVinculacao = await pagina.textContent('body')
conferir(
  'código novo vira convite para vincular, não erro',
  naVinculacao.includes('ainda sem dono'),
  pagina.url(),
)
conferir('e mostra o código agrupado como na embalagem', naVinculacao.includes('7 898357 410015'))

// --- 3. Tocar no produto vincula -------------------------------------------
await pagina.click('button:has-text("Farinha de trigo")')
await pagina.waitForTimeout(900)
await pagina.screenshot({ path: `${SAIDA}/vinculado.png`, fullPage: true })

const gravado = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const p = (await db.products.toArray()).find((x) => x.nome === 'Farinha de trigo')
  return { codigo: p?.codigo_barras, controla: p?.controla_estoque, id: p?.id }
})
conferir('o código fica gravado no produto', gravado.codigo === EAN, String(gravado.codigo))
conferir('vincular já liga o controle de estoque', gravado.controla === true)
conferir('e leva para a tela do item', pagina.url().includes(`/estoque/${gravado.id}`), pagina.url())

// --- 4. Bipar de novo agora abre direto ------------------------------------
await irPara('#/estoque')
await bipar(EAN)
conferir(
  'bipar de novo abre o produto direto, sem perguntar nada',
  pagina.url().includes(`/estoque/${gravado.id}`),
  pagina.url(),
)

const noItem = await pagina.textContent('body')
conferir('a tela do item oferece entrada e saída', noItem.includes('Entrada') && noItem.includes('Saída'))

// --- 5. O mínimo é editável ali, sem passar pelo cadastro ------------------
conferir('o mínimo aparece como ação, e não como recado passivo', noItem.includes('definir mínimo'))
await pagina.click('button:has-text("definir mínimo")')
await pagina.waitForTimeout(300)
await pagina.fill('input[aria-label*="mínimo"]', '4')
await pagina.click('button:has-text("Salvar")')
await pagina.waitForTimeout(800)
await pagina.screenshot({ path: `${SAIDA}/minimo.png`, fullPage: true })

const minimo = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const p = await db.products.get(id)
  return p?.estoque_minimo_un
}, gravado.id)
conferir('o mínimo salvo pela tela do estoque persiste', Number(minimo) === 4, String(minimo))

// --- 5b. Vincular a um produto que NÃO controla estoque ---------------------
// O passo que faltava: o produto acima já tinha o controle ligado, então a
// checagem "vincular liga o controle" passava mesmo com o código removido. Sem
// ligar, o item some da lista logo depois de vinculado — some justamente de
// onde a pessoa acabou de mandá-lo.
await irPara('#/produtos/novo')
await pagina.fill('#nome', 'Papel toalha')
await pagina.click('button:has-text("Salvar")')
await pagina.waitForTimeout(900)

const soEtiqueta = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const p = (await db.products.toArray()).find((x) => x.nome === 'Papel toalha')
  return { id: p?.id, controla: p?.controla_estoque }
})
conferir('o produto novo nasce sem controlar estoque', soEtiqueta.controla !== true)

await irPara('#/estoque')
await bipar(EAN_2)
await pagina.waitForTimeout(400)
conferir(
  'vinculando, a lista mostra até quem não controla estoque',
  (await pagina.textContent('body')).includes('Papel toalha'),
)
await pagina.click('button:has-text("Papel toalha")')
await pagina.waitForTimeout(900)

const depoisDeVincular = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const p = await db.products.get(id)
  return { codigo: p?.codigo_barras, controla: p?.controla_estoque }
}, soEtiqueta.id)
conferir(
  'vincular LIGA o controle de estoque de quem não tinha',
  depoisDeVincular.controla === true,
  String(depoisDeVincular.controla),
)
conferir('e o item passa a aparecer na lista do estoque', await (async () => {
  await irPara('#/estoque')
  return (await pagina.textContent('body')).includes('Papel toalha')
})())

// --- 6. Um código que não é nada não vira navegação -------------------------
await irPara('#/estoque')
const antes = pagina.url()
await bipar('99999999')
conferir('código sem dígito válido não leva a lugar nenhum', pagina.url() === antes, pagina.url())
conferir('mas avisa que leu', (await pagina.textContent('body')).includes('Código lido'))

// --- 7. Cadastrar produto a partir da pasta ---------------------------------
await irPara('#/pastas')
await pagina.screenshot({ path: `${SAIDA}/pastas.png`, fullPage: true })
conferir(
  'a tela de pastas tem como cadastrar produto',
  await pagina.isVisible('a:has-text("Cadastrar produto")'),
)

// --- 8. A caixa da mensagem, sem sintaxe crua ------------------------------
await irPara('#/config/fornecedores')
await pagina.screenshot({ path: `${SAIDA}/mensagem.png`, fullPage: true })

const emFornecedores = await pagina.textContent('body')
conferir(
  'os campos da mensagem viraram botões com nome de gente',
  emFornecedores.includes('nome do fornecedor') && emFornecedores.includes('lista do que falta'),
)
conferir(
  'a prévia mostra o resultado, e não o {{modelo}}',
  emFornecedores.includes('Laticínios São João') && emFornecedores.includes('Creme de leite'),
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
