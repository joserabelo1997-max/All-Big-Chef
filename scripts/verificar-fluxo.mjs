/**
 * Percorre o app como um cozinheiro percorreria, e confere as contas na saída.
 *
 * Cadastra dois insumos, escreve um preparo, escreve um prato que usa esse
 * preparo, e verifica que o custo que aparece na tela é o mesmo que se calcula
 * no papel. O teste unitário garante a conta; este garante que a conta chegou
 * até a tela.
 *
 *   node scripts/verificar-fluxo.mjs [url]
 */
import { mkdir } from 'node:fs/promises'
import {
  abrirApp,
  abrirFicha,
  criarConferidor,
  montarCozinhaDeExemplo,
  semEspacoDuro,
} from './apoio.mjs'

const base = process.argv[2] ?? 'http://localhost:4173'
const { falhas, conferir, encerrar } = criarConferidor()
const { navegador, pagina } = await abrirApp(base, { falhas })

await montarCozinhaDeExemplo(pagina, base)

// --- insumos ----------------------------------------------------------------
await pagina.goto(`${base}/insumos`, { waitUntil: 'networkidle' })
let texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('a tela de insumos mostra o preço por unidade de uso', texto.includes('R$ 0,04'))
conferir('a tela de insumos mostra a perda do fator de correção', texto.includes('perde 17%'))

// --- preparo ----------------------------------------------------------------
await abrirFicha(pagina, base, 'Preparos', 'Fundo de legumes')
texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('o preparo soma R$ 3,80 na receita inteira', texto.includes('R$ 3,80'))

// --- prato ------------------------------------------------------------------
await abrirFicha(pagina, base, 'Pratos', 'Sopa do dia')
await mkdir('capturas', { recursive: true })
await pagina.screenshot({ path: 'capturas/editor-prato.png', fullPage: true })

texto = semEspacoDuro(await pagina.locator('body').innerText())
conferir('o prato soma R$ 2,50 no total', texto.includes('R$ 2,50'))
conferir('o prato mostra R$ 0,63 por porção', texto.includes('R$ 0,63'))
conferir('o preparo aninhado é cobrado por metade (R$ 1,90)', texto.includes('R$ 1,90'))
conferir('o preço sugerido sai do CMV alvo da casa', texto.includes('Para um CMV'))
conferir('nenhum aviso de custo aberto sobrou', !texto.includes('custo aberto'))

// --- o laço é barrado antes de acontecer ------------------------------------
// A sopa já usa o fundo, então o fundo não pode oferecer a sopa como componente.
await abrirFicha(pagina, base, 'Preparos', 'Fundo de legumes')
await pagina.getByRole('button', { name: 'Adicionar' }).click()
await pagina.getByRole('dialog', { name: 'Adicionar à receita' }).waitFor()
const ofereceSopa = await pagina.getByRole('dialog').getByText('Sopa do dia').count()
conferir('o prato que já usa este preparo não é oferecido de volta', ofereceSopa === 0)

await navegador.close()
encerrar('O fluxo inteiro fecha, e as contas na tela batem com as do papel.')
