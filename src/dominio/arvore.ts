import { custoDoInsumo, somarCustos } from './custo'
import type { Ficha, FichaComponente, Insumo, Unidade, Uuid } from './tipos'
import { tentarConverter } from './unidades'

/**
 * A árvore é o coração do app. Um prato contém preparos, um preparo contém outros
 * preparos, e as folhas são insumos. Dela saem, sem duplicar nenhum cadastro:
 * a ficha técnica (mostrando os nós), o checklist (marcando os nós), o custo
 * (somando de baixo para cima) e a lista de compras (achatando só as folhas).
 */

export interface Contexto {
  fichas: Map<Uuid, Ficha>
  /** Componentes já agrupados por ficha e ordenados. */
  componentesPorFicha: Map<Uuid, FichaComponente[]>
  insumos: Map<Uuid, Insumo>
}

export type TipoNo = 'ficha' | 'insumo'

export interface NoArvore {
  tipo: TipoNo
  /** id da ficha ou do insumo referenciado. */
  refId: Uuid
  /** id do componente (a aresta) que trouxe até aqui. Nulo na raiz. */
  componenteId: Uuid | null
  nome: string
  /** Quantidade líquida já escalada para o tamanho pedido. */
  quantidade: number
  unidade: Unidade
  /** Só em folhas: o que comprar, já com o fator de correção aplicado. */
  quantidadeBruta: number | null
  custo: number | null
  profundidade: number
  /** Caminho único na árvore. Serve de chave estável na tela. */
  caminho: string
  filhos: NoArvore[]
  observacao: string
}

export interface Explosao {
  raiz: NoArvore
  avisos: string[]
}

const PROFUNDIDADE_MAXIMA = 12

/**
 * Monta a árvore de uma ficha já escalada para o número de porções pedido.
 *
 * `porcoes` ausente usa o rendimento cadastrado da própria ficha. Ciclos (um
 * preparo que, por descuido, acaba contendo a si mesmo) são cortados e viram
 * aviso legível, nunca travamento.
 */
export function explodirFicha(
  ctx: Contexto,
  fichaId: Uuid,
  opcoes: { porcoes?: number } = {},
): Explosao {
  const ficha = ctx.fichas.get(fichaId)
  const avisos: string[] = []

  if (!ficha) {
    return {
      raiz: noVazio(fichaId, 'Ficha não encontrada'),
      avisos: ['Esta ficha não existe mais (pode ter sido apagada em outro aparelho).'],
    }
  }

  const porcoesDesejadas = opcoes.porcoes ?? ficha.porcoes
  const escala =
    ficha.porcoes > 0 && porcoesDesejadas > 0 ? porcoesDesejadas / ficha.porcoes : 1

  const raiz = montar(ctx, ficha, {
    componenteId: null,
    escala,
    profundidade: 0,
    caminho: `ficha:${ficha.id}`,
    pilha: new Set<Uuid>(),
    avisos,
    quantidade: ficha.rendimento_quantidade * escala,
    unidade: ficha.rendimento_unidade,
    observacao: '',
  })

  return { raiz, avisos }
}

interface Passo {
  componenteId: Uuid | null
  escala: number
  profundidade: number
  caminho: string
  pilha: Set<Uuid>
  avisos: string[]
  quantidade: number
  unidade: Unidade
  observacao: string
}

function montar(ctx: Contexto, ficha: Ficha, passo: Passo): NoArvore {
  const no: NoArvore = {
    tipo: 'ficha',
    refId: ficha.id,
    componenteId: passo.componenteId,
    nome: ficha.nome,
    quantidade: passo.quantidade,
    unidade: passo.unidade,
    quantidadeBruta: null,
    custo: null,
    profundidade: passo.profundidade,
    caminho: passo.caminho,
    filhos: [],
    observacao: passo.observacao,
  }

  if (passo.pilha.has(ficha.id)) {
    passo.avisos.push(
      `"${ficha.nome}" contém a si mesma em algum nível. O app parou aqui para não entrar em laço — confira os componentes dessa ficha.`,
    )
    return no
  }

  if (passo.profundidade >= PROFUNDIDADE_MAXIMA) {
    passo.avisos.push(
      `"${ficha.nome}" está aninhada fundo demais (mais de ${PROFUNDIDADE_MAXIMA} níveis). O app parou aqui.`,
    )
    return no
  }

  const pilha = new Set(passo.pilha)
  pilha.add(ficha.id)

  const componentes = (ctx.componentesPorFicha.get(ficha.id) ?? [])
    .filter((c) => !c.apagado_em)
    .sort((a, b) => a.ordem - b.ordem)

  for (const comp of componentes) {
    const quantidade = comp.quantidade * passo.escala

    if (comp.insumo_id) {
      no.filhos.push(
        folhaInsumo(ctx, comp, quantidade, passo, `${passo.caminho}/insumo:${comp.insumo_id}`),
      )
      continue
    }

    if (comp.ficha_filha_id) {
      const filha = ctx.fichas.get(comp.ficha_filha_id)
      const caminho = `${passo.caminho}/ficha:${comp.ficha_filha_id}`

      if (!filha) {
        passo.avisos.push(
          `"${ficha.nome}" usa um preparo que não existe mais. Abra a ficha e remova ou troque esse item.`,
        )
        no.filhos.push(noVazio(comp.ficha_filha_id, 'Preparo não encontrado', caminho, passo.profundidade + 1))
        continue
      }

      // Quanto do preparo esta receita consome, em relação ao que ele rende
      // inteiro — é esse número que escala tudo que está dentro dele.
      const consumo = tentarConverter(quantidade, comp.unidade, filha.rendimento_unidade)
      let escalaFilha = 1
      if (!consumo.ok) {
        passo.avisos.push(
          `"${ficha.nome}" pede ${comp.unidade} de "${filha.nome}", que rende em ${filha.rendimento_unidade}. ${consumo.motivo}`,
        )
      } else if (filha.rendimento_quantidade > 0) {
        escalaFilha = consumo.valor / filha.rendimento_quantidade
      }

      no.filhos.push(
        montar(ctx, filha, {
          componenteId: comp.id,
          escala: escalaFilha,
          profundidade: passo.profundidade + 1,
          caminho,
          pilha,
          avisos: passo.avisos,
          quantidade,
          unidade: comp.unidade,
          observacao: comp.observacao,
        }),
      )
    }
  }

  no.custo = somarCustos(no.filhos.map((f) => f.custo))
  return no
}

function folhaInsumo(
  ctx: Contexto,
  comp: FichaComponente,
  quantidade: number,
  passo: Passo,
  caminho: string,
): NoArvore {
  const insumo = comp.insumo_id ? ctx.insumos.get(comp.insumo_id) : undefined

  if (!insumo) {
    passo.avisos.push(
      'Um ingrediente da ficha não existe mais no cadastro de insumos. Abra a ficha para corrigir.',
    )
    return noVazio(comp.insumo_id ?? comp.id, 'Insumo não encontrado', caminho, passo.profundidade + 1)
  }

  const resultado = custoDoInsumo(insumo, quantidade, comp.unidade)
  if (resultado.aviso) passo.avisos.push(resultado.aviso)

  return {
    tipo: 'insumo',
    refId: insumo.id,
    componenteId: comp.id,
    nome: insumo.nome,
    quantidade: resultado.quantidadeLiquida,
    unidade: resultado.unidade,
    quantidadeBruta: resultado.quantidadeBruta,
    custo: resultado.custo,
    profundidade: passo.profundidade + 1,
    caminho,
    filhos: [],
    observacao: comp.observacao,
  }
}

function noVazio(refId: Uuid, nome: string, caminho = `ausente:${refId}`, profundidade = 0): NoArvore {
  return {
    tipo: 'ficha',
    refId,
    componenteId: null,
    nome,
    quantidade: 0,
    unidade: 'un',
    quantidadeBruta: null,
    custo: null,
    profundidade,
    caminho,
    filhos: [],
    observacao: '',
  }
}

/** Percorre a árvore inteira, raiz incluída, de cima para baixo. */
export function percorrer(raiz: NoArvore, visitar: (no: NoArvore) => void): void {
  visitar(raiz)
  for (const filho of raiz.filhos) percorrer(filho, visitar)
}

/** Todas as fichas (pratos e preparos) da árvore — o que vira tarefa no checklist. */
export function fichasDaArvore(raiz: NoArvore): NoArvore[] {
  const encontradas: NoArvore[] = []
  percorrer(raiz, (no) => {
    if (no.tipo === 'ficha') encontradas.push(no)
  })
  return encontradas
}

/** Monta o contexto a partir das listas cruas vindas do banco. */
export function montarContexto(
  fichas: Ficha[],
  componentes: FichaComponente[],
  insumos: Insumo[],
): Contexto {
  const porFicha = new Map<Uuid, FichaComponente[]>()
  for (const c of componentes) {
    if (c.apagado_em) continue
    const lista = porFicha.get(c.ficha_id)
    if (lista) lista.push(c)
    else porFicha.set(c.ficha_id, [c])
  }
  return {
    fichas: new Map(fichas.filter((f) => !f.apagado_em).map((f) => [f.id, f])),
    componentesPorFicha: porFicha,
    insumos: new Map(insumos.filter((i) => !i.apagado_em).map((i) => [i.id, i])),
  }
}

/**
 * Se eu puser `candidataId` dentro de `fichaId`, isso cria um laço?
 *
 * Cria se a candidata for a própria ficha, ou se a ficha já estiver em algum lugar
 * dentro da candidata. Vale perguntar ANTES de deixar escolher: barrar na hora de
 * montar a receita é muito melhor que descobrir depois, com um aviso no custo.
 */
export function criariaCiclo(ctx: Contexto, fichaId: Uuid, candidataId: Uuid): boolean {
  if (fichaId === candidataId) return true

  const vistas = new Set<Uuid>()
  const pilha: Uuid[] = [candidataId]

  while (pilha.length > 0) {
    const atual = pilha.pop()!
    if (atual === fichaId) return true
    if (vistas.has(atual)) continue
    vistas.add(atual)

    for (const componente of ctx.componentesPorFicha.get(atual) ?? []) {
      if (componente.apagado_em) continue
      if (componente.ficha_filha_id) pilha.push(componente.ficha_filha_id)
    }
  }

  return false
}
