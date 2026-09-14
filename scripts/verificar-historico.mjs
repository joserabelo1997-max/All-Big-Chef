/**
 * Prova a promessa central do diário: a versão guardada NÃO muda quando a receita
 * muda depois.
 *
 * Registra o dia, altera a ficha da sopa, registra de novo, e confere que a
 * versão 1 continua mostrando a quantidade antiga enquanto a versão 2 mostra a
 * nova. Se algum dia isso quebrar, "o que eu servi em 10 de setembro" passa a
 * responder errado sem avisar — e é o tipo de erro que só se descobre um ano
 * depois, quando já não dá para consertar.
 *
 *   node scripts/verificar-historico.mjs [url]
 */
import {
  abrirApp,
  abrirFicha,
  ajustarItem,
  criarConferidor,
  montarCozinhaDeExemplo,
  semEspacoDuro,
} from './apoio.mjs'

const base = process.argv[2] ?? 'http://localhost:4173'
const { falhas, conferir, encerrar } = criarConferidor()
const { navegador, pagina } = await abrirApp(base, { falhas })

await montarCozinhaDeExemplo(pagina, base)
console.log('\nCozinha de exemplo montada.')

// --- menu -------------------------------------------------------------------
await pagina.goto(`${base}/menus`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Novo menu' }).click()
await pagina.getByLabel('Nome do menu').fill('Menu de terça')
await pagina.getByRole('button', { name: 'Adicionar' }).click()
await pagina.getByRole('dialog', { name: 'Adicionar prato' }).waitFor()
await pagina.getByRole('dialog').getByRole('button', { name: /Sopa do dia/ }).click()
await pagina.getByLabel('Porções previstas').fill('8')
await pagina.getByRole('button', { name: 'Fechar' }).first().click()

let texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('o menu aparece na lista com o prato dentro', texto.includes('Menu de terça'))

// --- abrir o dia a partir do menu -------------------------------------------
await pagina.goto(`${base}/servicos`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Abrir o dia' }).click()
await pagina.getByLabel('Data', { exact: true }).fill('2026-09-10')
await pagina.getByLabel('Carregar a partir de um menu').selectOption({ label: 'Menu de terça' })
await pagina.getByRole('button', { name: 'Abrir', exact: true }).click()
await pagina.getByRole('button', { name: 'Registrar no histórico' }).waitFor({ timeout: 10_000 })

texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('o dia abre com a data pedida', texto.includes('10/09/2026'))
conferir('os pratos vieram copiados do menu', texto.includes('Sopa do dia'))
conferir('as porções previstas vieram junto', await pagina.getByLabel('Porções').inputValue() === '8')
// Sopa para 8 porções: o dobro de R$ 2,50.
conferir('o custo do dia é o da receita escalada', texto.includes('R$ 5,00'), `(tela: ${texto.slice(0, 120)})`)

// --- registrar a versão 1 ---------------------------------------------------
await pagina.getByRole('button', { name: 'Registrar no histórico' }).click()
await pagina.getByText('Dia registrado no histórico').waitFor({ timeout: 10_000 })
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a versão 1 entra no histórico', texto.includes('Versão 1'))

// --- alterar a receita DEPOIS de registrar ----------------------------------
// A sopa passa a levar 500 g de cebola no lugar de 100 g.
await abrirFicha(pagina, base, 'Pratos', 'Sopa do dia')
await ajustarItem(pagina, 'Cebola', 500)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a ficha de hoje reflete a mudança', texto.includes('500 g'))

// --- a versão guardada não pode ter mudado ----------------------------------
await pagina.goto(`${base}/servicos`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: /10\/09\/2026/ }).click()
await pagina.getByRole('button', { name: /Versão 1/ }).click()
await pagina.getByRole('dialog', { name: 'Versão 1' }).waitFor()

let dialogo = semEspacoDuro(await pagina.getByRole('dialog').innerText())
conferir('a versão 1 guardou a cebola antiga, 200 g para 8 porções', dialogo.includes('200 g'))
conferir('a versão 1 NÃO foi contaminada pela receita de hoje', !dialogo.includes('1.000 g'))
conferir('a versão 1 guardou o preparo aninhado', dialogo.includes('Fundo de legumes'))
conferir('a versão 1 guardou o custo daquele dia', dialogo.includes('R$ 5,00'))
await pagina.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click()

// --- registrar a versão 2 ---------------------------------------------------
await pagina.getByRole('button', { name: 'Registrar no histórico' }).click()
await pagina.getByText(/Versão 2 guardada/).waitFor({ timeout: 10_000 })

await pagina.getByRole('button', { name: /Versão 2/ }).click()
await pagina.getByRole('dialog', { name: 'Versão 2' }).waitFor()
dialogo = semEspacoDuro(await pagina.getByRole('dialog').innerText())
conferir('a versão 2 já traz a cebola nova, 1 kg para 8 porções', dialogo.includes('1 kg'))
await pagina.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click()

texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('as duas versões convivem no histórico', texto.includes('Versão 1') && texto.includes('Versão 2'))

// --- a busca acha o dia pelo prato ------------------------------------------
await pagina.goto(`${base}/servicos`, { waitUntil: 'networkidle' })
await pagina.getByLabel('Buscar por prato ou data…').fill('sopa')
await pagina.waitForTimeout(300)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('buscar pelo nome do prato acha o dia', texto.includes('10/09/2026'))

await pagina.getByLabel('Buscar por prato ou data…').fill('risoto')
await pagina.waitForTimeout(300)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('buscar por prato que nunca foi servido não acha nada', texto.includes('Nada encontrado'))

await navegador.close()
encerrar('O histórico guarda o passado como ele foi, e a receita de hoje não o alcança.')
