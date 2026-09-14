import { agora, apagar, db, novoId, salvar, salvarVarios } from './db'
import { explodirFicha } from '@/dominio/arvore'
import type { Contexto, NoArvore } from '@/dominio/arvore'
import { MAXIMO_DE_VERSOES } from '@/dominio/tipos'
import type {
  Ficha,
  FichaComponente,
  Insumo,
  IsoData,
  Menu,
  MenuItem,
  PeriodoCmv,
  Servico,
  ServicoItem,
  SnapshotNo,
  SnapshotPrato,
  SnapshotServico,
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

// ---------------------------------------------------------------------------
// Períodos de CMV
// ---------------------------------------------------------------------------

export function periodoEmBranco(autor: Autor): PeriodoCmv {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)

  return {
    id: novoId(),
    dono_id: autor.donoId,
    espaco_id: autor.espacoId,
    rotulo: primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    inicio: emIso(primeiro),
    fim: emIso(ultimo),
    estoque_inicial: 0,
    compras: 0,
    estoque_final: 0,
    faturamento: 0,
    observacao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
}

export async function salvarPeriodo(periodo: PeriodoCmv): Promise<PeriodoCmv> {
  return salvar('periodos_cmv', periodo)
}

export async function apagarPeriodo(id: Uuid): Promise<void> {
  await apagar('periodos_cmv', id)
}

/** Data civil sem fuso: o dia do serviço é um dia, não um instante em UTC. */
export function emIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

export function hojeEmIso(): string {
  return emIso(new Date())
}

export function formatarDataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export function menuEmBranco(autor: Autor): Menu {
  return {
    id: novoId(),
    dono_id: autor.donoId,
    espaco_id: autor.espacoId,
    nome: '',
    descricao: '',
    atualizado_em: agora(),
    apagado_em: null,
  }
}

export async function salvarMenu(menu: Menu): Promise<Menu> {
  return salvar('menus', { ...menu, nome: menu.nome.trim() })
}

export async function apagarMenu(id: Uuid): Promise<void> {
  const itens = (await db.menu_itens.where('menu_id').equals(id).toArray()).filter(
    (i) => !i.apagado_em,
  )
  if (itens.length > 0) {
    await salvarVarios(
      'menu_itens',
      itens.map((i) => ({ ...i, apagado_em: agora() })),
    )
  }
  await apagar('menus', id)
}

export async function adicionarAoMenu(menu: Menu, fichaId: Uuid, porcoes: number): Promise<void> {
  const existentes = (await db.menu_itens.where('menu_id').equals(menu.id).toArray()).filter(
    (i) => !i.apagado_em,
  )
  const item: MenuItem = {
    id: novoId(),
    dono_id: menu.dono_id,
    espaco_id: menu.espaco_id,
    menu_id: menu.id,
    ficha_id: fichaId,
    porcoes_previstas: porcoes,
    ordem: existentes.length,
    atualizado_em: agora(),
    apagado_em: null,
  }
  await salvar('menu_itens', item)
}

export async function salvarItemDoMenu(item: MenuItem): Promise<void> {
  await salvar('menu_itens', item)
}

export async function apagarItemDoMenu(id: Uuid): Promise<void> {
  await apagar('menu_itens', id)
}

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

export async function abrirServico(
  autor: Autor,
  dados: { data: IsoData; nome: string; menuId: Uuid | null },
): Promise<Servico> {
  // Abrir o dia a partir de um menu copia os pratos para dentro do serviço. A
  // partir daí eles são do dia, não do menu: trocar a guarnição hoje não pode
  // reescrever o menu padrão da casa.
  let itens: ServicoItem[] = []
  if (dados.menuId) {
    const doMenu = (await db.menu_itens.where('menu_id').equals(dados.menuId).toArray())
      .filter((i) => !i.apagado_em)
      .sort((a, b) => a.ordem - b.ordem)
    itens = doMenu.map((i) => ({ ficha_id: i.ficha_id, porcoes: i.porcoes_previstas }))
  }

  const servico: Servico = {
    id: novoId(),
    dono_id: autor.donoId,
    espaco_id: autor.espacoId,
    data: dados.data,
    nome: dados.nome.trim(),
    menu_id: dados.menuId,
    observacao: '',
    itens,
    snapshots: [],
    atualizado_em: agora(),
    apagado_em: null,
  }
  return salvar('servicos', servico)
}

export async function salvarServico(servico: Servico): Promise<Servico> {
  return salvar('servicos', servico)
}

export async function apagarServico(id: Uuid): Promise<void> {
  const itens = (await db.producao_itens.where('servico_id').equals(id).toArray()).filter(
    (i) => !i.apagado_em,
  )
  if (itens.length > 0) {
    await salvarVarios(
      'producao_itens',
      itens.map((i) => ({ ...i, apagado_em: agora() })),
    )
  }
  await apagar('servicos', id)
}

/**
 * Congela o serviço como ele está agora e acrescenta essa versão ao histórico.
 *
 * A cópia é denormalizada de propósito: guarda nome, quantidade e modo de preparo
 * escritos por extenso, e não ids. Daqui a um ano a receita terá mudado, o insumo
 * pode ter sido apagado — e a pergunta "o que eu servi naquele dia" continua tendo
 * resposta porque a resposta não depende de nada que ainda exista.
 */
export async function registrarNoHistorico(
  servico: Servico,
  ctx: Contexto,
  observacao = '',
): Promise<Servico> {
  const pratos: SnapshotPrato[] = []
  let custoTotal: number | null = 0

  for (const item of servico.itens) {
    const ficha = ctx.fichas.get(item.ficha_id)
    if (!ficha) continue

    const { raiz } = explodirFicha(ctx, item.ficha_id, { porcoes: item.porcoes })
    pratos.push({
      ficha_id: ficha.id,
      nome: ficha.nome,
      porcoes: item.porcoes,
      custo_total: raiz.custo,
      arvore: raiz.filhos.map((filho) => congelar(filho, ctx)),
    })

    custoTotal = raiz.custo === null || custoTotal === null ? null : custoTotal + raiz.custo
  }

  const versaoAnterior = servico.snapshots[servico.snapshots.length - 1]?.versao ?? 0
  const nova: SnapshotServico = {
    gerado_em: agora(),
    versao: versaoAnterior + 1,
    custo_total: custoTotal,
    observacao,
    pratos,
  }

  const historico = [...servico.snapshots, nova].slice(-MAXIMO_DE_VERSOES)
  return salvar('servicos', { ...servico, snapshots: historico })
}

function congelar(no: NoArvore, ctx: Contexto): SnapshotNo {
  const ficha = no.tipo === 'ficha' ? ctx.fichas.get(no.refId) : undefined
  const congelado: SnapshotNo = {
    tipo: no.tipo,
    ref_id: no.refId,
    nome: no.nome,
    quantidade: no.quantidade,
    unidade: no.unidade,
  }
  if (ficha && ficha.modo_preparo.length > 0) congelado.modo_preparo = [...ficha.modo_preparo]
  if (no.filhos.length > 0) congelado.filhos = no.filhos.map((f) => congelar(f, ctx))
  return congelado
}
