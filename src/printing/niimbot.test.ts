import { describe, expect, it } from 'vitest'

import { limitar } from './niimbot'
import {
  etiquetaCabe,
  larguraUtilMm,
  PERFIL_PADRAO,
  type PerfilImpressora,
} from './printerProfile'

/**
 * O que dá para provar sobre a NIIMBOT sem ter a NIIMBOT.
 *
 * Conectar e sair tinta no papel é teste de bancada — não tenho a impressora.
 * O que estes testes protegem são as duas contas que, se erradas, mandam a
 * etiqueta para o papel torta ou queimada, e que não dependem de hardware
 * nenhum: a largura útil da cabeça e a faixa de densidade.
 */

function perfil(campos: Partial<PerfilImpressora> = {}): PerfilImpressora {
  return { ...PERFIL_PADRAO, conexao: 'niimbot', ...campos }
}

describe('larguraUtilMm', () => {
  it('converte os pontos da cabeça do B1 em milímetros', () => {
    // 384 pontos a 203 dpi. É o número que decide se a etiqueta cabe.
    expect(larguraUtilMm(perfil({ pontosCabeca: 384, dpi: 203 }))).toBe(48)
  })

  it('acompanha uma cabeça maior, como a do B1 Pro', () => {
    // 567 pontos a 300 dpi — mesma largura física, mais resolução. Se a conta
    // ignorasse o dpi, daria 71 mm e a etiqueta sairia com o dobro do tamanho.
    expect(larguraUtilMm(perfil({ pontosCabeca: 567, dpi: 300 }))).toBe(48)
  })

  it('não se aplica às impressoras que falam TSPL', () => {
    // A AIYIN aceita 110 mm e não informa a cabeça; inventar um limite aqui
    // recusaria uma etiqueta que ela imprime bem.
    expect(larguraUtilMm(perfil({ conexao: 'ble' }))).toBeNull()
    expect(larguraUtilMm(perfil({ conexao: 'usb' }))).toBeNull()
  })
})

describe('etiquetaCabe', () => {
  it('recusa a etiqueta de 60 mm numa cabeça de 48', () => {
    // O caso real: a etiqueta desenhada para a AIYIN não cabe no B1, e sairia
    // cortada pela metade sem nenhum aviso.
    expect(etiquetaCabe(perfil({ larguraMm: 60, pontosCabeca: 384 }))).toBe(false)
  })

  it('aceita a etiqueta que cabe', () => {
    expect(etiquetaCabe(perfil({ larguraMm: 40, pontosCabeca: 384 }))).toBe(true)
    expect(etiquetaCabe(perfil({ larguraMm: 50, pontosCabeca: 384 }))).toBe(false)
  })

  it('tolera meio milímetro na borda', () => {
    // Papel e cabeça nunca batem exatamente; recusar 48,0 numa cabeça de 48,04
    // seria implicância que trava a cozinha por nada.
    expect(etiquetaCabe(perfil({ larguraMm: 48, pontosCabeca: 384 }))).toBe(true)
    expect(etiquetaCabe(perfil({ larguraMm: 48.4, pontosCabeca: 384 }))).toBe(true)
    expect(etiquetaCabe(perfil({ larguraMm: 49, pontosCabeca: 384 }))).toBe(false)
  })

  it('não opina sobre quem não é NIIMBOT', () => {
    expect(etiquetaCabe(perfil({ conexao: 'ble', larguraMm: 60 }))).toBeNull()
  })
})

describe('limitar (densidade)', () => {
  it('recorta a densidade do TSPL para a faixa da NIIMBOT', () => {
    // O perfil da AIYIN guarda 8, numa escala que vai a 15. O B1 vai a 5:
    // mandar 8 seria recusa silenciosa, ou papel queimado.
    expect(limitar(8, 1, 5, 3)).toBe(5)
  })

  it('deixa passar o que já está na faixa', () => {
    expect(limitar(3, 1, 5, 3)).toBe(3)
  })

  it('sobe o que está abaixo do mínimo', () => {
    expect(limitar(0.4, 1, 5, 3)).toBe(1)
  })

  it('cai no padrão da impressora quando o valor não faz sentido', () => {
    // Zero, negativo ou NaN não são "densidade mínima" — são ausência de
    // configuração, e o padrão do fabricante é melhor palpite que o nosso.
    expect(limitar(0, 1, 5, 3)).toBe(3)
    expect(limitar(-2, 1, 5, 3)).toBe(3)
    expect(limitar(Number.NaN, 1, 5, 3)).toBe(3)
  })
})
