import { describe, expect, it } from 'vitest'

import { extrairIdDaEtiqueta, identificarCodigo } from './scanner'

const ID = '6046bb0c-fb8c-4365-bf31-98493f0a253e'
const APP = 'https://joserabelo1997-max.github.io/All-Big-Chef/'

describe('extrairIdDaEtiqueta', () => {
  it('extrai o id da URL impressa no QR', () => {
    expect(extrairIdDaEtiqueta(`${APP}#/l/${ID}`)).toBe(ID)
  })

  it('aceita um uuid solto', () => {
    expect(extrairIdDaEtiqueta(ID)).toBe(ID)
  })

  it('normaliza a caixa do uuid', () => {
    expect(extrairIdDaEtiqueta(ID.toUpperCase())).toBe(ID)
  })

  it('devolve null para um código que não é nosso', () => {
    // Um EAN de embalagem, por exemplo.
    expect(extrairIdDaEtiqueta('7891234567890')).toBeNull()
  })
})

describe('identificarCodigo', () => {
  it('reconhece a etiqueta de validade', () => {
    expect(identificarCodigo(`${APP}#/l/${ID}`)).toEqual({ tipo: 'etiqueta', id: ID })
  })

  it('reconhece a etiqueta de inventário', () => {
    // A separação está no CAMINHO: é ela que impede um QR de inventário de
    // cair na tela de validade e sugerir uma data que ele não tem.
    expect(identificarCodigo(`${APP}#/i/${ID}`)).toEqual({ tipo: 'inventario', id: ID })
  })

  it('trata uuid solto como etiqueta de validade', () => {
    // É o que as etiquetas já impressas trazem; elas precisam continuar lendo.
    expect(identificarCodigo(ID)).toEqual({ tipo: 'etiqueta', id: ID })
  })

  it('não confunde um "i" que faz parte de outra palavra', () => {
    expect(identificarCodigo(`https://exemplo.com/api/${ID}`)?.tipo).toBe('etiqueta')
  })

  it('devolve null quando não há uuid nenhum', () => {
    expect(identificarCodigo('7891234567890')).toBeNull()
    expect(identificarCodigo('')).toBeNull()
  })

  it('funciona em servidor local, onde o caminho base é outro', () => {
    expect(identificarCodigo(`http://localhost:5173/All-Big-Chef/#/i/${ID}`)).toEqual({
      tipo: 'inventario',
      id: ID,
    })
  })
})
