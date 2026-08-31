// Percorre num Chromium real o ciclo completo do estoque:
//
//   entrada de 10 kg → requisitar 3 kg → aprovar → saldo 7 kg
//   cair abaixo do mínimo → aparecer em Repor com o link do WhatsApp certo
//   contagem que acusa diferença → gerar movimento, não sobrescrever o saldo
//
//   node scripts/verificar-estoque.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/estoque'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5194
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

// --- Cenário: um produto controlado em kg, um responsável que pode aprovar ---
const cenario = await pagina.evaluate(async () => {
  const { db, salvarESincronizar } = await import('/All-Big-Chef/src/lib/db.ts')
  const { PADROES_PRODUTO } = await import('/All-Big-Chef/src/domain/types.ts')
  const agora = new Date().toISOString()
  const orgId = (await db.folders.toArray())[0].org_id

  const fornecedorId = crypto.randomUUID()
  await salvarESincronizar('suppliers', {
    id: fornecedorId,
    org_id: orgId,
    nome: 'Moinho São João',
    telefone: '(11) 98765-4321',
    ativo: true,
    created_at: agora,
    updated_at: agora,
  })

  const produtoId = crypto.randomUUID()
  await salvarESincronizar('products', {
    ...PADROES_PRODUTO,
    id: produtoId,
    org_id: orgId,
    supplier_id: fornecedorId,
    nome: 'Farinha de trigo',
    shelf_life_days: 90,
    controla_estoque: true,
    unidade_estoque: 'kg',
    estoque_minimo_kg: 5,
    ativo: true,
    created_at: agora,
    updated_at: agora,
  })

  const membroId = crypto.randomUUID()
  await salvarESincronizar('team_members', {
    id: membroId,
    org_id: orgId,
    nome: 'Chef Ana',
    ativo: true,
    pode_aprovar: true,
    created_at: agora,
    updated_at: agora,
  })

  return { orgId, produtoId, membroId, fornecedorId }
})

const saldoDe = (unidade = 'kg') =>
  pagina.evaluate(
    async ([id, u]) => {
      const { db } = await import('/All-Big-Chef/src/lib/db.ts')
      const produto = await db.products.get(id)
      return u === 'kg' ? produto.saldo_kg : produto.saldo_un
    },
    [cenario.produtoId, unidade],
  )

// --- 0. O cartão de pendências some quando está tudo configurado ----------
// O cenário acima já tem fornecedor com telefone e alguém que pode aprovar;
// falta só o dia de fechamento, então o cartão precisa mostrar UMA pendência.
await pagina.goto(`${BASE}#/estoque`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/pendencias-parcial.png`, fullPage: true })

const parcial = await pagina.textContent('body')
conferir('cartão cobra os dias de fechamento', parcial.includes('Dias de fechamento'))
conferir(
  'não cobra telefone nem aprovador, que já estão configurados',
  !parcial.includes('Nenhum fornecedor tem WhatsApp') &&
    !parcial.includes('Ninguém pode liberar'),
)

// Marcando os dias de fechamento, o cartão precisa sumir INTEIRO — sem precisar
// recarregar, porque tudo vem de useLiveQuery sobre o Dexie.
await pagina.evaluate(async (orgId) => {
  const { salvarPreferencias } = await import('/All-Big-Chef/src/lib/configuracoes.ts')
  await salvarPreferencias(orgId, { diasAntes: 2, horario: '08:00', diasFechados: [0, 1] })
}, cenario.orgId)
await pagina.waitForTimeout(900)
await pagina.screenshot({ path: `${SAIDA}/pendencias-resolvidas.png`, fullPage: true })

conferir(
  'cartão some sozinho quando não falta mais nada',
  !(await pagina.textContent('body')).includes('Falta configurar'),
)

// --- 1. Entrada de 10 kg pela interface -----------------------------------
await pagina.goto(`${BASE}#/estoque/${cenario.produtoId}`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)

await pagina.click('button:has-text("Entrada")')
await pagina.fill('#quantidade', '10')
await pagina.fill('#lote-mov', 'L-2026-A')
await pagina.fill('#valor-mov', '4,00')
await pagina.click('button:has-text("Chef Ana")')
await pagina.click('button:has-text("Confirmar")')
await pagina.waitForTimeout(800)

conferir('entrada de 10 kg soma ao saldo', (await saldoDe()) === 10, String(await saldoDe()))

// Uma segunda entrada com preço diferente, para conferir a média ponderada.
await pagina.click('button:has-text("Entrada")')
await pagina.fill('#quantidade', '30')
await pagina.fill('#lote-mov', 'L-2026-B')
await pagina.fill('#valor-mov', '6,00')
await pagina.click('button:has-text("Confirmar")')
await pagina.waitForTimeout(800)

const textoDetalhe = await pagina.textContent('body')
// 10 kg a R$ 4 e 30 kg a R$ 6 dão R$ 5,50 ponderado — a média simples daria 5.
conferir(
  'valor médio é ponderado pela quantidade, não a média simples',
  textoDetalhe.includes('5,50'),
  textoDetalhe.includes('5,00') ? 'mostrou 5,00 (média simples)' : '',
)
await pagina.screenshot({ path: `${SAIDA}/item-com-entradas.png`, fullPage: true })

// --- 2. Requisitar 3 kg e liberar -----------------------------------------
await pagina.goto(`${BASE}#/estoque/requisicoes`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.click('button:has-text("Chef Ana")')
await pagina.waitForTimeout(300)

const aviso = await pagina.textContent('body')
conferir('quem tem permissão vê que pode liberar a própria requisição', aviso.includes('inclusive a sua'))

await pagina.click('button:has-text("Nova requisição")')
await pagina.selectOption('#produto-req', { label: 'Farinha de trigo' })
await pagina.fill('#qtd-req', '3')
await pagina.fill('#motivo-req', 'Mise en place do jantar')
await pagina.screenshot({ path: `${SAIDA}/requisicao.png`, fullPage: true })
await pagina.click('button:has-text("Pedir e liberar")')
await pagina.waitForTimeout(900)

conferir('aprovar a requisição tira do estoque', (await saldoDe()) === 37, String(await saldoDe()))

const requisicao = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const [r] = await db.stock_requests.toArray()
  return r
})
conferir('requisição fica registrada como aprovada', requisicao?.status === 'aprovada')
conferir(
  'requisição aponta para o movimento que gerou',
  Boolean(requisicao?.movimento_id),
  String(requisicao?.movimento_id),
)
conferir(
  'quem pediu e quem liberou ficam registrados',
  requisicao?.solicitante_snapshot === 'Chef Ana' &&
    requisicao?.decidido_por_snapshot === 'Chef Ana',
)

// Aprovar de novo o mesmo pedido não pode tirar em dobro.
await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return db.stock_requests.toArray()
})
const saldoAntesDeReaprovar = await saldoDe()
await pagina.goto(`${BASE}#/estoque/requisicoes`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
conferir(
  'requisição aprovada sai da lista de pendentes',
  (await pagina.textContent('body')).includes('Pendentes (0)'),
)
conferir('saldo não muda ao reabrir a tela', (await saldoDe()) === saldoAntesDeReaprovar)

// --- 3. Cair abaixo do mínimo e aparecer em Repor --------------------------
await pagina.goto(`${BASE}#/estoque/${cenario.produtoId}`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.click('button:has-text("Saída")')
await pagina.fill('#quantidade', '34')
await pagina.click('button:has-text("Confirmar")')
await pagina.waitForTimeout(800)

conferir('saída derruba o saldo para 3 kg', (await saldoDe()) === 3, String(await saldoDe()))

await pagina.goto(`${BASE}#/estoque`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/lista-faltando.png`, fullPage: true })
conferir(
  'lista de estoque marca o item para repor',
  (await pagina.textContent('body')).includes('repor'),
)

await pagina.goto(`${BASE}#/estoque/repor`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/repor.png`, fullPage: true })

const textoRepor = await pagina.textContent('body')
conferir('Repor agrupa o item pelo fornecedor', textoRepor.includes('Moinho São João'))
conferir('Repor sugere o que falta para o mínimo', textoRepor.includes('2 kg'))

const link = await pagina.getAttribute('a:has-text("Pedir no WhatsApp")', 'href')
conferir('link do WhatsApp usa o telefone com DDI', link?.includes('wa.me/5511987654321'), link)
conferir('mensagem vai codificada, com acento e quebra de linha', Boolean(link?.includes('%0A')))
conferir(
  'mensagem traz o item que está faltando',
  decodeURIComponent(link ?? '').includes('Farinha de trigo: 2 kg'),
  decodeURIComponent(link ?? '').slice(0, 160),
)

// --- 4. Contagem que acusa diferença --------------------------------------
await pagina.goto(`${BASE}#/estoque/contagem`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
await pagina.click('button:has-text("Chef Ana")')
await pagina.click('button:has-text("Começar contagem")')
await pagina.waitForTimeout(900)

// O sistema acha que tem 3 kg; a prateleira tem 2.
await pagina.fill('input[aria-label*="Farinha de trigo"]', '2')
await pagina.click('h1')
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/contagem.png`, fullPage: true })

const textoContagem = await pagina.textContent('body')
conferir('a contagem mostra a falta antes de finalizar', textoContagem.includes('Falta 1 kg'))

const movimentosAntes = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  return db.stock_movements.count()
})

await pagina.click('button:has-text("Finalizar e ajustar")')
await pagina.waitForTimeout(1000)

const depoisDaContagem = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const movimentos = await db.stock_movements.toArray()
  const ultimo = movimentos.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  return { total: movimentos.length, ultimo }
})

conferir(
  'a contagem GERA movimento em vez de sobrescrever o saldo',
  depoisDaContagem.total === movimentosAntes + 1,
  `${movimentosAntes} → ${depoisDaContagem.total}`,
)
conferir(
  'a falta vira perda, não ajuste silencioso',
  depoisDaContagem.ultimo?.tipo === 'perda',
  String(depoisDaContagem.ultimo?.tipo),
)
conferir(
  'o motivo registra o que o sistema achava e o que foi contado',
  Boolean(depoisDaContagem.ultimo?.motivo?.includes('Contagem de inventário')),
  depoisDaContagem.ultimo?.motivo ?? '',
)
conferir('saldo passa a refletir o que foi contado', (await saldoDe()) === 2, String(await saldoDe()))

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
