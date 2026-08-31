// Confere a tela de conta no estado que importa: COM Supabase configurado e
// SEM sessão — que era exatamente o buraco antes desta tela existir. O app
// parecia funcionar, mas nada saía do aparelho e nada avisava.
//
// As variáveis são falsas de propósito: o cliente Supabase é criado (é o que
// decide se a tela mostra o formulário), mas nenhuma chamada de rede precisa
// dar certo para o que estamos verificando.
//
//   node scripts/verificar-conta.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/conta'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORTA = 5197
const BASE = `http://localhost:${PORTA}/All-Big-Chef/`

mkdirSync(SAIDA, { recursive: true })

// Chave anon com formato de JWT para o cliente aceitar; projeto inexistente.
const ANON_FALSA =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: PORTA },
  logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://exemplo.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(ANON_FALSA),
  },
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 900 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

// --- A tela de conta, sem sessão ------------------------------------------
await pagina.goto(`${BASE}#/config/conta`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1200)
await pagina.screenshot({ path: `${SAIDA}/conta-deslogado.png`, fullPage: true })

const conta = await pagina.textContent('body')
conferir('a tela oferece o formulário de entrada', await pagina.isVisible('#email'))
conferir('e o campo de senha', await pagina.isVisible('#senha'))
conferir(
  'avisa que fora da conta nada sai do aparelho',
  conta.includes('nada sai deste aparelho'),
)
conferir(
  'não mostra mais a mensagem de "sem banco configurado"',
  !conta.includes('ainda não está ligado ao banco'),
)

// O botão só libera com os dois campos preenchidos — evita tentativa vazia que
// só devolve erro do servidor.
conferir('botão começa desabilitado', await pagina.isDisabled('button:has-text("Entrar")'))
await pagina.fill('#email', 'cozinha@exemplo.com.br')
await pagina.fill('#senha', 'seguranca')
conferir(
  'botão libera com e-mail e senha preenchidos',
  await pagina.isEnabled('button:has-text("Entrar")'),
)

// --- Ajustes avisam que está fora da conta --------------------------------
await pagina.goto(`${BASE}#/config`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1000)
await pagina.screenshot({ path: `${SAIDA}/ajustes-fora-da-conta.png`, fullPage: true })

const ajustes = await pagina.textContent('body')
conferir('Ajustes avisam que está fora da conta', ajustes.includes('Fora da conta'))
conferir('e oferecem a entrada na lista', ajustes.includes('Conta do restaurante'))

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
