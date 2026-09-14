/**
 * Prova a ideia que sustenta o app: uma árvore, quatro leituras.
 *
 * Monta um menu com dois pratos que compartilham o mesmo fundo e confere que,
 * sem nenhum cadastro a mais, a produção consolidada mostra o fundo UMA vez com
 * a soma, e a lista de compras mostra a cebola UMA vez com a soma — as duas
 * lidas da mesma árvore que já produziu a ficha técnica e o custo.
 *
 * As contas, no papel:
 *
 *   Sopa para 8 porções consome 2000 ml de fundo; risoto para 2, mais 500 ml.
 *   Fundo total: 2,5 L.
 *
 *   Cebola: dentro do fundo, 300 g pela sopa + 75 g pelo risoto; direta, 200 g
 *   na sopa + 50 g no risoto. São 625 g líquidos, que com fator 1,2 viram 750 g
 *   brutos — o peso que se compra.
 *
 *   Azeite: 50 ml pela sopa + 12,5 ml pelo risoto = 62,5 ml.
 *
 *   node scripts/verificar-producao-compras.mjs [url]
 */
import { mkdir } from 'node:fs/promises'
import {
  abrirApp,
  adicionarItem,
  criarConferidor,
  criarFicha,
  definirRendimento,
  montarCozinhaDeExemplo,
  semEspacoDuro,
} from './apoio.mjs'

const base = process.argv[2] ?? 'http://localhost:4173'
const { falhas, conferir, encerrar } = criarConferidor()
const { navegador, pagina } = await abrirApp(base, { falhas })

await montarCozinhaDeExemplo(pagina, base)

// Um segundo prato que usa o MESMO fundo: é aqui que a consolidação prova valor.
await criarFicha(pagina, base, 'Prato', 'Risoto')
await definirRendimento(pagina, 800, 'g', 2)
await adicionarItem(pagina, 'Fundo de legumes', 500, 'ml')
await adicionarItem(pagina, 'Cebola', 50, 'g')
console.log('\nDois pratos dividindo o mesmo fundo.')

// --- menu e dia -------------------------------------------------------------
await pagina.goto(`${base}/menus`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Novo menu' }).click()
await pagina.getByLabel('Nome do menu').fill('Menu do dia')

for (const [prato, porcoes] of [['Sopa do dia', '8'], ['Risoto', '2']]) {
  await pagina.getByRole('button', { name: 'Adicionar' }).click()
  await pagina.getByRole('dialog', { name: 'Adicionar prato' }).waitFor()
  await pagina.getByRole('dialog').getByRole('button', { name: new RegExp(prato) }).click()
  const linha = pagina.getByRole('listitem').filter({ hasText: prato }).first()
  await linha.getByLabel('Porções previstas').fill(porcoes)
}
await pagina.getByRole('button', { name: 'Fechar' }).first().click()

await pagina.goto(`${base}/servicos`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Abrir o dia' }).click()
await pagina.getByLabel('Carregar a partir de um menu').selectOption({ label: 'Menu do dia' })
await pagina.getByRole('button', { name: 'Abrir', exact: true }).click()
await pagina.getByRole('button', { name: 'Registrar no histórico' }).waitFor({ timeout: 10_000 })

// --- produção: visão por prato ----------------------------------------------
await pagina.goto(`${base}/producao`, { waitUntil: 'networkidle' })
await mkdir('capturas', { recursive: true })
await pagina.screenshot({ path: 'capturas/producao-por-prato.png', fullPage: true })

let texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a visão por prato ramifica o prato nos seus preparos', texto.includes('Sopa do dia') && texto.includes('Fundo de legumes'))
conferir('a visão por prato desce até os ingredientes', texto.includes('Cebola') && texto.includes('Azeite'))
conferir('o fundo aparece duas vezes na visão por prato, uma sob cada prato',
  (texto.match(/Fundo de legumes/g) ?? []).length >= 2)
// Três tarefas, não cinco: o fundo entra em dois pratos mas é um trabalho só.
conferir('o progresso conta três tarefas, com o fundo contado uma vez', texto.includes('0 de 3'))

// --- produção: visão por preparo --------------------------------------------
await pagina.getByRole('button', { name: 'Por preparo' }).click()
await pagina.waitForTimeout(300)
await pagina.screenshot({ path: 'capturas/producao-por-preparo.png', fullPage: true })

texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a visão consolidada traz o fundo uma vez só', (texto.match(/Fundo de legumes/g) ?? []).length === 1)
conferir('o fundo aparece somado: 2,5 L', texto.includes('2,5 L'))
conferir('a lista diz em que pratos o preparo entra', texto.includes('usado em Sopa do dia, Risoto'))

const primeiraTarefa = await pagina.getByRole('listitem').first().innerText()
conferir('o preparo mais fundo vem primeiro na ordem de trabalho', primeiraTarefa.includes('Fundo de legumes'))

// --- marcar feito -----------------------------------------------------------
await pagina.getByRole('button', { name: /Fundo de legumes: a fazer/ }).click()
await pagina.waitForTimeout(200)
await pagina.getByRole('button', { name: /Fundo de legumes: fazendo/ }).click()
await pagina.waitForTimeout(300)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('marcar o fundo como feito move o progresso', texto.includes('1 de 3'))

// Marcado num lugar, marcado em todos: fazer o fundo é um trabalho só.
await pagina.getByRole('button', { name: 'Por prato' }).click()
await pagina.waitForTimeout(300)
const feitos = await pagina.getByRole('button', { name: /Fundo de legumes: feito/ }).count()
conferir('o fundo consta feito sob os dois pratos, não só sob um', feitos === 2)

// --- compras ----------------------------------------------------------------
await pagina.goto(`${base}/compras`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(400)
await pagina.screenshot({ path: 'capturas/compras.png', fullPage: true })

texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a cebola aparece uma vez só, somada dos dois pratos e dos dois níveis',
  (texto.match(/Cebola/g) ?? []).length === 1)
conferir('a cebola vem em peso bruto: 750 g', texto.includes('750 g'))
conferir('o azeite vem somado: 62,5 ml', texto.includes('62,5 ml'))
conferir('a lista diz para quais pratos cada item serve', texto.includes('para Sopa do dia, Risoto'))
// Os títulos de grupo aparecem em caixa alta por estilo, então a comparação ignora caixa.
conferir('os itens vêm agrupados por categoria', /hortifrúti/i.test(texto))

// Marcar como comprado tem que sobreviver à troca de agrupamento.
await pagina.getByRole('button', { name: /Cebola/ }).click()
await pagina.waitForTimeout(300)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('marcar um item atualiza a contagem', texto.includes('1 de 2 itens marcados'))

await pagina.getByRole('button', { name: 'Por fornecedor' }).click()
await pagina.waitForTimeout(300)
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('agrupar por fornecedor mantém as marcas', texto.includes('1 de 2 itens marcados'))
conferir('o agrupamento por fornecedor usa os fornecedores cadastrados', /feira/i.test(texto))

await navegador.close()
encerrar('Uma árvore, quatro leituras: a mesma receita virou ficha, custo, produção e compras.')
