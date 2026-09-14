/**
 * Abre o app num navegador de verdade e fotografa cada tela.
 *
 * Serve para conferir com os olhos o que o typecheck não vê: se a tela monta, se
 * o texto cabe na largura de celular, se a barra de baixo não cobre conteúdo.
 *
 * A sessão é plantada no localStorage em vez de passar pelo login: o objetivo é
 * ver as telas, não exercitar o Supabase. As chamadas ao banco falham de
 * propósito e o app segue de pé lendo do espelho local — que é exatamente o
 * comportamento offline que ele promete.
 *
 *   node scripts/verificar-telas.mjs [url]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

// O ambiente pode trazer um Chromium já instalado numa versão diferente da que a
// biblioteca espera baixar. Apontar direto para o executável evita um download de
// centenas de megabytes só para tirar screenshot.
const chromiumDoAmbiente = '/opt/pw-browsers/chromium'
const opcoesDeLancamento = existsSync(chromiumDoAmbiente)
  ? { executablePath: chromiumDoAmbiente }
  : {}

const base = process.argv[2] ?? 'http://localhost:4173'
const saida = 'capturas'

const SESSAO_FALSA = {
  access_token: 'token-de-teste',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh-de-teste',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'chef@exemplo.com',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
}

const TELAS = [
  ['inicio', '/'],
  ['receitas', '/receitas'],
  ['insumos', '/insumos'],
  ['cmv', '/cmv'],
  ['producao', '/producao'],
  ['compras', '/compras'],
  ['menus', '/menus'],
  ['servicos', '/servicos'],
  ['config', '/config'],
]

const problemas = []

const navegador = await chromium.launch(opcoesDeLancamento)
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 14
  deviceScaleFactor: 2,
  locale: 'pt-BR',
})

contexto.on('console', (msg) => {
  if (msg.type() === 'error') {
    const texto = msg.text()
    // Falha de rede ao sincronizar é esperada aqui: não há Supabase de verdade.
    if (/Failed to (load|fetch)|net::ERR|supabase|401|400/i.test(texto)) return
    problemas.push(`console: ${texto}`)
  }
})
contexto.on('pageerror', (erro) => problemas.push(`erro de página: ${erro.message}`))

await mkdir(saida, { recursive: true })

const pagina = await contexto.newPage()
await pagina.goto(base, { waitUntil: 'domcontentloaded' })

// Planta a sessão e recarrega: com sessão válida o app monta os provedores, e é
// só aí que o Dexie cria o banco local com as tabelas certas.
await pagina.evaluate((sessao) => {
  localStorage.setItem('all-big-chef-sessao', JSON.stringify(sessao))
}, SESSAO_FALSA)

await pagina.reload({ waitUntil: 'networkidle' })
await pagina.getByText('Onde você cozinha').waitFor({ timeout: 15_000 })

// Agora o banco existe e dá para plantar o restaurante direto nele.
await pagina.evaluate(async () => {
  const banco = await new Promise((ok, falhou) => {
    const pedido = indexedDB.open('all-big-chef')
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => falhou(pedido.error)
  })
  await new Promise((ok, falhou) => {
    const transacao = banco.transaction('espacos', 'readwrite')
    transacao.objectStore('espacos').put({
      id: '00000000-0000-4000-8000-0000000000aa',
      dono_id: '00000000-0000-4000-8000-000000000001',
      espaco_id: null,
      nome: 'Casa do Chef',
      tipo_casa: 'a_la_carte',
      cmv_alvo: 0.325,
      atualizado_em: new Date().toISOString(),
      apagado_em: null,
    })
    transacao.oncomplete = ok
    transacao.onerror = () => falhou(transacao.error)
  })
  banco.close()
})

for (const [nome, rota] of TELAS) {
  await pagina.goto(`${base}${rota === '/' ? '' : rota}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(400)

  const texto = await pagina.locator('body').innerText()
  if (texto.includes('não está ligado a um banco')) {
    problemas.push(`${nome}: parou na tela de configuração (VITE_SUPABASE_* ausentes no build)`)
  }
  if (texto.includes('Onde você cozinha')) {
    problemas.push(`${nome}: parou nas boas-vindas (o restaurante plantado não foi lido)`)
  }

  // A promessa de caber no celular vale para todas as telas.
  const rolagemLateral = await pagina.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  if (rolagemLateral) problemas.push(`${nome}: a tela rola para o lado em 390px de largura`)

  await pagina.screenshot({ path: `${saida}/${nome}.png`, fullPage: true })
  console.log(`  ${nome} → ${saida}/${nome}.png`)
}

await navegador.close()

if (problemas.length > 0) {
  console.error('\nProblemas encontrados:')
  for (const p of problemas) console.error(`  - ${p}`)
  process.exit(1)
}

console.log('\nTodas as telas abriram e couberam na largura de celular.')
