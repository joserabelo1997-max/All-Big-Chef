import { describe, expect, it } from 'vitest'

import {
  linkDoPedido,
  listarItens,
  MENSAGEM_PADRAO,
  montarMensagem,
  telefoneParaWhatsapp,
} from './whatsapp'

describe('telefoneParaWhatsapp', () => {
  it('tira a formatação que a pessoa digitou', () => {
    expect(telefoneParaWhatsapp('(11) 98765-4321')).toBe('5511987654321')
  })

  it('acrescenta o DDI 55 a um celular com DDD', () => {
    expect(telefoneParaWhatsapp('11987654321')).toBe('5511987654321')
  })

  it('acrescenta o DDI a um fixo com DDD', () => {
    expect(telefoneParaWhatsapp('1133334444')).toBe('551133334444')
  })

  it('não duplica o DDI de um número que já o tem', () => {
    expect(telefoneParaWhatsapp('5511987654321')).toBe('5511987654321')
  })

  it('deixa intacto um número internacional', () => {
    // Chutar 55 em cima de um número estrangeiro abriria a conversa errada.
    expect(telefoneParaWhatsapp('+351 912 345 678')).toBe('351912345678')
  })

  it('recusa número curto demais para ser telefone', () => {
    expect(telefoneParaWhatsapp('98765')).toBeNull()
    expect(telefoneParaWhatsapp('')).toBeNull()
  })
})

describe('listarItens', () => {
  it('põe um item por linha', () => {
    const texto = listarItens([
      { nome: 'Farinha', quantidade: 10, unidade: 'kg' },
      { nome: 'Ovos', quantidade: 30, unidade: 'un' },
    ])
    expect(texto).toBe('• Farinha: 10 kg\n• Ovos: 30 un')
  })

  it('não escreve casa decimal em número inteiro', () => {
    expect(listarItens([{ nome: 'Ovos', quantidade: 30, unidade: 'un' }])).toContain('30 un')
  })

  it('mantém a fração quando ela existe', () => {
    expect(listarItens([{ nome: 'Queijo', quantidade: 2.5, unidade: 'kg' }])).toContain(
      '2,5 kg',
    )
  })
})

describe('montarMensagem', () => {
  const itens = [{ nome: 'Farinha', quantidade: 10, unidade: 'kg' }]

  it('substitui fornecedor e itens no modelo', () => {
    const texto = montarMensagem('Laticínios São João', itens)
    expect(texto).toContain('Laticínios São João')
    expect(texto).toContain('• Farinha: 10 kg')
  })

  it('aceita um modelo próprio do restaurante', () => {
    expect(montarMensagem('Sul', itens, 'Oi {{fornecedor}}: {{itens}}')).toBe(
      'Oi Sul: • Farinha: 10 kg',
    )
  })

  it('substitui todas as ocorrências, não só a primeira', () => {
    expect(montarMensagem('Sul', itens, '{{fornecedor}} {{fornecedor}}')).toBe('Sul Sul')
  })
})

describe('linkDoPedido', () => {
  const itens = [{ nome: 'Farinha de trigo', quantidade: 10, unidade: 'kg' }]

  it('codifica acento e quebra de linha', () => {
    const url = linkDoPedido('11987654321', montarMensagem('Laticínios São João', itens))
    expect(url).toContain('https://wa.me/5511987654321?text=')
    // "í" e "ã" precisam sair percent-encoded, e a quebra de linha como %0A.
    expect(url).toContain('%C3%AD')
    expect(url).toContain('%C3%A3')
    expect(url).toContain('%0A')
  })

  it('codifica espaço como %20, e nunca como +', () => {
    // O WhatsApp mostraria os "+" literalmente dentro da mensagem.
    const url = linkDoPedido('11987654321', 'Farinha de trigo')
    expect(url).toContain('%20')
    expect(url).not.toContain('+')
  })

  it('abre a escolha de contato quando o fornecedor não tem telefone', () => {
    // Melhor que um botão desabilitado por cadastro incompleto.
    const url = linkDoPedido(null, 'Oi')
    expect(url).toBe('https://wa.me/?text=Oi')
  })

  it('descarta telefone inválido em vez de montar um link quebrado', () => {
    expect(linkDoPedido('123', 'Oi')).toBe('https://wa.me/?text=Oi')
  })

  it('devolve uma URL que o navegador aceita', () => {
    const url = linkDoPedido('11987654321', montarMensagem('Sul', itens, MENSAGEM_PADRAO))
    const analisada = new URL(url)
    expect(analisada.host).toBe('wa.me')
    // O texto decodificado precisa voltar exatamente como foi montado.
    expect(analisada.searchParams.get('text')).toContain('• Farinha de trigo: 10 kg')
  })
})
