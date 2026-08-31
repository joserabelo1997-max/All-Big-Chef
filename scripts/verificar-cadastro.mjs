// Verifica, num Chromium real, as três melhorias de cadastro e alerta pedidas
// para o Módulo 2:
//
//   1. Fornecedor digitado na hora do cadastro do produto, sem sair da tela.
//   2. Lote cadastrado no produto e usado como padrão na fila de impressão.
//   3. Alerta separado para o que vence com a casa fechada.
//
//   node scripts/verificar-cadastro.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/cadastro'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5192
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

// --- 1. Fornecedor inédito, digitado durante o cadastro do produto ---------
await pagina.goto(`${BASE}#/produtos/novo`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(400)

const fornecedoresAntes = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return db.suppliers.count()
})

await pagina.fill('#nome', 'Creme de leite fresco')
await pagina.fill('input[list]', 'Laticínios São João')
await pagina.waitForTimeout(200)

const avisoNovo = await pagina.textContent('body')
conferir(
  'avisa que o fornecedor digitado é novo antes de salvar',
  avisoNovo.includes('será cadastrado ao salvar'),
)

await pagina.fill('#lote', 'L-4412')
await pagina.screenshot({ path: `${SAIDA}/produto-com-fornecedor-novo.png`, fullPage: true })
await pagina.click('button:has-text("Salvar produto")')
await pagina.waitForTimeout(800)

const depoisDeSalvar = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const produto = await db.products.filter((p) => p.nome === 'Creme de leite fresco').first()
  const fornecedor = produto?.supplier_id ? await db.suppliers.get(produto.supplier_id) : null
  return {
    totalFornecedores: await db.suppliers.count(),
    lote: produto?.lote_atual ?? null,
    fornecedorNome: fornecedor?.nome ?? null,
    produtoId: produto?.id ?? null,
    naOutbox: (await db.outbox.toArray()).map((o) => o.tabela),
  }
})

conferir(
  'fornecedor inédito foi cadastrado junto com o produto',
  depoisDeSalvar.totalFornecedores === fornecedoresAntes + 1,
  `${fornecedoresAntes} → ${depoisDeSalvar.totalFornecedores}`,
)
conferir(
  'produto ficou vinculado ao fornecedor criado',
  depoisDeSalvar.fornecedorNome === 'Laticínios São João',
  String(depoisDeSalvar.fornecedorNome),
)
conferir(
  'fornecedor novo entrou na fila de sincronização',
  depoisDeSalvar.naOutbox.includes('suppliers'),
)
conferir('lote foi guardado no produto', depoisDeSalvar.lote === 'L-4412')

// --- 2. Digitar o mesmo fornecedor com outra grafia NÃO duplica ------------
await pagina.goto(`${BASE}#/produtos/novo`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(400)
await pagina.fill('#nome', 'Requeijão')
await pagina.fill('input[list]', 'laticinios sao joao')
await pagina.waitForTimeout(200)

const avisoRepetido = await pagina.textContent('body')
conferir(
  'reconhece o fornecedor já cadastrado apesar do acento e da caixa',
  !avisoRepetido.includes('será cadastrado ao salvar'),
)

await pagina.click('button:has-text("Salvar produto")')
await pagina.waitForTimeout(800)

const semDuplicar = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const nomes = (await db.suppliers.toArray()).map((f) => f.nome)
  return { total: nomes.length, nomes }
})
conferir(
  'não criou um segundo fornecedor para o mesmo nome',
  semDuplicar.total === fornecedoresAntes + 1,
  semDuplicar.nomes.join(' | '),
)

// --- 3. O lote do cadastro chega preenchido na fila de impressão -----------
await pagina.evaluate(async (produtoId) => {
  const { lerCarrinho, gravarCarrinho } = await import('/All-Big-Chef/src/lib/carrinho.ts')
  gravarCarrinho({ ...lerCarrinho(), [produtoId]: 2 })
}, depoisDeSalvar.produtoId)

await pagina.goto(`${BASE}#/fila`, { waitUntil: 'networkidle' })
// O carrinho é lido do localStorage na montagem do provedor; recarregar garante
// que a fila enxergue o que acabou de ser gravado.
await pagina.reload({ waitUntil: 'networkidle' })
await pagina.waitForTimeout(800)

const loteNaFila = await pagina.inputValue('input[aria-label="Lote de Creme de leite fresco"]')
conferir(
  'fila de impressão já vem com o lote do cadastro',
  loteNaFila === 'L-4412',
  loteNaFila,
)

// E continua editável, para a caixa que veio de outro lote.
await pagina.fill('input[aria-label="Lote de Creme de leite fresco"]', 'L-9999')
await pagina.waitForTimeout(200)
const loteEditado = await pagina.inputValue('input[aria-label="Lote de Creme de leite fresco"]')
conferir('lote continua editável na bancada', loteEditado === 'L-9999')

await pagina.screenshot({ path: `${SAIDA}/fila-com-lote.png`, fullPage: true })

// --- 4. Alerta de validade com a casa fechada ------------------------------
// A casa fecha domingo e segunda. Criamos duas etiquetas: uma que vence no
// próximo domingo e outra numa quarta. Só a primeira pode aparecer.
const cenario = await pagina.evaluate(async () => {
  const { db, salvarESincronizar } = await import('/All-Big-Chef/src/lib/db.ts')
  const { salvarPreferencias } = await import('/All-Big-Chef/src/lib/configuracoes.ts')

  const orgId = (await db.folders.toArray())[0].org_id
  await salvarPreferencias(orgId, { diasAntes: 2, horario: '08:00', diasFechados: [0, 1] })

  const proximo = (diaDaSemana) => {
    const d = new Date()
    d.setHours(23, 59, 0, 0)
    // 1..7 dias à frente, para cair sempre dentro da janela de uma semana.
    const avanco = ((diaDaSemana - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + avanco)
    return d
  }

  const criar = async (nome, quando) => {
    const agora = new Date().toISOString()
    const id = crypto.randomUUID()
    await salvarESincronizar('labels', {
      id,
      org_id: orgId,
      short_code: nome.slice(0, 6).toUpperCase(),
      produto_snapshot: nome,
      opened_at: agora,
      expires_at: quando.toISOString(),
      printed_at: agora,
      status: 'ativa',
      created_at: agora,
      updated_at: agora,
    })
    return id
  }

  return {
    domingo: await criar('Vence no domingo', proximo(0)),
    quarta: await criar('Vence na quarta', proximo(3)),
  }
})

await pagina.goto(`${BASE}#/`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/painel-casa-fechada.png`, fullPage: true })

const painel = await pagina.textContent('body')
conferir('painel avisa sobre o que vence com a casa fechada', painel.includes('casa fechada'))
conferir(
  'o aviso diz quais dias a casa fecha',
  painel.includes('domingo') && painel.includes('segunda'),
)

// O contador "em breve" continua existindo — o alerta novo é adicional, não
// substitui o antigo, que foi exatamente o pedido.
conferir('contador "Em breve" continua no painel', painel.includes('Em breve'))

await pagina.goto(`${BASE}#/etiquetas?filtro=fechada`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/etiquetas-casa-fechada.png`, fullPage: true })

const lista = await pagina.textContent('body')
conferir('filtro lista a etiqueta que vence no domingo', lista.includes('Vence no domingo'))
conferir('filtro não lista a que vence na quarta', !lista.includes('Vence na quarta'))

// --- 5. "Dar baixa" virou "Escanear QR Code" -------------------------------
await pagina.goto(`${BASE}#/baixa`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)
conferir(
  'o endereço antigo /baixa redireciona para /escanear',
  pagina.url().includes('#/escanear'),
  pagina.url(),
)

const escanear = await pagina.textContent('body')
conferir('a tela se chama Escanear QR Code', escanear.includes('Escanear QR Code'))
conferir('não sobrou nenhum "Dar baixa" na navegação', !escanear.includes('Dar baixa'))

const falhas = checagens.filter((c) => !c.ok)
console.log(JSON.stringify({ checagens, problemas, cenario }, null, 2))
console.log(
  falhas.length === 0
    ? `\n✓ ${checagens.length} checagens passaram`
    : `\n✗ ${falhas.length} de ${checagens.length} falharam`,
)

await navegador.close()
await servidor.close()

if (falhas.length > 0 || problemas.length > 0) process.exitCode = 1
