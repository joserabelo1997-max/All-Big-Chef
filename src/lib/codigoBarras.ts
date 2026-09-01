/**
 * Código de barras da embalagem do fabricante.
 *
 * ## Por que não reaproveitar `normalizarCodigo`
 *
 * Aquele existe para o código curto IMPRESSO pelo app, e corrige confusões de
 * digitação: "O" vira zero, "I" e "L" viram um. Aplicar isso a um código de
 * barras seria destruí-lo — um EAN é uma sequência exata, e trocar um dígito
 * aponta para outro produto. Aqui a regra é o oposto: preservar o que o leitor
 * entregou, tirando só espaço e pontuação.
 *
 * ## A ambiguidade que precisa ser resolvida
 *
 * O código curto do app tem 6 caracteres do alfabeto Base32; o leitor global
 * aceita de 4 a 10. Um EAN-8 tem 8 dígitos e cai bem no meio dessa faixa. Só o
 * comprimento, portanto, não distingue um do outro.
 *
 * Quem distingue é o dígito verificador: EAN e UPC carregam um, e a chance de
 * um código curto aleatório de 8 dígitos passar na conta é de 1 em 10. Por isso
 * a decisão de "isto é código de barras" exige o dígito bater, e não apenas o
 * tamanho ser plausível. Num sistema de estoque, dar entrada no produto errado
 * é pior do que não reconhecer o código.
 */

/** Comprimentos com dígito verificador definido: EAN-8, UPC-A, EAN-13, GTIN-14. */
const COMPRIMENTOS = new Set([8, 12, 13, 14])

/**
 * O código como ele deve ser guardado: sem espaço nem pontuação, em caixa alta.
 *
 * Caixa alta e não só dígitos porque nem todo código de embalagem é EAN — há
 * Code 128 alfanumérico em caixa de fornecedor, e recusá-lo aqui obrigaria a
 * pessoa a digitar o nome do produto justamente quando está de mãos ocupadas.
 */
export function normalizarCodigoBarras(bruto: string): string {
  return bruto.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/**
 * Confere o dígito verificador de EAN/UPC.
 *
 * Da direita para a esquerda, sem contar o próprio dígito: pesos 3 e 1
 * alternados; o verificador é o que completa a soma até a próxima dezena.
 */
export function digitoVerificadorValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || !COMPRIMENTOS.has(codigo.length)) return false

  const corpo = codigo.slice(0, -1)
  const informado = Number(codigo.slice(-1))

  let soma = 0
  for (let i = corpo.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    soma += Number(corpo[i]) * peso
  }

  return (10 - (soma % 10)) % 10 === informado
}

/**
 * Se vale a pena procurar este código entre os produtos.
 *
 * Aceita o EAN/UPC com dígito conferido, e também o código alfanumérico mais
 * longo que o alfabeto do app não produz — nesse caso não há verificador para
 * conferir, mas também não há como confundir com etiqueta nossa.
 */
export function pareceCodigoDeBarras(codigo: string): boolean {
  if (digitoVerificadorValido(codigo)) return true
  // Contém letra e é comprido: não é código curto nosso (6 caracteres) nem UUID
  // (que vem dentro de uma URL e é tratado antes).
  return codigo.length >= 11 && /[A-Z]/.test(codigo) && /^[0-9A-Z]+$/.test(codigo)
}

/** Como mostrar o código na tela, em grupos que dá para conferir com o olho. */
export function formatarCodigoBarras(codigo: string): string {
  if (codigo.length === 13) {
    return `${codigo.slice(0, 1)} ${codigo.slice(1, 7)} ${codigo.slice(7)}`
  }
  if (codigo.length === 12) {
    return `${codigo.slice(0, 1)} ${codigo.slice(1, 6)} ${codigo.slice(6, 11)} ${codigo.slice(11)}`
  }
  return codigo
}
