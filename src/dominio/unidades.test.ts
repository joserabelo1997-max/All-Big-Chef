import { describe, expect, it } from 'vitest'
import {
  ErroConversao,
  converter,
  formatarMedida,
  humanizar,
  mesmaDimensao,
  tentarConverter,
} from './unidades'

describe('converter', () => {
  it('converte dentro da massa e do volume', () => {
    expect(converter(1, 'kg', 'g')).toBe(1000)
    expect(converter(250, 'g', 'kg')).toBe(0.25)
    expect(converter(1.5, 'L', 'ml')).toBe(1500)
    expect(converter(500, 'ml', 'L')).toBe(0.5)
  })

  it('devolve a mesma quantidade quando a unidade não muda', () => {
    expect(converter(7, 'un', 'un')).toBe(7)
  })

  it('recusa atravessar grandezas, em vez de chutar uma densidade', () => {
    expect(() => converter(1, 'L', 'kg')).toThrow(ErroConversao)
    expect(() => converter(1, 'un', 'g')).toThrow(ErroConversao)
  })

  it('tentarConverter entrega o motivo em vez de explodir', () => {
    const r = tentarConverter(1, 'L', 'g')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('densidade')
  })
})

describe('mesmaDimensao', () => {
  it('agrupa por grandeza', () => {
    expect(mesmaDimensao('g', 'kg')).toBe(true)
    expect(mesmaDimensao('ml', 'L')).toBe(true)
    expect(mesmaDimensao('g', 'ml')).toBe(false)
  })
})

describe('humanizar', () => {
  it('sobe de escala quando o número fica grande', () => {
    expect(humanizar(2400, 'g')).toEqual({ quantidade: 2.4, unidade: 'kg' })
    expect(humanizar(1500, 'ml')).toEqual({ quantidade: 1.5, unidade: 'L' })
  })

  it('desce de escala quando o número fica pequeno demais para ler', () => {
    expect(humanizar(0.15, 'kg')).toEqual({ quantidade: 150, unidade: 'g' })
  })

  it('deixa quieto o que já está legível', () => {
    expect(humanizar(300, 'g')).toEqual({ quantidade: 300, unidade: 'g' })
  })

  it('formata em português', () => {
    expect(formatarMedida(2400, 'g')).toBe('2,4 kg')
    expect(formatarMedida(3, 'un')).toBe('3 un')
  })
})
