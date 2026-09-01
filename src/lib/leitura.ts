import { pareceCodigoDeBarras, normalizarCodigoBarras } from './codigoBarras'
import { db } from './db'
import { normalizarCodigo } from './ids'
import { identificarCodigo } from '../scanning/scanner'

/**
 * O que fazer com o que o leitor entregou.
 *
 * Esta decisão estava dentro do componente `LeitorGlobal`, onde não havia como
 * exercitá-la: cada caminho depende de uma consulta ao banco e de navegação.
 * Aqui ela é uma função com entrada e saída, e o componente só obedece ao
 * resultado.
 *
 * ## A ordem importa
 *
 * O QR do app vem primeiro porque é o único formato que carrega o caminho
 * (`/l/` ou `/i/`) e portanto não é ambíguo. Só depois vem o código de barras
 * do fabricante, com dígito verificador conferido, e por último o código curto
 * impresso — que é o mais curto e o mais fácil de confundir com qualquer coisa.
 */
export type Leitura =
  /** QR ou código curto de uma etiqueta de validade. */
  | { tipo: 'etiqueta'; id: string }
  /** QR ou código curto de uma etiqueta de inventário. */
  | { tipo: 'inventario'; id: string }
  /** Código de barras já vinculado a um produto. */
  | { tipo: 'produto'; id: string; codigo: string }
  /**
   * Código de barras que ainda não é de ninguém. Não é erro: é o momento de
   * aprender. Quem bipa um produto novo espera poder vinculá-lo ali mesmo, e
   * não ser mandado para o cadastro para digitar treze dígitos à mão.
   */
  | { tipo: 'desconhecido'; codigo: string }
  /** Não se parece com nada que o app saiba ler. */
  | { tipo: 'ilegivel'; codigo: string }

export async function resolverLeitura(bruto: string, orgId: string): Promise<Leitura> {
  // 1) O QR impresso pelo app. O caminho na URL diz qual das duas etiquetas é,
  //    então a tela de validade nunca recebe um pote de inventário — que não
  //    tem data nenhuma para mostrar.
  const doApp = identificarCodigo(bruto)
  if (doApp) return { tipo: doApp.tipo, id: doApp.id }

  // 2) Código de barras do fabricante. Vem antes do código curto porque o
  //    dígito verificador o torna praticamente inconfundível, enquanto o código
  //    curto é só um punhado de caracteres sem conferência.
  const barras = normalizarCodigoBarras(bruto)
  if (pareceCodigoDeBarras(barras)) {
    const produto = await db.products
      .where('codigo_barras')
      .equals(barras)
      .filter((p) => p.org_id === orgId && !p.deleted_at && p.ativo)
      .first()

    return produto
      ? { tipo: 'produto', id: produto.id, codigo: barras }
      : { tipo: 'desconhecido', codigo: barras }
  }

  // 3) Código curto impresso, o caminho de quando a etiqueta está amassada.
  //    Procura nas duas tabelas: quem digita o código de um pote de inventário
  //    espera cair na contagem, não num "não encontrado".
  const curto = normalizarCodigo(bruto)
  if (curto.length >= 4 && curto.length <= 10) {
    const etiqueta = await db.labels
      .where('short_code')
      .equals(curto)
      .filter((l) => l.org_id === orgId)
      .first()
    if (etiqueta) return { tipo: 'etiqueta', id: etiqueta.id }

    const doInventario = await db.inventory_tags
      .where('short_code')
      .equals(curto)
      .filter((t) => t.org_id === orgId)
      .first()
    if (doInventario) return { tipo: 'inventario', id: doInventario.id }
  }

  return { tipo: 'ilegivel', codigo: bruto }
}

/** Para onde a leitura leva. `null` quando não há tela para onde ir. */
export function destinoDaLeitura(leitura: Leitura): string | null {
  switch (leitura.tipo) {
    case 'etiqueta':
      return `/l/${leitura.id}`
    case 'inventario':
      return `/i/${leitura.id}`
    case 'produto':
      return `/estoque/${leitura.id}`
    case 'desconhecido':
      // Leva à lista do estoque com o código na mão: tocar num produto ali
      // vincula, aproveitando a busca que já existe em vez de inventar uma
      // tela de escolha só para isto.
      return `/estoque?vincular=${encodeURIComponent(leitura.codigo)}`
    case 'ilegivel':
      return null
  }
}
