import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { agora, db, novoId, salvar } from './db'
import { useSessao } from './sessao'
import type { Espaco, TipoCasa, Uuid } from '@/dominio/tipos'

/**
 * Espaços = restaurantes.
 *
 * Cada um é um mundo fechado: receitas, menus, serviços e compras de um não
 * aparecem no outro. Fora deles existe a BIBLIOTECA, que é tudo que tem
 * `espaco_id` nulo — os fundos, molhos mãe e massas que são seus e viajam com
 * você para qualquer cozinha onde for trabalhar.
 *
 * Filtro de tela seria mais fácil de programar e mais fácil de esquecer ligado.
 * No meio do serviço, ver a receita da casa errada é um erro caro.
 */

const CHAVE_ATIVO = 'all-big-chef-espaco-ativo'

interface ValorEspacos {
  espacos: Espaco[]
  espacoAtivo: Espaco | null
  carregando: boolean
  trocar: (id: Uuid) => void
  criar: (dados: { nome: string; tipo_casa: TipoCasa; cmv_alvo: number }) => Promise<Espaco>
  atualizar: (espaco: Espaco) => Promise<void>
  arquivar: (id: Uuid) => Promise<void>
}

const Contexto = createContext<ValorEspacos | null>(null)

export function ProvedorEspacos({ children }: { children: ReactNode }) {
  const { usuario } = useSessao()
  const [ativoId, setAtivoId] = useState<Uuid | null>(() => lerAtivoSalvo())

  const espacos = useLiveQuery(
    async () => {
      const todos = await db.espacos.toArray()
      return todos
        .filter((e) => !e.apagado_em)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    [],
    undefined,
  )

  const carregando = espacos === undefined
  const lista = espacos ?? []

  // Se o espaço guardado sumiu (apagado em outro aparelho) ou nunca houve um,
  // cai no primeiro da lista em vez de deixar o app sem contexto nenhum.
  useEffect(() => {
    if (carregando || lista.length === 0) return
    const existe = ativoId && lista.some((e) => e.id === ativoId)
    if (!existe) {
      const primeiro = lista[0]!
      setAtivoId(primeiro.id)
      gravarAtivoSalvo(primeiro.id)
    }
  }, [carregando, lista, ativoId])

  const trocar = useCallback((id: Uuid) => {
    setAtivoId(id)
    gravarAtivoSalvo(id)
  }, [])

  const criar = useCallback<ValorEspacos['criar']>(
    async (dados) => {
      if (!usuario) throw new Error('Sem sessão aberta.')
      const espaco: Espaco = {
        id: novoId(),
        dono_id: usuario.id,
        nome: dados.nome.trim(),
        tipo_casa: dados.tipo_casa,
        cmv_alvo: dados.cmv_alvo,
        atualizado_em: agora(),
        apagado_em: null,
      }
      // `espacos` não tem espaco_id: o restaurante não mora dentro de outro.
      await salvar('espacos', { ...espaco, espaco_id: null })
      trocar(espaco.id)
      return espaco
    },
    [usuario, trocar],
  )

  const atualizar = useCallback<ValorEspacos['atualizar']>(async (espaco) => {
    await salvar('espacos', { ...espaco, espaco_id: null })
  }, [])

  const arquivar = useCallback<ValorEspacos['arquivar']>(async (id) => {
    const atual = await db.espacos.get(id)
    if (!atual) return
    await salvar('espacos', { ...atual, espaco_id: null, apagado_em: agora() })
  }, [])

  const valor = useMemo<ValorEspacos>(
    () => ({
      espacos: lista,
      espacoAtivo: lista.find((e) => e.id === ativoId) ?? null,
      carregando,
      trocar,
      criar,
      atualizar,
      arquivar,
    }),
    [lista, ativoId, carregando, trocar, criar, atualizar, arquivar],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEspacos(): ValorEspacos {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useEspacos precisa estar dentro de <ProvedorEspacos>')
  return valor
}

/** O id do restaurante ativo, para as telas que não podem funcionar sem um. */
export function useEspacoAtivoId(): Uuid {
  const { espacoAtivo } = useEspacos()
  if (!espacoAtivo) throw new Error('Nenhum restaurante ativo.')
  return espacoAtivo.id
}

function lerAtivoSalvo(): Uuid | null {
  try {
    return localStorage.getItem(CHAVE_ATIVO)
  } catch {
    return null
  }
}

function gravarAtivoSalvo(id: Uuid): void {
  try {
    localStorage.setItem(CHAVE_ATIVO, id)
  } catch {
    // Modo privado do Safari bloqueia o localStorage. O app segue funcionando,
    // só esquece o restaurante escolhido ao fechar.
  }
}

export const TIPOS_CASA: { valor: TipoCasa; rotulo: string }[] = [
  { valor: 'a_la_carte', rotulo: 'Restaurante à la carte' },
  { valor: 'bistro', rotulo: 'Bistrô / autoral' },
  { valor: 'pizzaria', rotulo: 'Pizzaria' },
  { valor: 'hamburgueria', rotulo: 'Hamburgueria' },
  { valor: 'fast_food', rotulo: 'Fast food' },
  { valor: 'japones', rotulo: 'Japonês' },
  { valor: 'padaria', rotulo: 'Padaria / cafeteria' },
  { valor: 'outro', rotulo: 'Outro' },
]
