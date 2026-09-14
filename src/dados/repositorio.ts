import { agora, apagar, db, novoId, salvar, salvarVarios } from './db'
import type {
  Ficha,
  FichaComponente,
  Insumo,
  TipoFicha,
  Unidade,
  Uuid,
} from '@/dominio/tipos'

/**
 * Escritas do app. Toda tela passa por aqui, e daqui tudo vai para o Dexie com
 * uma pendência na fila — nenhuma tela fala com a rede, o que mantém o app
 * inteiro funcionando offline sem cada tela precisar pensar nisso.
 */

export interface Autor {
  donoId: Uuid
  espacoId: Uuid
}

// ---------------------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------------------

export function insumoEmBranco(autor: Autor): Insumo {
  return {
    id: novoId(),
    dono_id: autor.donoId,
    espaco_id: autor.espacoId,
    nome: '',
    categoria: '',
    fornecedor: '',
    quantidade_compra: 1,
    unidade_compra: 'kg',
    preco_compra: 0,
    unidade_uso: 'g',
    fator_correcao: 1,
    observacao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
}

export async function salvarInsumo(insumo: Insumo): Promise<Insumo> {
  return salvar('insumos', { ...insumo, nome: insumo.nome.trim() })
}

export async function apagarInsumo(id: Uuid): Promise<void> {
  await apagar('insumos', id)
}

/** Onde esse insumo é usado — a pergunta que decide se dá para apagar. */
export async function usosDoInsumo(insumoId: Uuid): Promise<string[]> {
  const componentes = await db.ficha_componentes.where('insumo_id').equals(insumoId).toArray()
  const vivos = componentes.filter((c) => !c.apagado_em)
  const nomes = new Set<string>()
  for (const componente of vivos) {
    const ficha = await db.fichas.get(componente.ficha_id)
    if (ficha && !ficha.apagado_em) nomes.add(ficha.nome)
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ---------------------------------------------------------------------------
// Fichas
// ---------------------------------------------------------------------------

export function fichaEmBranco(autor: Autor, tipo: TipoFicha): Ficha {
  return {
    id: novoId(),
    dono_id: autor.donoId,
    espaco_id: autor.espacoId,
    tipo,
    nome: '',
    categoria: '',
    // Prato pensa em porções; preparo pensa em rendimento. O padrão de cada um
    // já entra do jeito que aquele tipo costuma ser escrito.
    rendimento_quantidade: tipo === 'prato' ? 1 : 1000,
    rendimento_unidade: tipo === 'prato' ? 'un' : 'g',
    porcoes: tipo === 'prato' ? 1 : 10,
    modo_preparo: [],
    tempo_minutos: null,
    alergenicos: [],
    observacao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
}

export async function salvarFicha(ficha: Ficha): Promise<Ficha> {
  return salvar('fichas', { ...ficha, nome: ficha.nome.trim() })
}

export async function apagarFicha(id: Uuid): Promise<void> {
  const componentes = await db.ficha_componentes.where('ficha_id').equals(id).toArray()
  const vivos = componentes.filter((c) => !c.apagado_em)
  if (vivos.length > 0) {
    await salvarVarios(
      'ficha_componentes',
      vivos.map((c) => ({ ...c, apagado_em: agora() })),
    )
  }
  await apagar('fichas', id)
}

/** Em que outras fichas este preparo entra. Apagar sem saber isso quebra pratos. */
export async function usosDaFicha(fichaId: Uuid): Promise<string[]> {
  const componentes = await db.ficha_componentes.where('ficha_filha_id').equals(fichaId).toArray()
  const vivos = componentes.filter((c) => !c.apagado_em)
  const nomes = new Set<string>()
  for (const componente of vivos) {
    const ficha = await db.fichas.get(componente.ficha_id)
    if (ficha && !ficha.apagado_em) nomes.add(ficha.nome)
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * Move a ficha para a biblioteca (`espaco_id` nulo) ou traz de volta para um
 * restaurante. Os componentes vão junto — uma ficha na biblioteca cujos
 * ingredientes ficaram presos a uma casa não serviria para nada.
 */
export async function moverFicha(fichaId: Uuid, destino: Uuid | null): Promise<void> {
  const ficha = await db.fichas.get(fichaId)
  if (!ficha) return
  await salvar('fichas', { ...ficha, espaco_id: destino })

  const componentes = (await db.ficha_componentes.where('ficha_id').equals(fichaId).toArray())
    .filter((c) => !c.apagado_em)
    .map((c) => ({ ...c, espaco_id: destino }))
  await salvarVarios('ficha_componentes', componentes)
}

/**
 * Cópia independente da ficha, com seus componentes. Serve para levar uma receita
 * de um restaurante a outro sem que as duas passem a mudar juntas — cozinhas
 * diferentes ajustam a mesma receita de jeitos diferentes.
 *
 * A cópia é rasa de propósito: os sub-preparos continuam apontando para os
 * originais. Copiar em profundidade encheria o cadastro de duplicatas que
 * ninguém pediu.
 */
export async function duplicarFicha(
  fichaId: Uuid,
  destino: { espacoId: Uuid | null; sufixo?: string },
): Promise<Ficha | null> {
  const original = await db.fichas.get(fichaId)
  if (!original) return null

  const copia: Ficha = {
    ...original,
    id: novoId(),
    espaco_id: destino.espacoId,
    nome: destino.sufixo ? `${original.nome} ${destino.sufixo}` : original.nome,
    atualizado_em: agora(),
    apagado_em: null,
  }
  await salvar('fichas', copia)

  const componentes = (await db.ficha_componentes.where('ficha_id').equals(fichaId).toArray())
    .filter((c) => !c.apagado_em)
    .map((c) => ({
      ...c,
      id: novoId(),
      ficha_id: copia.id,
      espaco_id: destino.espacoId,
      atualizado_em: agora(),
    }))
  await salvarVarios('ficha_componentes', componentes)

  return copia
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export async function adicionarComponente(
  ficha: Ficha,
  alvo: { insumoId: Uuid } | { fichaFilhaId: Uuid },
  quantidade: number,
  unidade: Unidade,
): Promise<FichaComponente> {
  const existentes = (await db.ficha_componentes.where('ficha_id').equals(ficha.id).toArray())
    .filter((c) => !c.apagado_em)

  const componente: FichaComponente = {
    id: novoId(),
    dono_id: ficha.dono_id,
    espaco_id: ficha.espaco_id,
    ficha_id: ficha.id,
    insumo_id: 'insumoId' in alvo ? alvo.insumoId : null,
    ficha_filha_id: 'fichaFilhaId' in alvo ? alvo.fichaFilhaId : null,
    quantidade,
    unidade,
    ordem: existentes.length,
    observacao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
  return salvar('ficha_componentes', componente)
}

export async function salvarComponente(componente: FichaComponente): Promise<FichaComponente> {
  return salvar('ficha_componentes', componente)
}

export async function apagarComponente(id: Uuid): Promise<void> {
  await apagar('ficha_componentes', id)
}

/** Reordena renumerando todo mundo — mais barato que acertar índices na mão. */
export async function reordenarComponentes(componentes: FichaComponente[]): Promise<void> {
  await salvarVarios(
    'ficha_componentes',
    componentes.map((c, indice) => ({ ...c, ordem: indice })),
  )
}

export function moverNaLista<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista
  const copia = [...lista]
  const [item] = copia.splice(de, 1)
  copia.splice(para, 0, item!)
  return copia
}
