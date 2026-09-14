import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Ficha, FichaComponente, Insumo, Menu, MenuItem, Servico, Uuid } from '@/dominio/tipos'

/**
 * Consultas do espelho local. Todas obedecem à mesma regra de escopo: o que é do
 * restaurante ativo mais o que é da biblioteca (`espaco_id` nulo). Nunca o que é
 * de outro restaurante.
 */

interface ComEscopo {
  espaco_id: Uuid | null
  apagado_em: string | null
}

export function dentroDoEscopo(linha: ComEscopo, espacoId: Uuid | null): boolean {
  if (linha.apagado_em) return false
  if (linha.espaco_id === null) return true // biblioteca: visível de qualquer casa
  return linha.espaco_id === espacoId
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR')

export function useInsumos(espacoId: Uuid | null): Insumo[] | undefined {
  return useLiveQuery(
    async () => {
      const todos = await db.insumos.toArray()
      return todos.filter((i) => dentroDoEscopo(i, espacoId)).sort(porNome)
    },
    [espacoId],
    undefined,
  )
}

export function useFichas(espacoId: Uuid | null): Ficha[] | undefined {
  return useLiveQuery(
    async () => {
      const todas = await db.fichas.toArray()
      return todas.filter((f) => dentroDoEscopo(f, espacoId)).sort(porNome)
    },
    [espacoId],
    undefined,
  )
}

export function useFicha(fichaId: Uuid | null): Ficha | undefined | null {
  return useLiveQuery(
    async () => (fichaId ? ((await db.fichas.get(fichaId)) ?? null) : null),
    [fichaId],
    undefined,
  )
}

/** Todos os componentes do escopo: a árvore precisa deles inteiros para montar. */
export function useComponentes(espacoId: Uuid | null): FichaComponente[] | undefined {
  return useLiveQuery(
    async () => {
      const todos = await db.ficha_componentes.toArray()
      return todos.filter((c) => !c.apagado_em && (c.espaco_id === null || c.espaco_id === espacoId))
    },
    [espacoId],
    undefined,
  )
}

export function useComponentesDaFicha(fichaId: Uuid | null): FichaComponente[] | undefined {
  return useLiveQuery(
    async () => {
      if (!fichaId) return []
      const todos = await db.ficha_componentes.where('ficha_id').equals(fichaId).toArray()
      return todos.filter((c) => !c.apagado_em).sort((a, b) => a.ordem - b.ordem)
    },
    [fichaId],
    undefined,
  )
}

export function useMenus(espacoId: Uuid | null): Menu[] | undefined {
  return useLiveQuery(
    async () => {
      const todos = await db.menus.toArray()
      return todos.filter((m) => dentroDoEscopo(m, espacoId)).sort(porNome)
    },
    [espacoId],
    undefined,
  )
}

export function useItensDoMenu(menuId: Uuid | null): MenuItem[] | undefined {
  return useLiveQuery(
    async () => {
      if (!menuId) return []
      const todos = await db.menu_itens.where('menu_id').equals(menuId).toArray()
      return todos.filter((i) => !i.apagado_em).sort((a, b) => a.ordem - b.ordem)
    },
    [menuId],
    undefined,
  )
}

export function useServicos(espacoId: Uuid | null): Servico[] | undefined {
  return useLiveQuery(
    async () => {
      const todos = await db.servicos.toArray()
      return todos
        .filter((s) => !s.apagado_em && s.espaco_id === espacoId)
        // Do mais recente para o mais antigo: no histórico, o que interessa
        // primeiro é quase sempre o que acabou de acontecer.
        .sort((a, b) => b.data.localeCompare(a.data))
    },
    [espacoId],
    undefined,
  )
}

export function useServico(servicoId: Uuid | null): Servico | undefined | null {
  return useLiveQuery(
    async () => (servicoId ? ((await db.servicos.get(servicoId)) ?? null) : null),
    [servicoId],
    undefined,
  )
}
