// Exercita a tela de Fornecedores num Chromium real: escolher contato da
// agenda, cadastrar, e editar o telefone de quem já estava cadastrado.
//
// O Chromium de bancada NÃO tem a Contact Picker API — ela só existe no Android
// e no ChromeOS. Por isso a agenda é injetada por `addInitScript`: o que está
// sendo verificado é o caminho do app (o botão aparece, escolhe o número certo,
// preenche o nome, grava no Dexie), não a implementação do navegador.
//
// O que este script NÃO prova: que o seletor do sistema abre num Android de
// verdade. Isso só se confere no aparelho.
//
//   node scripts/verificar-fornecedores.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/fornecedores'
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

// Agenda falsa. O contato tem fixo E celular de propósito: é o caso que decide
// se `preferirCelular` está no caminho, porque abrir o WhatsApp no fixo não dá
// erro — dá uma conversa que nunca é respondida.
await pagina.addInitScript(() => {
  window.ContactsManager = class {}
  navigator.contacts = {
    getProperties: () => Promise.resolve(['name', 'tel', 'email']),
    select: () =>
      Promise.resolve([
        {
          name: ['Laticínios São João'],
          tel: ['(11) 3333-4444', '+55 11 98765-4321', '11987654321'],
        },
      ]),
  }
})

// O Chromium deste ambiente não alcança `supabase.co` (o Node alcança; ver
// `verificar-sync.mjs`). O erro de rede daí é do ambiente, não do app, e
// esconder qualquer outro erro atrás desse filtro derrubaria o valor do script.
const RUIDO_DO_AMBIENTE = /favicon|ERR_CONNECTION_RESET|supabase\.co/

const problemas = []
pagina.on('pageerror', (e) => {
  if (!RUIDO_DO_AMBIENTE.test(String(e))) problemas.push(String(e))
})
pagina.on('console', (m) => {
  if (m.type() === 'error' && !RUIDO_DO_AMBIENTE.test(m.text())) problemas.push(m.text())
})

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

const irPara = async (rota) => {
  await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
}

// --- 1. O botão da agenda aparece onde a API existe -------------------------
await irPara('#/config/fornecedores')
conferir('o botão "Da agenda" aparece', await pagina.isVisible('button:has-text("Da agenda")'))

// --- 2. Escolher o contato preenche nome e o CELULAR ------------------------
await pagina.click('button:has-text("Da agenda")')
await pagina.waitForTimeout(400)
await pagina.screenshot({ path: `${SAIDA}/agenda-escolhida.png`, fullPage: true })

const nomePreenchido = await pagina.inputValue('#nome-novo')
const telPreenchido = await pagina.inputValue('#telefone-novo')

conferir('preenche o nome do contato', nomePreenchido === 'Laticínios São João', nomePreenchido)
conferir(
  'escolhe o celular, e não o fixo',
  telPreenchido === '+55 11 98765-4321',
  telPreenchido,
)
conferir(
  'não pergunta quando o mesmo celular vem em dois formatos',
  !(await pagina.isVisible('text=Qual recebe o pedido')),
)

// --- 3. Cadastrar e conferir que gravou -------------------------------------
await pagina.click('button:has-text("Adicionar")')
await pagina.waitForTimeout(600)

const gravado = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const todos = await db.suppliers.toArray()
  const f = todos.find((x) => x.nome === 'Laticínios São João')
  return f ? { id: f.id, nome: f.nome, telefone: f.telefone } : null
})
conferir('grava o fornecedor com o telefone', gravado?.telefone === '+55 11 98765-4321', JSON.stringify(gravado))

// --- 4. Um fornecedor SEM telefone, como o atalho da tela de produto cria ---
// É a situação que não tinha conserto antes: nascia sem telefone e não havia
// como dar um a ele.
await pagina.evaluate(async () => {
  const { db, salvarESincronizar } = await import('/All-Big-Chef/src/lib/db.ts')
  const { novoId } = await import('/All-Big-Chef/src/lib/ids.ts')
  const orgId = (await db.suppliers.toArray())[0].org_id
  const agora = new Date().toISOString()
  await salvarESincronizar('suppliers', {
    id: novoId(),
    org_id: orgId,
    nome: 'Hortifruti da Esquina',
    ativo: true,
    created_at: agora,
    updated_at: agora,
  })
})
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: `${SAIDA}/sem-telefone.png`, fullPage: true })

const listado = await pagina.textContent('body')
conferir('a lista avisa quem está sem WhatsApp', listado.includes('Sem WhatsApp cadastrado'))

// --- 5. Editar esse fornecedor ---------------------------------------------
const linha = pagina.locator('li', { hasText: 'Hortifruti da Esquina' })
await linha.getByRole('button', { name: 'Editar' }).click()
await pagina.waitForTimeout(400)
await pagina.screenshot({ path: `${SAIDA}/editando.png`, fullPage: true })

conferir('abre a edição com o nome já preenchido', await pagina.isVisible('input[value="Hortifruti da Esquina"]'))

const idEditado = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const todos = await db.suppliers.toArray()
  return todos.find((x) => x.nome === 'Hortifruti da Esquina')?.id
})

await pagina.fill(`#telefone-${idEditado}`, '(21) 97777-1111')
await pagina.click('button:has-text("Salvar")')
await pagina.waitForTimeout(700)
await pagina.screenshot({ path: `${SAIDA}/depois-de-editar.png`, fullPage: true })

const depois = await pagina.evaluate(async (id) => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const f = await db.suppliers.get(id)
  return { telefone: f?.telefone, atualizado: f?.updated_at }
}, idEditado)

conferir('a edição persiste no banco local', depois.telefone === '(21) 97777-1111', String(depois.telefone))
conferir('e enfileira para subir ao servidor', await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const fila = await db.outbox.toArray()
  return fila.some((o) => o.tabela === 'suppliers')
}))

// --- 6. Sem a API, o botão não pode aparecer -------------------------------
// A metade iPhone da história, e a que passa despercebida: um botão que abre a
// agenda num aparelho que não tem agenda é uma promessa quebrada em cima do
// balcão. Aba nova, sem a agenda injetada — é o Chromium cru, que como o
// iPhone não tem a API.
const semAgenda = await navegador.newPage({ viewport: { width: 412, height: 900 } })
await semAgenda.goto(`${BASE}#/config/fornecedores`, { waitUntil: 'networkidle' })
await semAgenda.waitForTimeout(700)
await semAgenda.screenshot({ path: `${SAIDA}/sem-a-api.png`, fullPage: true })

conferir(
  'sem a API do aparelho, o botão da agenda não aparece',
  !(await semAgenda.isVisible('button:has-text("Da agenda")')),
)
conferir(
  'e o campo de digitar continua lá',
  await semAgenda.isVisible('#telefone-novo'),
)
await semAgenda.close()

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
