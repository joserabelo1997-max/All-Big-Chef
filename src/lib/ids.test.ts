import { describe, expect, it } from 'vitest'

import { normalizarCodigo, novoCodigoCurto, novoId } from './ids'

describe('novoId', () => {
  it('gera uuid v4 válido', () => {
    expect(novoId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('não repete em volume', () => {
    const ids = new Set(Array.from({ length: 5000 }, novoId))
    expect(ids.size).toBe(5000)
  })
})

describe('novoCodigoCurto', () => {
  it('tem o tamanho pedido', () => {
    expect(novoCodigoCurto()).toHaveLength(6)
    expect(novoCodigoCurto(8)).toHaveLength(8)
  })

  it('nunca usa caracteres visualmente ambíguos', () => {
    // I e L confundem com 1, O com 0. Um código impresso numa etiqueta gordurosa
    // que alguém precisa ditar em voz alta não pode ter essa armadilha.
    for (let i = 0; i < 2000; i++) {
      expect(novoCodigoCurto()).not.toMatch(/[ILOU]/)
    }
  })

  it('usa só o alfabeto Crockford', () => {
    for (let i = 0; i < 500; i++) {
      expect(novoCodigoCurto()).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
    }
  })

  it('distribui bem o bastante para não colidir na prática', () => {
    // Volume equivalente a ~10 anos de uma cozinha imprimindo 200/dia.
    const codigos = new Set(Array.from({ length: 20000 }, () => novoCodigoCurto()))
    expect(codigos.size).toBeGreaterThan(19990)
  })
})

describe('normalizarCodigo', () => {
  it('corrige as confusões inequívocas', () => {
    expect(normalizarCodigo('a7ko93')).toBe('A7K093')
    expect(normalizarCodigo('AIK293')).toBe('A1K293')
    expect(normalizarCodigo('ALK293')).toBe('A1K293')
  })

  it('ignora espaços, hífens e maiúsculas', () => {
    expect(normalizarCodigo('  a7k-293 ')).toBe('A7K293')
  })

  it('NÃO adivinha o "U"', () => {
    // Mapear U para V seria palpite: se errar, a busca acha uma etiqueta
    // diferente e a pessoa dá baixa no produto errado. Falhar é mais seguro.
    expect(normalizarCodigo('A7KU93')).toBe('A7KU93')
  })

  it('é idempotente', () => {
    const uma = normalizarCodigo('a7ko93')
    expect(normalizarCodigo(uma)).toBe(uma)
  })

  it('preserva um código já válido', () => {
    expect(normalizarCodigo('A7K293')).toBe('A7K293')
  })
})
