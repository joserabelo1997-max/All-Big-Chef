import { describe, expect, it } from 'vitest'
import { combina, normalizar } from './Campos'

describe('normalizar', () => {
  it('tira acento e caixa, que é como se busca com a mão suja', () => {
    expect(normalizar('Purê de Batata')).toBe('pure de batata')
    expect(normalizar('AÇAÍ')).toBe('acai')
    expect(normalizar('  Cebola  ')).toBe('cebola')
  })
})

describe('combina', () => {
  it('acha mesmo quando o acento não bate', () => {
    expect(combina('Purê de batata', 'pure')).toBe(true)
    expect(combina('Pure de batata', 'purê')).toBe(true)
  })

  it('acha no meio do nome', () => {
    expect(combina('Molho de tomate', 'tomate')).toBe(true)
  })

  it('busca vazia mostra tudo', () => {
    expect(combina('qualquer coisa', '   ')).toBe(true)
  })

  it('não acha o que não está lá', () => {
    expect(combina('Molho de tomate', 'cebola')).toBe(false)
  })
})
