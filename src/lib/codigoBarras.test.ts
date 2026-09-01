import { describe, expect, it } from 'vitest'

import {
  digitoVerificadorValido,
  formatarCodigoBarras,
  normalizarCodigoBarras,
  pareceCodigoDeBarras,
} from './codigoBarras'
import { novoCodigoCurto, normalizarCodigo } from './ids'

/**
 * O que este arquivo protege é a distinção entre o código de barras do
 * fabricante e o código curto que o próprio app imprime. Confundir os dois faz
 * a pessoa dar entrada no produto errado — e num estoque isso só aparece na
 * contagem do mês seguinte, quando já não dá para saber o que aconteceu.
 */

describe('normalizarCodigoBarras', () => {
  it('tira espaço e pontuação que o leitor às vezes emite', () => {
    expect(normalizarCodigoBarras(' 789 8357 410015 ')).toBe('7898357410015')
  })

  it('NÃO troca O por zero — isso é regra do código curto, e aqui destruiria o código', () => {
    // `normalizarCodigo` faz essa troca de propósito, para corrigir digitação
    // do código impresso. Num EAN, trocar um caractere aponta para outro
    // produto: é a razão de existirem duas funções.
    expect(normalizarCodigo('OI7')).toBe('017')
    expect(normalizarCodigoBarras('OI7')).toBe('OI7')
  })
})

describe('digitoVerificadorValido', () => {
  it('aceita um EAN-13 real', () => {
    expect(digitoVerificadorValido('7898357410015')).toBe(true)
  })

  it('aceita EAN-8 e UPC-A', () => {
    expect(digitoVerificadorValido('96385074')).toBe(true)
    expect(digitoVerificadorValido('036000291452')).toBe(true)
  })

  it('recusa um dígito trocado', () => {
    // O ponto do verificador: um erro de leitura vira "não reconhecido" em vez
    // de virar outro produto.
    expect(digitoVerificadorValido('7898357410016')).toBe(false)
  })

  it('recusa comprimento que não é de código de barras', () => {
    expect(digitoVerificadorValido('12345')).toBe(false)
  })

  it('recusa o que tem letra', () => {
    expect(digitoVerificadorValido('789835741001A')).toBe(false)
  })
})

describe('pareceCodigoDeBarras', () => {
  it('reconhece o EAN da embalagem', () => {
    expect(pareceCodigoDeBarras('7898357410015')).toBe(true)
  })

  it('não confunde o código curto do app com um EAN-8', () => {
    // A colisão que motivou usar o dígito verificador em vez do comprimento:
    // o leitor global aceita códigos curtos de 4 a 10 caracteres, e EAN-8 cai
    // no meio dessa faixa.
    expect(pareceCodigoDeBarras('A1B2C3')).toBe(false)
    expect(pareceCodigoDeBarras('123456')).toBe(false)
  })

  it('oito dígitos que não fecham a conta não passam por código de barras', () => {
    expect(pareceCodigoDeBarras('96385075')).toBe(false)
  })

  it('aceita código alfanumérico longo, que o app nunca gera', () => {
    expect(pareceCodigoDeBarras('LOTE2026ABCDE')).toBe(true)
  })

  it('nenhum código curto gerado pelo app é confundido com código de barras', () => {
    // Sabotagem preventiva: se alguém trocar a regra por "tem 6 a 13
    // caracteres", este teste cai.
    for (let i = 0; i < 500; i++) {
      expect(pareceCodigoDeBarras(novoCodigoCurto())).toBe(false)
    }
  })
})

describe('formatarCodigoBarras', () => {
  it('agrupa o EAN-13 como vem impresso na embalagem', () => {
    expect(formatarCodigoBarras('7898357410015')).toBe('7 898357 410015')
  })

  it('deixa em paz o que não tem agrupamento conhecido', () => {
    expect(formatarCodigoBarras('96385074')).toBe('96385074')
  })
})
