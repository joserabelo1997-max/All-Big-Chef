// Exercita a montagem do pedido num Chromium real.
//
// O cenário é o que você descreveu: três produtos do mesmo fornecedor, dois
// faltando e um com estoque de sobra. Os dois primeiros vêm marcados, o
// terceiro não — e desmarcar um tem que tirá-lo da mensagem.
//
//   node scripts/verificar-pedido.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/pedido'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5193
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

const irPara = async (rota) => {
  await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
}

// --- 1. Semear o cenário --------------------------------------------------
// Três produtos do fornecedor "João":
//   A (Muçarela)  saldo 1, mínimo 5, três compras de 10 → média 10, FALTANDO
//   B (Requeijão) saldo 0, mínimo 2, sem histórico       → cai no mínimo, FALTANDO
//   C (Manteiga)  saldo 50, mínimo 5                     → sobrando, NÃO faltando
await irPara('#/estoque')
const ids = await pagina.evaluate(async () => {
  const { db, salvarESincronizar, registrarMovimento } = await import(
    '/All-Big-Chef/src/lib/db.ts'
  )
  const { novoId } = await import('/All-Big-Chef/src/lib/ids.ts')
  const { PADROES_PRODUTO } = await import('/All-Big-Chef/src/domain/types.ts')
  const orgId = localStorage.getItem('abc:org-id')
  const agora = () => new Date().toISOString()

  const fornecedorId = novoId()
  await salvarESincronizar('suppliers', {
    id: fornecedorId,
    org_id: orgId,
    nome: 'João',
    telefone: '11961404498',
    ativo: true,
    created_at: agora(),
    updated_at: agora(),
  })

  async function criar(nome, minimo, entradas) {
    const id = novoId()
    await salvarESincronizar('products', {
      ...PADROES_PRODUTO,
      id,
      org_id: orgId,
      supplier_id: fornecedorId,
      nome,
      shelf_life_days: 5,
      controla_estoque: true,
      unidade_estoque: 'un',
      estoque_minimo_un: minimo,
      ativo: true,
      created_at: agora(),
      updated_at: agora(),
    })
    for (const quantidade of entradas) {
      await registrarMovimento({
        id: novoId(),
        org_id: orgId,
        product_id: id,
        tipo: 'entrada',
        unidade: 'un',
        quantidade,
        ocorrido_em: agora(),
        created_at: agora(),
      })
    }
    return id
  }

  // A: compra 10 por vez; consumiu quase tudo.
  const a = await criar('Muçarela', 5, [10, 10, 10])
  await registrarMovimento({
    id: novoId(), org_id: orgId, product_id: a, tipo: 'saida', unidade: 'un',
    quantidade: 29, motivo: 'producao', ocorrido_em: agora(), created_at: agora(),
  })
  // B: nunca comprou nada — sem histórico.
  const b = await criar('Requeijão', 2, [])
  // C: tem de sobra.
  const c = await criar('Manteiga', 5, [50])

  return { fornecedorId, a, b, c }
})
await pagina.waitForTimeout(800)

// --- 2. Repor lista o fornecedor -------------------------------------------
await irPara('#/estoque/repor')
await pagina.screenshot({ path: `${SAIDA}/repor.png`, fullPage: true })
const naLista = await pagina.textContent('body')
conferir('Repor mostra o fornecedor com a contagem', naLista.includes('João') && naLista.includes('3 produtos'))
conferir('e aponta quantos estão no mínimo', naLista.includes('2 no mínimo'), naLista.slice(0, 200))

// --- 3. A tela do pedido ---------------------------------------------------
await irPara(`#/estoque/repor/${ids.fornecedorId}`)
await pagina.screenshot({ path: `${SAIDA}/pedido.png`, fullPage: true })

const caixaDe = (nome) => pagina.locator('li', { hasText: nome }).locator('input[type="checkbox"]')

conferir('todos os produtos do fornecedor aparecem, não só os que faltam',
  (await pagina.textContent('body')).includes('Manteiga'))
conferir('A (faltando) vem marcado', await caixaDe('Muçarela').isChecked())
conferir('B (faltando) vem marcado', await caixaDe('Requeijão').isChecked())
conferir('C (sobrando) vem DESMARCADO', !(await caixaDe('Manteiga').isChecked()))

// --- 4. As quantidades -----------------------------------------------------
const qtdDe = (nome) => pagina.locator('li', { hasText: nome }).locator('input[type="number"]')
conferir('A usa a média do que se costuma pedir (10), e não o que falta (4)',
  (await qtdDe('Muçarela').inputValue()) === '10', await qtdDe('Muçarela').inputValue())
conferir('B, sem histórico, cai no que falta para o mínimo (2)',
  (await qtdDe('Requeijão').inputValue()) === '2', await qtdDe('Requeijão').inputValue())

const corpo = await pagina.textContent('body')
conferir('a tela diz de onde veio cada sugestão',
  corpo.includes('quanto você costuma pedir') && corpo.includes('sem histórico ainda'))

// --- 5. A mensagem ---------------------------------------------------------
const mensagem = () => pagina.inputValue('#mensagem-do-pedido')
const antes = await mensagem()
conferir('a mensagem não tem marcador nenhum', !antes.includes('{{'), antes.slice(0, 80))
conferir('e traz os dois itens marcados', antes.includes('Muçarela') && antes.includes('Requeijão'))
conferir('sem o item desmarcado', !antes.includes('Manteiga'))

// --- 6. Marcar o C e depois desmarcar — o seu exemplo ----------------------
await caixaDe('Manteiga').check()
await pagina.waitForTimeout(400)
conferir('marcar C põe C na mensagem', (await mensagem()).includes('Manteiga'))

await caixaDe('Manteiga').uncheck()
await pagina.waitForTimeout(400)
conferir('DESMARCAR C tira C da mensagem', !(await mensagem()).includes('Manteiga'))
await pagina.screenshot({ path: `${SAIDA}/desmarcado.png`, fullPage: true })

// --- 7. Editar a mensagem antes de mandar ----------------------------------
await pagina.fill('#mensagem-do-pedido', 'Pode entregar sexta?')
await pagina.waitForTimeout(300)
const link = await pagina.getAttribute('a:has-text("Pedir no WhatsApp")', 'href')
conferir('o link leva o texto editado', decodeURIComponent(link).includes('Pode entregar sexta?'))
conferir('e vai para o telefone do fornecedor', link.includes('wa.me/5511961404498'), link.slice(0, 60))
conferir('nenhum marcador escapa para o WhatsApp', !decodeURIComponent(link).includes('{{'))

// --- 8. Ligar produto ao fornecedor pelo próprio fornecedor ---------------
await irPara('#/config/fornecedores')
await pagina.screenshot({ path: `${SAIDA}/fornecedor.png`, fullPage: true })
conferir('a linha do fornecedor diz quantos produtos ele tem',
  (await pagina.textContent('body')).includes('3 produtos'))

await pagina.click('button:has-text("Produtos")')
await pagina.waitForTimeout(500)
await pagina.screenshot({ path: `${SAIDA}/vinculo.png`, fullPage: true })
conferir('abre a lista de produtos para marcar', await pagina.isVisible('input[aria-label*="Buscar produto"]'))

const caixaManteiga = pagina.locator('label', { hasText: 'Manteiga' }).locator('input')
conferir('o já ligado vem marcado', await caixaManteiga.isChecked())
// `uncheck` exige que a caixa mude de estado NO CLIQUE, e não depois que o
// banco responde. É a diferença entre o toque parecer que pegou e a pessoa
// tocar de novo, desfazendo o que acabou de fazer.
await caixaManteiga.uncheck()
await pagina.waitForTimeout(700)

const desligado = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return (await db.products.get(id))?.supplier_id
}, ids.c)
conferir('desmarcar desfaz o vínculo no produto', desligado == null, String(desligado))

// --- 9. A caixa da mensagem, sem sintaxe ----------------------------------
const emFornecedores = await pagina.textContent('body')
conferir('a mensagem virou duas caixas', emFornecedores.includes('Antes da lista') && emFornecedores.includes('Depois da lista'))
conferir('e não mostra {{ em lugar nenhum', !emFornecedores.includes('{{'))

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
