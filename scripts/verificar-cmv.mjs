/**
 * Confere as calculadoras da aba de CMV contra contas feitas no papel.
 *
 * O teste unitário já garante as fórmulas. Este garante que o número certo chega
 * na tela, com o rótulo certo e a leitura certa ao lado — que é a parte que o
 * usuário realmente vê.
 *
 *   node scripts/verificar-cmv.mjs [url]
 */
import { abrirApp, criarConferidor, semEspacoDuro } from './apoio.mjs'

const base = process.argv[2] ?? 'http://localhost:4173'
const { falhas, conferir, encerrar } = criarConferidor()
const { navegador, pagina } = await abrirApp(base, { falhas })

await pagina.goto(`${base}/cmv`, { waitUntil: 'networkidle' })

async function abrir(titulo) {
  await pagina.getByRole('button', { name: new RegExp(titulo) }).first().click()
}

// --- CMV real ---------------------------------------------------------------
// Abriu com R$ 8.000, comprou R$ 22.000, fechou com R$ 6.000, faturou R$ 80.000.
// CMV = 8000 + 22000 − 6000 = 24000, que sobre 80000 dá 30%.
await abrir('CMV real do período')
await pagina.getByLabel('Estoque inicial').fill('8000')
await pagina.getByLabel('Compras', { exact: true }).fill('22000')
await pagina.getByLabel('Estoque final').fill('6000')
await pagina.getByLabel('Faturamento', { exact: true }).fill('80000')

let texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('CMV real em reais dá R$ 24.000,00', texto.includes('R$ 24.000,00'))
conferir('CMV real em percentual dá 30%', /\b30%/.test(texto))
conferir('a leitura diz se está dentro da faixa da casa', texto.includes('faixa saudável'))

// --- Desvio -----------------------------------------------------------------
// Teórico digitado a 26%, real vindo de cima a 30%: 4 pontos de diferença.
await abrir('Desvio: teórico × real')
await pagina.getByLabel('CMV teórico').fill('26')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('o desvio soma 4 pontos percentuais', texto.includes('+4 p.p.'))
conferir('4 pontos ainda caem em atenção, não em crítico', texto.includes('começando a pesar'))

await pagina.getByLabel('CMV teórico').fill('20')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('10 pontos viram alerta crítico', texto.includes('+10 p.p.') && texto.includes('porção fora do padrão'))
conferir('o CMV real entrou sozinho, vindo do verbete de cima', texto.includes('Vindo do período preenchido'))

// --- Preço de venda ---------------------------------------------------------
// Custo R$ 12 com alvo de 30% → R$ 40,00; arredondado para 40 o CMV fica em 30%.
await abrir('Preço de venda pelo CMV alvo')
await pagina.getByLabel('Custo da porção').first().fill('12')
await pagina.getByLabel('CMV alvo').fill('30')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('preço sugerido dá R$ 40,00', texto.includes('R$ 40,00'))
conferir('mostra o preço arredondado terminando em 90', texto.includes('R$ 39,90'))

// --- Markup -----------------------------------------------------------------
// 25% + 12% + 15% = 52% → markup 1 ÷ 0,48 = 2,083.
await abrir('Markup')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('markup padrão dá 2,083×', texto.includes('2,083×'))
conferir('explica quanto sobra para a comida', texto.includes('Sobram 48%'))

// 25% + 12% + 70% passa de 100%: não sobra espaço nenhum para a comida.
await pagina.getByLabel('Lucro').fill('70')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('percentuais somando mais de 100% viram "impossível"', texto.includes('impossível'))

// --- Fator de correção e índice de cocção -----------------------------------
await abrir('Fator de correção')
await pagina.getByLabel('Peso bruto').fill('1000')
await pagina.getByLabel('Peso limpo').fill('850')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('fator de correção de 1000/850 dá 1,176', texto.includes('1,176'))
conferir('mostra a perda de 15%', texto.includes('15%'))

await abrir('Índice de cocção')
await pagina.getByLabel('Peso limpo cru').fill('300')
await pagina.getByLabel('Peso depois de cozido').fill('750')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('índice de cocção do arroz dá 2,5', texto.includes('2,5'))
conferir('reconhece que o alimento ganhou peso', texto.includes('Ganhou'))

await navegador.close()
encerrar('As calculadoras da aba de CMV batem com as contas do papel.')
