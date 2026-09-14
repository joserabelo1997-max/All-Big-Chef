/**
 * Peças comuns aos scripts de conferência.
 *
 * A sessão é plantada no localStorage em vez de passar pelo login: o objetivo é
 * exercitar o app, não o Supabase. As chamadas ao banco falham de propósito e o
 * app segue de pé lendo do espelho local — que é exatamente o comportamento
 * offline que ele promete.
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const CHROMIUM_DO_AMBIENTE = '/opt/pw-browsers/chromium'

export const SESSAO_FALSA = {
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

/** O Intl separa "R$" do número com espaço não separável; comparar exige normalizar. */
export const semEspacoDuro = (texto) => texto.replace(/ /g, ' ')

export function criarConferidor() {
  const falhas = []
  return {
    falhas,
    conferir(descricao, condicao, detalhe = '') {
      if (condicao) {
        console.log(`  ok   ${descricao}`)
      } else {
        console.log(`  FALHA ${descricao} ${detalhe}`)
        falhas.push(descricao)
      }
    },
    encerrar(mensagemDeSucesso) {
      if (falhas.length > 0) {
        console.error(`\n${falhas.length} verificação(ões) falharam.`)
        process.exit(1)
      }
      console.log(`\n${mensagemDeSucesso}`)
    },
  }
}

export async function abrirApp(base, { nomeDoRestaurante = 'Casa do Chef', falhas } = {}) {
  const navegador = await chromium.launch(
    existsSync(CHROMIUM_DO_AMBIENTE) ? { executablePath: CHROMIUM_DO_AMBIENTE } : {},
  )
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'pt-BR',
  })
  if (falhas) contexto.on('pageerror', (erro) => falhas.push(`erro de página: ${erro.message}`))

  const pagina = await contexto.newPage()
  await pagina.goto(base, { waitUntil: 'domcontentloaded' })
  await pagina.evaluate(
    (sessao) => localStorage.setItem('all-big-chef-sessao', JSON.stringify(sessao)),
    SESSAO_FALSA,
  )
  await pagina.reload({ waitUntil: 'networkidle' })
  await pagina.getByText('Onde você cozinha').waitFor({ timeout: 15_000 })
  await pagina.getByLabel('Nome do restaurante').fill(nomeDoRestaurante)
  await pagina.getByRole('button', { name: 'Criar restaurante' }).click()
  await pagina.getByRole('navigation', { name: 'Atalhos' }).waitFor({ timeout: 15_000 })

  return { navegador, contexto, pagina }
}

const virgula = (n) => String(n).replace('.', ',')

export async function cadastrarInsumo(pagina, base, dados) {
  await pagina.goto(`${base}/insumos`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: 'Novo insumo' }).click()
  await pagina.getByLabel('Nome', { exact: true }).fill(dados.nome)
  if (dados.categoria) await pagina.getByLabel('Categoria').fill(dados.categoria)
  if (dados.fornecedor) await pagina.getByLabel('Fornecedor').fill(dados.fornecedor)
  await pagina.getByLabel('Quantidade', { exact: true }).fill(virgula(dados.quantidade))
  await pagina.getByLabel('Unidade de compra').selectOption(dados.unidadeCompra)
  await pagina.getByLabel('Preço dessa quantidade').fill(virgula(dados.preco))
  await pagina.getByLabel('Unidade de uso').selectOption(dados.unidadeUso)
  await pagina.getByLabel('Fator', { exact: true }).fill(virgula(dados.fator))
  await pagina.getByRole('button', { name: 'Salvar' }).click()
  await pagina.getByRole('dialog').waitFor({ state: 'detached', timeout: 10_000 })
}

export async function criarFicha(pagina, base, tipo, nome) {
  await pagina.goto(`${base}/receitas`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: 'Nova receita' }).click()
  await pagina
    .getByRole('dialog', { name: 'O que você vai escrever?' })
    .getByRole('button', { name: new RegExp(`^${tipo}`, 'i') })
    .click()
  await pagina.getByLabel(/Nome do (prato|preparo)/).waitFor({ timeout: 10_000 })
  await pagina.getByLabel(/Nome do (prato|preparo)/).fill(nome)
}

export async function abrirFicha(pagina, base, aba, nome) {
  await pagina.goto(`${base}/receitas`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: aba, exact: true }).click()
  await pagina.getByRole('button', { name: new RegExp(nome) }).click()
  await pagina.getByLabel(/Nome do (prato|preparo)/).waitFor({ timeout: 10_000 })
}

export async function definirRendimento(pagina, quantidade, unidade, porcoes) {
  await pagina.getByLabel('A receita inteira rende').fill(String(quantidade))
  await pagina.getByLabel('Unidade do rendimento').selectOption(unidade)
  await pagina.getByLabel('Em quantas porções').fill(String(porcoes))
}

export async function adicionarItem(pagina, nomeDoItem, quantidade, unidade) {
  await pagina.getByRole('button', { name: 'Adicionar' }).click()
  await pagina.getByRole('dialog', { name: 'Adicionar à receita' }).waitFor()
  await pagina
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(nomeDoItem, 'i') })
    .first()
    .click()
  await pagina.getByRole('dialog').waitFor({ state: 'detached', timeout: 10_000 })
  await ajustarItem(pagina, nomeDoItem, quantidade, unidade)
}

export async function ajustarItem(pagina, nomeDoItem, quantidade, unidade) {
  const linha = pagina.getByRole('listitem').filter({ hasText: nomeDoItem }).first()
  await linha.getByRole('button', { name: 'editar' }).click()
  await pagina.getByLabel('Quantidade', { exact: true }).fill(virgula(quantidade))
  if (unidade) await pagina.getByLabel('Unidade do item').selectOption(unidade)
  await linha.getByRole('button', { name: 'fechar' }).click()
}

/** A cozinha de exemplo, a mesma dos testes unitários, montada pela interface. */
export async function montarCozinhaDeExemplo(pagina, base) {
  // Cebola: 1 kg por R$ 5,00, usada em g, fator 1,2 → R$ 0,005 por grama bruto.
  await cadastrarInsumo(pagina, base, {
    nome: 'Cebola', categoria: 'Hortifrúti', fornecedor: 'Feira',
    quantidade: 1, unidadeCompra: 'kg', preco: 5, unidadeUso: 'g', fator: 1.2,
  })
  // Azeite: 500 ml por R$ 20,00 → R$ 0,04 por ml.
  await cadastrarInsumo(pagina, base, {
    nome: 'Azeite', categoria: 'Mercearia', fornecedor: 'Distribuidora',
    quantidade: 500, unidadeCompra: 'ml', preco: 20, unidadeUso: 'ml', fator: 1,
  })

  // Fundo: rende 2000 ml em 10 porções → R$ 3,80 a receita inteira.
  await criarFicha(pagina, base, 'Preparo', 'Fundo de legumes')
  await definirRendimento(pagina, 2000, 'ml', 10)
  await adicionarItem(pagina, 'Cebola', 300, 'g')
  await adicionarItem(pagina, 'Azeite', 50, 'ml')

  // Sopa: rende 1200 ml em 4 porções → R$ 2,50, R$ 0,63 por porção.
  await criarFicha(pagina, base, 'Prato', 'Sopa do dia')
  await definirRendimento(pagina, 1200, 'ml', 4)
  await adicionarItem(pagina, 'Fundo de legumes', 1000, 'ml')
  await adicionarItem(pagina, 'Cebola', 100, 'g')
}
