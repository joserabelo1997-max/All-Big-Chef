/**
 * Geração de identificadores.
 *
 * Os ids são gerados no CLIENTE, não no banco. A etiqueta precisa ser impressa
 * — com o QR já contendo o id — antes de qualquer contato com o servidor;
 * numa cozinha sem Wi-Fi, esperar o banco devolver um id significaria não
 * imprimir. Um uuid v4 tem colisão desprezível mesmo com dezenas de aparelhos
 * gerando offline em paralelo.
 */

export function novoId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Alguns navegadores só expõem randomUUID em contexto seguro. getRandomValues
  // está sempre disponível, então montamos o v4 na mão a partir dele.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // versão 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variante RFC 4122

  const hex: string[] = []
  for (const b of bytes) hex.push(b.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

/**
 * Alfabeto Base32 de Crockford, sem I, L, O e U.
 *
 * I e L se confundem com 1, O com 0, e U é removido para não formar palavrão
 * por acaso — um código impresso que a pessoa precisa ditar em voz alta para o
 * colega do outro lado da cozinha não pode ser ambíguo nem constrangedor.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Código curto impresso na etiqueta, para digitação manual.
 *
 * O QR é o caminho normal, mas etiqueta de cozinha amassa, molha e pega
 * gordura. Quando o leitor não pega, alguém precisa conseguir digitar o código
 * e achar a etiqueta — por isso ele existe, e por isso é curto.
 *
 * 6 caracteres = 32^6 ≈ 1,07 bilhão de combinações. Numa cozinha que imprima
 * 200 etiquetas por dia, a chance de colisão dentro de um ano de operação é
 * ínfima, e mesmo assim o banco tem índice único por organização para recusar
 * a repetição em vez de aceitá-la em silêncio.
 */
export function novoCodigoCurto(tamanho = 6): string {
  const bytes = new Uint8Array(tamanho)
  crypto.getRandomValues(bytes)

  let codigo = ''
  for (const b of bytes) {
    // 256 não é múltiplo de 32, mas 32 divide 256 exatamente (8 vezes), então
    // o módulo aqui não introduz viés.
    codigo += ALFABETO[b % ALFABETO.length]
  }
  return codigo
}

/**
 * Normaliza o que a pessoa digitou.
 *
 * Corrige apenas as confusões em que a intenção é inequívoca: "O" só pode ter
 * sido um zero, "I" e "L" só podem ter sido um 1 — nenhuma dessas letras existe
 * no alfabeto, então não há ambiguidade.
 *
 * "U" também está fora do alfabeto, mas é deixado como está de propósito. Seria
 * tentador mapeá-lo para "V", só que isso é adivinhação: se o palpite errar, a
 * busca encontra uma etiqueta DIFERENTE e a pessoa dá baixa no produto errado.
 * Num sistema de segurança alimentar, falhar com "código não encontrado" é
 * muito melhor do que acertar a etiqueta errada em silêncio.
 */
export function normalizarCodigo(entrada: string): string {
  return entrada
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}
