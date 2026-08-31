import { describe, expect, it } from 'vitest'

import { ESTADO_INICIAL, processarTecla, type EstadoLeitura } from './leitorHid'

/**
 * Simula uma sequência de teclas com o intervalo informado entre elas.
 * Devolve o código reconhecido, ou null se nada fechou.
 */
function digitar(texto: string, intervaloMs: number, comEnter = true): string | null {
  let estado: EstadoLeitura = ESTADO_INICIAL
  let relogio = 1000
  let codigo: string | null = null

  for (const tecla of [...texto, ...(comEnter ? ['Enter'] : [])]) {
    relogio += intervaloMs
    const r = processarTecla(estado, tecla, relogio)
    estado = r.estado
    if (r.codigo) codigo = r.codigo
  }
  return codigo
}

const URL_ETIQUETA =
  'https://joserabelo1997-max.github.io/All-Big-Chef/#/l/6f1c2a30-9b44-4c7e-8a12-77d0e5b31c99'

describe('leitura em rajada (o leitor)', () => {
  it('reconhece uma rajada rápida terminada em Enter', () => {
    // Leitores emitem em torno de 5-15 ms por caractere.
    expect(digitar('A7K293', 8)).toBe('A7K293')
  })

  it('reconhece a URL inteira que sai do nosso QR', () => {
    expect(digitar(URL_ETIQUETA, 5)).toBe(URL_ETIQUETA)
  })

  it('reconhece código de barras numérico comum', () => {
    expect(digitar('7891234567890', 10)).toBe('7891234567890')
  })
})

describe('digitação humana (o que NÃO pode virar leitura)', () => {
  it('ignora digitação em velocidade humana', () => {
    // Mesmo alguém rápido raramente sustenta menos de 60 ms por tecla.
    expect(digitar('A7K293', 120)).toBeNull()
  })

  it('ignora digitação rápida SEM Enter', () => {
    expect(digitar('A7K293', 8, false)).toBeNull()
  })

  it('ignora Enter isolado', () => {
    const r = processarTecla(ESTADO_INICIAL, 'Enter', 1000)
    expect(r.codigo).toBeUndefined()
  })

  it('ignora rajada curta demais, que é atalho e não leitura', () => {
    expect(digitar('ab', 8)).toBeNull()
  })

  it('não deixa a digitação lenta se acumular até parecer uma rajada', () => {
    // O risco real: alguém digita devagar 20 caracteres e aperta Enter. Se o
    // buffer somasse tudo, viraria uma "leitura" fantasma.
    expect(digitar('umtextolongodigitadodevagar', 200)).toBeNull()
  })

  it('uma pausa no meio reinicia a contagem', () => {
    let estado: EstadoLeitura = ESTADO_INICIAL
    let relogio = 1000

    // Três teclas rápidas...
    for (const t of 'ABC') {
      relogio += 8
      estado = processarTecla(estado, t, relogio).estado
    }
    // ...uma pausa longa...
    relogio += 900
    estado = processarTecla(estado, 'D', relogio).estado
    expect(estado.buffer).toBe('D')

    // ...e mais três rápidas: o total não pode incluir o "ABC" anterior.
    for (const t of 'EFG') {
      relogio += 8
      estado = processarTecla(estado, t, relogio).estado
    }
    relogio += 8
    expect(processarTecla(estado, 'Enter', relogio).codigo).toBe('DEFG')
  })
})

describe('teclas que não são caracteres', () => {
  it('ignora modificadores sem quebrar a rajada em andamento', () => {
    // O leitor manda Shift junto com maiúsculas; tratar Shift como caractere
    // encheria o buffer de lixo, e tratá-lo como pausa cortaria a leitura ao
    // meio bem no primeiro código com letra maiúscula.
    let estado: EstadoLeitura = ESTADO_INICIAL
    let relogio = 1000

    for (const tecla of ['A', 'Shift', '7', 'K', 'Control', '2', '9', '3']) {
      relogio += 8
      estado = processarTecla(estado, tecla, relogio).estado
    }
    relogio += 8
    expect(processarTecla(estado, 'Enter', relogio).codigo).toBe('A7K293')
  })
})

describe('estado', () => {
  it('zera após uma leitura, para não vazar para a próxima', () => {
    let estado: EstadoLeitura = ESTADO_INICIAL
    let relogio = 1000
    for (const t of ['A', 'B', 'C', 'D']) {
      relogio += 8
      estado = processarTecla(estado, t, relogio).estado
    }
    relogio += 8
    const r = processarTecla(estado, 'Enter', relogio)
    expect(r.codigo).toBe('ABCD')
    expect(r.estado).toEqual(ESTADO_INICIAL)
  })

  it('duas leituras seguidas saem separadas', () => {
    expect(digitar('AAAA', 8)).toBe('AAAA')
    expect(digitar('BBBB', 8)).toBe('BBBB')
  })

  it('aceita ajustar os limiares', () => {
    // Um leitor mais lento, ou uma cozinha que queira ser mais permissiva.
    let estado: EstadoLeitura = ESTADO_INICIAL
    let relogio = 1000
    const opcoes = { intervaloMaximoMs: 200, tamanhoMinimo: 2 }
    for (const t of ['A', 'B']) {
      relogio += 150
      estado = processarTecla(estado, t, relogio, opcoes).estado
    }
    relogio += 150
    expect(processarTecla(estado, 'Enter', relogio, opcoes).codigo).toBe('AB')
  })
})
