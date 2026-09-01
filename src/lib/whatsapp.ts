/**
 * Montagem do link de pedido pelo WhatsApp.
 *
 * O app só ABRE a conversa com a mensagem pronta — não envia e não registra o
 * pedido, como você pediu. Quem confirma o pedido é a conversa com o
 * fornecedor, e fingir que o sistema sabe o que foi combinado ali criaria um
 * histórico que não corresponde à realidade.
 */

/**
 * ## Por que não há mais marcador nenhum
 *
 * A mensagem já foi um modelo único com `{{fornecedor}}` e `{{itens}}` dentro,
 * e um botão que inseria o marcador no lugar do cursor. O marcador continuava
 * sendo texto comum, então dava para digitar por cima dele, apagar metade, ou
 * o ditado por voz trocar a palavra — foi o que aconteceu numa cozinha de
 * verdade: o `{{itens}}` virou `{{hamach}}`, e o pedido passou a sair sem
 * produto nenhum, sem nada avisar.
 *
 * Agora a mensagem é feita de duas partes livres, ABERTURA e FECHO, e a lista
 * entra sempre entre elas. Não existe marcador para corromper: o pior que pode
 * acontecer é o texto ficar esquisito, nunca a lista sumir.
 */

/** O que vem antes da lista, por padrão. */
export const ABERTURA_PADRAO = 'Olá! Gostaria de fazer um pedido:'

/** O que vem depois da lista, por padrão. */
export const FECHO_PADRAO = 'Obrigado!'

export interface ItemDoPedido {
  nome: string
  quantidade: number
  unidade: string
}

export interface TextosDoPedido {
  abertura: string
  fecho: string
}

/**
 * Telefone em dígitos, com DDI, que é o formato exigido pelo `wa.me`.
 *
 * O DDI 55 é acrescentado só quando o número tem cara de brasileiro sem ele
 * (10 ou 11 dígitos, DDD incluso). Um número já internacional passa intacto —
 * chutar o DDI em cima de um número estrangeiro abriria a conversa errada.
 */
export function telefoneParaWhatsapp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return null
  if (digitos.length <= 11) return `55${digitos}`
  return digitos
}

/** Lista dos itens, uma linha por item, como se escreve para o fornecedor. */
export function listarItens(itens: ItemDoPedido[]): string {
  return itens
    .map((i) => `• ${i.nome}: ${formatarQuantidade(i.quantidade)} ${i.unidade}`)
    .join('\n')
}

function formatarQuantidade(valor: number): string {
  return Number.isInteger(valor)
    ? String(valor)
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * A mensagem inteira: abertura, lista, fecho.
 *
 * Partes vazias são descartadas em vez de virarem linhas em branco — quem
 * apagou a abertura quis mandar só a lista, e três quebras de linha no começo
 * da conversa parecem defeito.
 */
export function montarPedido(
  itens: ItemDoPedido[],
  textos: TextosDoPedido = { abertura: ABERTURA_PADRAO, fecho: FECHO_PADRAO },
): string {
  return [textos.abertura.trim(), listarItens(itens), textos.fecho.trim()]
    .filter((parte) => parte.length > 0)
    .join('\n\n')
}

/**
 * Converte a mensagem antiga, de modelo único, para as duas caixas.
 *
 * Corta no `{{itens}}`: o que vem antes é a abertura, o que vem depois é o
 * fecho. O `{{fornecedor}}` sai do texto — o nome de quem recebe passou a ser
 * mostrado à parte, e deixá-lo aqui seria manter vivo o outro marcador que
 * podia quebrar.
 *
 * Se o `{{itens}}` não estiver lá — porque foi apagado, digitado por cima ou
 * corrompido pelo ditado — a mensagem antiga é DESCARTADA e volta o padrão.
 * Herdá-la seria carregar para a versão nova exatamente o texto que já estava
 * mandando pedido sem produto.
 */
export function converterMensagemAntiga(modelo: string | null | undefined): TextosDoPedido {
  const padrao = { abertura: ABERTURA_PADRAO, fecho: FECHO_PADRAO }
  if (!modelo || !modelo.includes('{{itens}}')) return padrao

  const [antes = '', depois = ''] = modelo.split('{{itens}}')
  const limpar = (parte: string) =>
    parte.replaceAll('{{fornecedor}}', '').replace(/\s*,\s*!/g, '!').trim()

  return { abertura: limpar(antes), fecho: limpar(depois) }
}

/**
 * Endereço que abre o WhatsApp com a conversa e a mensagem prontas.
 *
 * `encodeURIComponent` e não `URLSearchParams`: este último codifica espaço
 * como `+`, e o WhatsApp mostra os `+` literalmente no texto da mensagem.
 * Acento e quebra de linha viram `%C3%A3` e `%0A`, que é o que o app espera.
 *
 * Sem telefone o link ainda funciona: abre o WhatsApp com a mensagem pronta
 * para escolher o contato à mão. É melhor que um botão desabilitado quando o
 * cadastro do fornecedor está incompleto.
 */
export function linkDoPedido(
  telefone: string | null | undefined,
  mensagem: string,
): string {
  const numero = telefone ? telefoneParaWhatsapp(telefone) : null
  const texto = encodeURIComponent(mensagem)
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}
