import { describe, expect, it } from 'vitest'

import {
  ABERTURA_PADRAO,
  converterMensagemAntiga,
  FECHO_PADRAO,
  linkDoPedido,
  listarItens,
  montarPedido,
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

describe('montarPedido', () => {
  const itens = [{ nome: 'Farinha', quantidade: 10, unidade: 'kg' }]

  it('põe a lista ENTRE a abertura e o fecho', () => {
    // A ordem é a razão de existirem duas caixas em vez de uma: grudar a lista
    // no fim deixaria o "Obrigado!" antes dos produtos.
    expect(montarPedido(itens, { abertura: 'Olá!', fecho: 'Obrigado!' })).toBe(
      'Olá!\n\n• Farinha: 10 kg\n\nObrigado!',
    )
  })

  it('nunca deixa marcador nenhum na saída', () => {
    // O defeito que motivou a mudança: um marcador corrompido ia inteiro para
    // a conversa do fornecedor. Agora não há marcador para sobrar.
    const texto = montarPedido(itens, { abertura: 'Olá!', fecho: 'Obrigado!' })
    expect(texto).not.toContain('{{')
    expect(texto).not.toContain('}}')
  })

  it('sem abertura nem fecho, manda só a lista', () => {
    // Quem apagou os dois quis mandar só os produtos; linhas em branco no
    // começo da conversa parecem defeito.
    expect(montarPedido(itens, { abertura: '', fecho: '  ' })).toBe('• Farinha: 10 kg')
  })

  it('usa os textos padrão quando não recebe nenhum', () => {
    const texto = montarPedido(itens)
    expect(texto.startsWith(ABERTURA_PADRAO)).toBe(true)
    expect(texto.endsWith(FECHO_PADRAO)).toBe(true)
  })

  it('lista vazia não vira mensagem com buraco', () => {
    expect(montarPedido([], { abertura: 'Olá!', fecho: 'Obrigado!' })).toBe(
      'Olá!\n\nObrigado!',
    )
  })
})

describe('converterMensagemAntiga', () => {
  it('corta a mensagem antiga no {{itens}}', () => {
    expect(
      converterMensagemAntiga('Bom dia!\n\n{{itens}}\n\nAbraço!'),
    ).toEqual({ abertura: 'Bom dia!', fecho: 'Abraço!' })
  })

  it('tira o {{fornecedor}} junto, que era o outro marcador quebrável', () => {
    const { abertura } = converterMensagemAntiga('Olá, {{fornecedor}}! Segue:\n{{itens}}')
    expect(abertura).not.toContain('{{')
    expect(abertura).toBe('Olá! Segue:')
  })

  it('MENSAGEM CORROMPIDA CAI NO PADRÃO, em vez de ser herdada', () => {
    // O caso real: o ditado por voz trocou {{itens}} por {{hamach}}, e o pedido
    // passou a sair sem produto nenhum. Trazer esse texto para a versão nova
    // seria carregar o defeito junto.
    expect(
      converterMensagemAntiga('Olá, {{fornecedor}}! Gostaria de fazer um pedido:\n\n{{hamach}}\n\nObrigado!'),
    ).toEqual({ abertura: ABERTURA_PADRAO, fecho: FECHO_PADRAO })
  })

  it('sem mensagem salva, usa o padrão', () => {
    expect(converterMensagemAntiga(null)).toEqual({
      abertura: ABERTURA_PADRAO,
      fecho: FECHO_PADRAO,
    })
  })
})

describe('linkDoPedido', () => {
  const itens = [{ nome: 'Farinha de trigo', quantidade: 10, unidade: 'kg' }]

  it('codifica acento e quebra de linha', () => {
    const url = linkDoPedido('11987654321', montarPedido(itens, { abertura: 'Olá, Laticínios São João!', fecho: 'Obrigado!' }))
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
    const url = linkDoPedido('11987654321', montarPedido(itens))
    const analisada = new URL(url)
    expect(analisada.host).toBe('wa.me')
    // O texto decodificado precisa voltar exatamente como foi montado.
    expect(analisada.searchParams.get('text')).toContain('• Farinha de trigo: 10 kg')
  })
})
