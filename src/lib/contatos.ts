/**
 * Escolher o telefone do fornecedor na agenda do aparelho.
 *
 * ## Onde funciona, e por quê
 *
 * A Contact Picker API existe no Chrome, Edge e Samsung Internet do **Android**,
 * e no ChromeOS. Não existe no iPhone — o iOS não expõe a agenda a navegador
 * nenhum, nem Safari, nem Chrome, nem Bluefy — e nem no Chrome de computador.
 *
 * Por isso o botão que chama isto só aparece onde a API existe. Um botão que
 * explica por que não funciona é pior que botão nenhum: ocupa a tela toda vez
 * e não resolve nada.
 *
 * ## O que o app recebe
 *
 * Um acesso pontual e só de leitura. Não há como navegar na agenda, procurar
 * ninguém nem guardar cópia: quem escolhe é a pessoa, na tela do sistema, e o
 * app recebe apenas o contato tocado, naquele momento. Também não há permissão
 * persistente — a próxima vez pergunta de novo.
 *
 * ## Tipos
 *
 * Não existe pacote de tipos publicado para esta API (diferente de
 * `web-bluetooth` e `w3c-web-usb`, que estão no tsconfig). A interface fica
 * declarada aqui dentro, sem `declare global`, para não vazar para o resto do
 * projeto uma API que quase nenhum aparelho tem.
 */

/** O que o seletor do sistema devolve. Ambos os campos são opcionais. */
interface ContatoBruto {
  name?: string[]
  tel?: string[]
}

interface SeletorDeContatos {
  select(
    propriedades: string[],
    opcoes?: { multiple?: boolean },
  ): Promise<ContatoBruto[]>
  getProperties(): Promise<string[]>
}

export interface ContatoEscolhido {
  nome: string | null
  /** Telefones já limpos, sem repetição. Pode vir vazio. */
  telefones: string[]
  /**
   * O que preencher direto no campo, quando dá para saber sem chutar. `null`
   * quando há mais de um candidato e a tela precisa perguntar.
   */
  sugerido: string | null
}

export function contatosDisponivel(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof window !== 'undefined' &&
    'ContactsManager' in window
  )
}

/** Diz o que fazer, e não apenas que não deu. */
export function motivoContatosIndisponivel(): string | null {
  if (typeof navigator === 'undefined') return null
  if (contatosDisponivel()) return null

  const ua = navigator.userAgent
  const ehIOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)

  if (ehIOS) {
    return (
      'O iPhone não abre a agenda para o navegador — não há como buscar o ' +
      'contato daqui. Copie o número no aplicativo Contatos e cole no campo. ' +
      'Para pedir agora, o botão do WhatsApp funciona mesmo sem telefone ' +
      'cadastrado: ele abre a lista de contatos do próprio WhatsApp.'
    )
  }

  return (
    'Este navegador não abre a agenda. O seletor de contatos existe no Chrome ' +
    'do Android e no ChromeOS. Digite o número, ou cadastre pelo celular.'
  )
}

/**
 * Telefone reduzido à forma nacional em dígitos: sem pontuação e sem o DDI 55.
 *
 * É o que faz `+55 11 98765-4321` e `(11) 98765-4321` serem reconhecidos como o
 * mesmo número — e eles são, na agenda de qualquer cozinha. O DDI só sai quando
 * o que sobra tem cara de número brasileiro (12 ou 13 dígitos com ele, virando
 * 10 ou 11 sem), que é a regra inversa da de `telefoneParaWhatsapp`
 * (`whatsapp.ts`). Um número estrangeiro que por acaso comece com 55 tem outro
 * comprimento e passa intacto.
 */
function chave(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

/**
 * Limpa a lista que veio da agenda.
 *
 * Descarta o que não chega a 10 dígitos — mesma régua de `temTelefone`
 * (`domain/pendencias.ts`) e de `telefoneParaWhatsapp`, para o app não ter três
 * ideias diferentes do que é um telefone.
 *
 * E remove repetidos comparando só os dígitos: um contato costuma ter o mesmo
 * número salvo como `+55 11 98765-4321` e `(11) 98765-4321`, e oferecer os dois
 * como se fossem opções distintas é pedir para a pessoa escolher entre duas
 * coisas iguais. Fica a primeira forma, que é como a pessoa salvou.
 */
export function limparTelefones(tels: readonly string[]): string[] {
  const vistos = new Set<string>()
  const limpos: string[] = []

  for (const bruto of tels) {
    const telefone = bruto.trim()
    const nacional = chave(telefone)
    if (nacional.length < 10 || vistos.has(nacional)) continue
    vistos.add(nacional)
    limpos.push(telefone)
  }

  return limpos
}

/**
 * O número que dá para preencher sem perguntar.
 *
 * Contato de fornecedor quase sempre tem fixo e celular, e **o WhatsApp só
 * funciona no celular**. Celular brasileiro tem 11 dígitos com DDD e o 9 na
 * frente do número; com DDI, 13. Sobrando um só candidato, é ele. Sobrando
 * mais de um, devolve `null` e a tela pergunta — chutar aqui abriria conversa
 * com o número errado, e a pessoa só descobriria no meio do pedido.
 */
export function preferirCelular(tels: readonly string[]): string | null {
  const celulares = tels.filter((t) => {
    const nacional = chave(t)
    return nacional.length === 11 && nacional[2] === '9'
  })

  if (celulares.length === 1) return celulares[0] ?? null
  if (celulares.length === 0 && tels.length === 1) return tels[0] ?? null
  return null
}

function seletor(): SeletorDeContatos | null {
  if (!contatosDisponivel()) return null
  return (navigator as unknown as { contacts: SeletorDeContatos }).contacts
}

/**
 * Abre a agenda do aparelho e devolve o contato escolhido.
 *
 * `null` quando a pessoa cancela — cancelar é uma resposta legítima, não um
 * erro, e a API sinaliza isso devolvendo lista vazia.
 *
 * Precisa ser chamada de dentro de um toque: o navegador exige gesto do
 * usuário e recusa a chamada feita de outro lugar.
 *
 * `getProperties()` antes do `select`: nem toda versão do Android oferece
 * `tel`, e pedir uma propriedade que o aparelho não tem derruba a chamada
 * inteira em vez de devolver menos. Pedimos só o que ele disser que tem.
 */
export async function escolherDaAgenda(): Promise<ContatoEscolhido | null> {
  const agenda = seletor()
  if (!agenda) throw new Error(motivoContatosIndisponivel() ?? 'Agenda indisponível.')

  const disponiveis = await agenda.getProperties()
  const pedidas = ['name', 'tel'].filter((p) => disponiveis.includes(p))
  if (!pedidas.includes('tel')) {
    throw new Error(
      'Este aparelho não deixa o navegador ler o telefone dos contatos. ' +
        'Digite o número.',
    )
  }

  const escolhidos = await agenda.select(pedidas, { multiple: false })
  const contato = escolhidos[0]
  if (!contato) return null

  const telefones = limparTelefones(contato.tel ?? [])

  return {
    nome: contato.name?.find((n) => n.trim())?.trim() ?? null,
    telefones,
    sugerido: preferirCelular(telefones),
  }
}
