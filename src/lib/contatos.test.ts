import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  contatosDisponivel,
  escolherDaAgenda,
  limparTelefones,
  preferirCelular,
} from './contatos'

/**
 * O seletor de contatos da agenda.
 *
 * A decisão que importa está em `preferirCelular`: um contato de fornecedor
 * quase sempre tem fixo e celular, e abrir o WhatsApp no fixo não dá erro —
 * dá uma conversa que nunca é respondida. Errar aqui é caro e silencioso.
 */

/** Agenda falsa no lugar da do sistema. */
function agendaFalsa(contatos: unknown[], propriedades = ['name', 'tel']) {
  const select = vi.fn().mockResolvedValue(contatos)
  vi.stubGlobal('navigator', {
    contacts: { select, getProperties: () => Promise.resolve(propriedades) },
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  })
  vi.stubGlobal('window', { ContactsManager: class {} })
  return select
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('limparTelefones', () => {
  it('descarta o que não chega a 10 dígitos', () => {
    // Ramal e número de recado entram na agenda como telefone e não servem
    // para WhatsApp.
    expect(limparTelefones(['1234', '(11) 98765-4321'])).toEqual(['(11) 98765-4321'])
  })

  it('trata o mesmo número em dois formatos como um só', () => {
    // É o caso comum: a pessoa salvou com DDI numa vez e sem na outra. Oferecer
    // os dois é pedir para escolher entre duas coisas iguais.
    expect(limparTelefones(['+55 11 98765-4321', '(11) 98765-4321'])).toEqual([
      '+55 11 98765-4321',
    ])
  })

  it('mantém a ordem e a forma como a pessoa salvou', () => {
    expect(limparTelefones([' (11) 3333-4444 ', '11987654321'])).toEqual([
      '(11) 3333-4444',
      '11987654321',
    ])
  })

  it('não come o DDD 55 de quem é de Santa Maria', () => {
    // A armadilha: 55 é DDI do Brasil E DDD do Rio Grande do Sul. Sem DDI o
    // número tem 11 dígitos e o 55 da frente é o DDD — tirá-lo deixaria um
    // número quebrado. Com DDI são 13, e aí sim o primeiro 55 sai. Os dois são
    // o mesmo contato e viram uma linha só.
    expect(limparTelefones(['(55) 99999-8888', '+55 55 99999-8888'])).toEqual([
      '(55) 99999-8888',
    ])
  })

  it('lista vazia não vira nada estranho', () => {
    expect(limparTelefones([])).toEqual([])
  })
})

describe('preferirCelular', () => {
  it('escolhe o celular quando o contato tem fixo e celular', () => {
    // O ponto do arquivo: o WhatsApp só existe no celular.
    expect(preferirCelular(['(11) 3333-4444', '(11) 98765-4321'])).toBe(
      '(11) 98765-4321',
    )
  })

  it('reconhece o celular escrito com DDI', () => {
    expect(preferirCelular(['+55 (11) 3333-4444', '+55 11 98765-4321'])).toBe(
      '+55 11 98765-4321',
    )
  })

  it('não escolhe entre dois celulares — quem escolhe é a pessoa', () => {
    // Chutar aqui abriria conversa com o número errado, e só se descobre no
    // meio do pedido.
    expect(preferirCelular(['(11) 98765-4321', '(11) 99999-0000'])).toBeNull()
  })

  it('com um número só, usa esse mesmo sendo fixo', () => {
    // Fixo pode ter WhatsApp Business. Não havendo alternativa, perguntar seria
    // uma pergunta de uma opção só.
    expect(preferirCelular(['(11) 3333-4444'])).toBe('(11) 3333-4444')
  })

  it('dois fixos e nenhum celular: pergunta', () => {
    expect(preferirCelular(['(11) 3333-4444', '(11) 5555-6666'])).toBeNull()
  })

  it('sem telefone nenhum, não inventa', () => {
    expect(preferirCelular([])).toBeNull()
  })

  it('não confunde fixo de 10 dígitos com celular', () => {
    // Sem o 9 na frente não é celular, por mais que o terceiro dígito seja 9.
    expect(preferirCelular(['(11) 9876-4321', '(11) 3333-4444'])).toBeNull()
  })
})

describe('escolherDaAgenda', () => {
  it('devolve nome, telefones e a sugestão pronta', async () => {
    agendaFalsa([
      { name: ['Laticínios São João'], tel: ['(11) 3333-4444', '(11) 98765-4321'] },
    ])

    expect(await escolherDaAgenda()).toEqual({
      nome: 'Laticínios São João',
      telefones: ['(11) 3333-4444', '(11) 98765-4321'],
      sugerido: '(11) 98765-4321',
    })
  })

  it('cancelar devolve null, e não erro', async () => {
    // Desistir é resposta legítima. A API sinaliza com lista vazia.
    agendaFalsa([])
    expect(await escolherDaAgenda()).toBeNull()
  })

  it('pede só as propriedades que o aparelho oferece', async () => {
    // Pedir uma propriedade ausente derruba a chamada inteira em vez de
    // devolver menos.
    const select = agendaFalsa([{ tel: ['(11) 98765-4321'] }], ['tel'])
    await escolherDaAgenda()
    expect(select).toHaveBeenCalledWith(['tel'], { multiple: false })
  })

  it('explica quando o aparelho não entrega telefone', async () => {
    agendaFalsa([], ['name'])
    await expect(escolherDaAgenda()).rejects.toThrow(/Digite o número/)
  })

  it('contato sem telefone não vira sugestão inventada', async () => {
    agendaFalsa([{ name: ['Hortifruti da Esquina'], tel: [] }])

    expect(await escolherDaAgenda()).toEqual({
      nome: 'Hortifruti da Esquina',
      telefones: [],
      sugerido: null,
    })
  })

  it('contato sem nome não quebra', async () => {
    agendaFalsa([{ tel: ['(11) 98765-4321'] }])
    expect((await escolherDaAgenda())?.nome).toBeNull()
  })

  it('num aparelho sem a API, avisa em vez de falhar sem explicação', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {})

    expect(contatosDisponivel()).toBe(false)
    await expect(escolherDaAgenda()).rejects.toThrow(/iPhone não abre a agenda/)
  })
})
