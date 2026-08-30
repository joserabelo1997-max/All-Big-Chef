import { db, salvarESincronizar } from './db'
import { novoId } from './ids'
import { supabase } from './supabase'

/**
 * Sessão: qual restaurante e qual operador.
 *
 * O modelo é **um login por restaurante**, escolhido junto com o usuário: o
 * tablet fica logado na bancada e o operador só toca no próprio nome antes de
 * imprimir ou dar baixa. Autenticar cada cozinheiro por e-mail e senha
 * inviabilizaria a operação — ninguém digita senha com a mão suja no meio do
 * serviço — e a rastreabilidade que a RDC 216 pede é "quem fez", que a seleção
 * de nome já entrega.
 *
 * O app também roda **antes de existir um Supabase configurado**: nesse caso
 * cria uma organização só local, para que a cozinha possa começar a usar hoje.
 * Quando o banco for ligado, os dados locais sobem pela outbox.
 */

const CHAVE_ORG = 'abc:org-id'
const CHAVE_MEMBRO = 'abc:membro-id'

function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravarLocal(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // Janela privada ou cookies bloqueados: a sessão vira temporária, mas o app
    // continua funcionando.
  }
}

/** Pastas semeadas na primeira execução, espelhando o seed do banco. */
const PASTAS_INICIAIS = [
  { nome: 'Laticínios', cor: '#0ea5e9', icone: '🥛' },
  { nome: 'Pescados', cor: '#0891b2', icone: '🐟' },
  { nome: 'Carnes', cor: '#dc2626', icone: '🥩' },
  { nome: 'Aves', cor: '#ea580c', icone: '🍗' },
  { nome: 'Hortifrúti', cor: '#16a34a', icone: '🥬' },
  { nome: 'Molhos', cor: '#ca8a04', icone: '🥫' },
  { nome: 'Congelados', cor: '#2563eb', icone: '🧊' },
  { nome: 'Secos', cor: '#78716c', icone: '🌾' },
  { nome: 'Pré-preparo', cor: '#7c3aed', icone: '🍲' },
] as const

/**
 * Descobre (ou cria) a organização deste aparelho.
 *
 * Com Supabase configurado e sessão ativa, usa a organização do usuário. Sem
 * isso, cria uma local — é o que permite abrir o app e começar a cadastrar
 * produtos antes de qualquer configuração de servidor.
 */
export async function obterOrgId(): Promise<string> {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      const { data: vinculo } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', data.session.user.id)
        .maybeSingle()

      if (vinculo?.org_id) {
        gravarLocal(CHAVE_ORG, vinculo.org_id as string)
        return vinculo.org_id as string
      }
    }
  }

  const guardada = lerLocal(CHAVE_ORG)
  if (guardada) return guardada

  const nova = novoId()
  gravarLocal(CHAVE_ORG, nova)
  return nova
}

/**
 * Semeia as pastas se ainda não houver nenhuma.
 *
 * Passa pela outbox como qualquer outro cadastro, então as pastas criadas
 * offline sobem quando o banco for ligado. A checagem é por contagem: se um
 * segundo aparelho já sincronizou as pastas do servidor, não duplicamos.
 */
export async function semearSeVazio(orgId: string): Promise<void> {
  const total = await db.folders.where('org_id').equals(orgId).count()
  if (total > 0) return

  const agora = new Date().toISOString()
  for (const [indice, pasta] of PASTAS_INICIAIS.entries()) {
    await salvarESincronizar('folders', {
      id: novoId(),
      org_id: orgId,
      nome: pasta.nome,
      cor: pasta.cor,
      icone: pasta.icone,
      ordem: indice + 1,
      created_at: agora,
      updated_at: agora,
    })
  }
}

/** Operador escolhido no aparelho. Fica salvo até alguém trocar. */
export function membroSelecionado(): string | null {
  return lerLocal(CHAVE_MEMBRO)
}

export function selecionarMembro(id: string): void {
  gravarLocal(CHAVE_MEMBRO, id)
}
