import { describe, expect, it } from 'vitest'
import { explodirFicha } from './arvore'
import { achatarParaInsumos, agrupar, custoTotal, listaEmTexto } from './compras'
import { cozinhaDeTeste } from './testes/cozinha'

function listaDoMenu(porcoesSopa = 8) {
  const { ctx, insumos } = cozinhaDeTeste()
  const sopa = explodirFicha(ctx, 'sopa', { porcoes: porcoesSopa })
  const salada = explodirFicha(ctx, 'salada')
  return achatarParaInsumos(
    [
      { rotulo: 'Sopa do dia', no: sopa.raiz },
      { rotulo: 'Salada', no: salada.raiz },
    ],
    insumos,
  )
}

describe('achatarParaInsumos', () => {
  it('junta numa linha só o insumo que aparece em vários pratos e níveis', () => {
    const linhas = listaDoMenu()
    expect(linhas.map((l) => l.nome)).toEqual(['Cebola', 'Azeite'])

    // Sopa para 8: 300 g dentro do fundo + 200 g direto = 500 g líquidos.
    // Salada: mais 50 g. Total 550 g líquidos × 1,2 de correção = 660 g brutos.
    const cebola = linhas.find((l) => l.nome === 'Cebola')!
    expect(cebola.quantidadeBruta).toBeCloseTo(660, 6)
  })

  it('entrega a quantidade também na unidade em que se compra', () => {
    const cebola = listaDoMenu().find((l) => l.nome === 'Cebola')!
    expect(cebola.unidadeCompra).toBe('kg')
    expect(cebola.quantidadeCompra).toBeCloseTo(0.66, 6)
  })

  it('diz em que pratos o insumo entra, para saber o que cai se cortar um item', () => {
    const cebola = listaDoMenu().find((l) => l.nome === 'Cebola')!
    expect(cebola.usadoEm).toEqual(['Sopa do dia', 'Salada'])

    const azeite = listaDoMenu().find((l) => l.nome === 'Azeite')!
    expect(azeite.usadoEm).toEqual(['Sopa do dia'])
  })

  it('fecha o custo da lista igual à soma dos pratos', () => {
    const linhas = listaDoMenu()
    // Sopa para 8 porções custa R$ 5,00 e a salada R$ 0,30.
    expect(custoTotal(linhas)).toBeCloseTo(5.3, 6)
  })

  it('cresce junto com o número de porções', () => {
    const paraQuatro = listaDoMenu(4).find((l) => l.nome === 'Cebola')!
    const paraOito = listaDoMenu(8).find((l) => l.nome === 'Cebola')!
    // A parte da salada (60 g brutos) não muda; só a da sopa dobra.
    expect(paraQuatro.quantidadeBruta).toBeCloseTo(360, 6)
    expect(paraOito.quantidadeBruta).toBeCloseTo(660, 6)
  })

  it('mantém o custo desconhecido quando um insumo não tem preço', () => {
    const { ctx, insumos } = cozinhaDeTeste()
    insumos.get('azeite')!.preco_compra = 0
    const sopa = explodirFicha(ctx, 'sopa')
    const linhas = achatarParaInsumos([{ rotulo: 'Sopa do dia', no: sopa.raiz }], insumos)

    expect(linhas.find((l) => l.nome === 'Azeite')!.custo).toBeNull()
    expect(custoTotal(linhas)).toBeNull()
  })
})

describe('agrupar', () => {
  it('separa por categoria para andar no mercado sem voltar no corredor', () => {
    const grupos = agrupar(listaDoMenu(), 'categoria')
    expect(grupos.map((g) => g.titulo)).toEqual(['Hortifrúti', 'Mercearia'])
    expect(grupos[0]!.linhas.map((l) => l.nome)).toEqual(['Cebola'])
  })

  it('separa por fornecedor para mandar cada pedido a quem entrega', () => {
    const grupos = agrupar(listaDoMenu(), 'fornecedor')
    expect(grupos.map((g) => g.titulo)).toEqual(['Distribuidora', 'Feira'])
  })
})

describe('listaEmTexto', () => {
  it('sai pronta para colar no WhatsApp do fornecedor', () => {
    const texto = listaEmTexto(agrupar(listaDoMenu(), 'categoria'), {
      titulo: 'Compras — 14/09',
      incluirCusto: false,
    })

    expect(texto).toContain('Compras — 14/09')
    expect(texto).toContain('*Hortifrúti*')
    // 0,66 kg é menos legível que 660 g — o formatador escolhe a escala que se lê melhor.
    expect(texto).toContain('- Cebola: 660 g')
    expect(texto).not.toContain('R$')
  })

  it('inclui o custo quando a lista é para sua própria conferência', () => {
    const texto = listaEmTexto(agrupar(listaDoMenu(), 'categoria'), {
      titulo: 'Compras',
      incluirCusto: true,
    })
    // O Intl separa R$ do número com espaço não separável; normalizar evita um
    // teste que quebra por um caractere invisível.
    expect(texto.replace(/\u00a0/g, ' ')).toContain('Total estimado: R$ 5,30')
  })
})
