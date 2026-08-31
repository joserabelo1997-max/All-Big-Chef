/**
 * Montagem do link de pedido pelo WhatsApp.
 *
 * O app só ABRE a conversa com a mensagem pronta — não envia e não registra o
 * pedido, como você pediu. Quem confirma o pedido é a conversa com o
 * fornecedor, e fingir que o sistema sabe o que foi combinado ali criaria um
 * histórico que não corresponde à realidade.
 */

/** Modelo padrão da mensagem. `{{fornecedor}}` e `{{itens}}` são substituídos. */
export const MENSAGEM_PADRAO =
  'Olá, {{fornecedor}}! Gostaria de fazer um pedido:\n\n{{itens}}\n\nObrigado!'

export interface ItemDoPedido {
  nome: string
  quantidade: number
  unidade: string
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

export function montarMensagem(
  fornecedor: string,
  itens: ItemDoPedido[],
  modelo: string = MENSAGEM_PADRAO,
): string {
  return modelo
    .replaceAll('{{fornecedor}}', fornecedor)
    .replaceAll('{{itens}}', listarItens(itens))
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
