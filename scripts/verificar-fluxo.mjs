/**
 * Percorre o app como um cozinheiro percorreria, e confere as contas na saída.
 *
 * Cadastra dois insumos, escreve um preparo, escreve um prato que usa esse
 * preparo, e verifica que o custo que aparece na tela é o mesmo que se calcula
 * no papel. É o teste que prova que o domínio está de fato ligado à interface —
 * o teste unitário garante a conta, este garante que a conta chegou na tela.
 *
 *   node scripts/verificar-fluxo.mjs [url]
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://localhost:4173'
const chromiumDoAmbiente = '/opt/pw-browsers/chromium'

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

const falhas = []

function conferir(descricao, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  ok   ${descricao}`)
  } else {
    console.log(`  FALHA ${descricao} ${detalhe}`)
    falhas.push(`${descricao} ${detalhe}`.trim())
  }
}

const navegador = await chromium.launch(
  existsSync(chromiumDoAmbiente) ? { executablePath: chromiumDoAmbiente } : {},
)
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'pt-BR',
})
const pagina = await contexto.newPage()

contexto.on('pageerror', (erro) => falhas.push(`erro de página: ${erro.message}`))

// --- preparar sessão e restaurante ------------------------------------------
await pagina.goto(base, { waitUntil: 'domcontentloaded' })
await pagina.evaluate((s) => localStorage.setItem('all-big-chef-sessao', JSON.stringify(s)), SESSAO_FALSA)
await pagina.reload({ waitUntil: 'networkidle' })
await pagina.getByText('Onde você cozinha').waitFor({ timeout: 15_000 })

await pagina.getByLabel('Nome do restaurante').fill('Casa do Chef')
await pagina.getByRole('button', { name: 'Criar restaurante' }).click()
await pagina.getByRole('navigation', { name: 'Atalhos' }).waitFor({ timeout: 15_000 })
console.log('\nRestaurante criado.')

// --- insumos ----------------------------------------------------------------
async function cadastrarInsumo({ nome, quantidade, unidadeCompra, preco, unidadeUso, fator }) {
  await pagina.goto(`${base}/insumos`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: 'Novo insumo' }).click()
  await pagina.getByLabel('Nome', { exact: true }).fill(nome)
  await pagina.getByLabel('Quantidade', { exact: true }).fill(String(quantidade).replace('.', ','))
  await pagina.getByLabel('Unidade de compra').selectOption(unidadeCompra)
  await pagina.getByLabel('Preço dessa quantidade').fill(String(preco).replace('.', ','))
  await pagina.getByLabel('Unidade de uso').selectOption(unidadeUso)
  await pagina.getByLabel('Fator', { exact: true }).fill(String(fator).replace('.', ','))
  await pagina.getByRole('button', { name: 'Salvar' }).click()
  await pagina.getByRole('dialog').waitFor({ state: 'detached', timeout: 10_000 })
}

// Cebola: 1 kg por R$ 5,00, usada em g, fator 1,2 → R$ 0,005 por grama bruto.
await cadastrarInsumo({
  nome: 'Cebola', quantidade: 1, unidadeCompra: 'kg', preco: 5, unidadeUso: 'g', fator: 1.2,
})
// Azeite: 500 ml por R$ 20,00 → R$ 0,04 por ml.
await cadastrarInsumo({
  nome: 'Azeite', quantidade: 500, unidadeCompra: 'ml', preco: 20, unidadeUso: 'ml', fator: 1,
})

const textoInsumos = await pagina.locator('body').innerText()
conferir('a tela de insumos mostra o preço por unidade de uso', textoInsumos.includes('0,04'))
conferir('a tela de insumos mostra a perda do fator de correção', textoInsumos.includes('perde 17%'))

// --- receitas ---------------------------------------------------------------
async function criarFicha(tipo, nome) {
  await pagina.goto(`${base}/receitas`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: 'Nova receita' }).click()
  await pagina
    .getByRole('dialog', { name: 'O que você vai escrever?' })
    .getByRole('button', { name: new RegExp(`^${tipo}`, 'i') })
    .click()
  await pagina.getByLabel(/Nome do (prato|preparo)/).waitFor({ timeout: 10_000 })
  await pagina.getByLabel(/Nome do (prato|preparo)/).fill(nome)
}

async function definirRendimento(quantidade, unidade, porcoes) {
  await pagina.getByLabel('A receita inteira rende').fill(String(quantidade))
  await pagina.getByLabel('Unidade do rendimento').selectOption(unidade)
  await pagina.getByLabel('Em quantas porções').fill(String(porcoes))
}

async function adicionarItem(nomeDoItem, quantidade, unidade) {
  await pagina.getByRole('button', { name: 'Adicionar' }).click()
  await pagina.getByRole('dialog', { name: 'Adicionar à receita' }).waitFor()
  await pagina.getByRole('dialog').getByRole('button', { name: new RegExp(nomeDoItem, 'i') }).first().click()
  await pagina.getByRole('dialog').waitFor({ state: 'detached', timeout: 10_000 })

  const linha = pagina.getByRole('listitem').filter({ hasText: nomeDoItem }).first()
  await linha.getByRole('button', { name: 'editar' }).click()
  await pagina.getByLabel('Quantidade', { exact: true }).fill(String(quantidade).replace('.', ','))
  await pagina.getByLabel('Unidade do item').selectOption(unidade)
  await linha.getByRole('button', { name: 'fechar' }).click()
}

// Fundo: rende 2000 ml em 10 porções, com 300 g de cebola e 50 ml de azeite.
//   cebola 300 × 1,2 × 0,005 = R$ 1,80    azeite 50 × 0,04 = R$ 2,00 → R$ 3,80
await criarFicha('Preparo', 'Fundo de legumes')
await definirRendimento(2000, 'ml', 10)
await adicionarItem('Cebola', 300, 'g')
await adicionarItem('Azeite', 50, 'ml')

let texto = await pagina.locator('body').innerText()
conferir('o preparo soma R$ 3,80 na receita inteira', texto.includes('3,80'), `(tela: ${resumo(texto)})`)

// Sopa: rende 1200 ml em 4 porções, com 1000 ml do fundo e 100 g de cebola.
//   fundo (metade do rendimento) R$ 1,90 + cebola R$ 0,60 = R$ 2,50 → R$ 0,63/porção
await criarFicha('Prato', 'Sopa do dia')
await definirRendimento(1200, 'ml', 4)
await adicionarItem('Fundo de legumes', 1000, 'ml')
await adicionarItem('Cebola', 100, 'g')

await mkdir('capturas', { recursive: true })
await pagina.screenshot({ path: 'capturas/editor-prato.png', fullPage: true })

texto = await pagina.locator('body').innerText()
conferir('o prato soma R$ 2,50 no total', texto.includes('2,50'), `(tela: ${resumo(texto)})`)
conferir('o prato mostra R$ 0,63 por porção', texto.includes('0,63'), `(tela: ${resumo(texto)})`)
conferir('o preparo aninhado é cobrado por metade (R$ 1,90)', texto.includes('1,90'))
conferir('o preço sugerido aparece a partir do CMV alvo', /R\$\s*1,9[0-9]|Para um CMV/.test(texto))
conferir('nenhum aviso de custo aberto sobrou', !texto.includes('custo aberto'))

// O laço tem que ser barrado antes de acontecer: a sopa já usa o fundo, então o
// fundo não pode oferecer a sopa como componente.
await pagina.goto(`${base}/receitas`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: /Preparos/ }).click()
await pagina.getByRole('button', { name: /Fundo de legumes/ }).click()
await pagina.getByLabel('Nome do preparo').waitFor()
await pagina.getByRole('button', { name: 'Adicionar' }).click()
await pagina.getByRole('dialog', { name: 'Adicionar à receita' }).waitFor()
const ofereceSopa = await pagina.getByRole('dialog').getByText('Sopa do dia').count()
conferir('o prato que já usa este preparo não é oferecido de volta', ofereceSopa === 0)

await navegador.close()

function resumo(t) {
  return t.replace(/\s+/g, ' ').slice(0, 160)
}

if (falhas.length > 0) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`)
  process.exit(1)
}
console.log('\nO fluxo inteiro fecha, e as contas na tela batem com as do papel.')
