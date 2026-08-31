import { TABELAS_APPEND_ONLY, TABELAS_SINCRONIZADAS } from '../domain/types'

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
        const doServidor = vinculo.org_id as string

        // Entrou pela primeira vez tendo já usado o app offline: o cadastro
        // está sob uma organização local que o servidor não conhece. Sem esta
        // adoção ele ficaria órfão e nunca subiria.
        const anterior = lerLocal(CHAVE_ORG)
        if (anterior && anterior !== doServidor) {
          await adotarOrganizacao(anterior, doServidor)
        }

        gravarLocal(CHAVE_ORG, doServidor)
        return doServidor
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

/**
 * Passa todo o cadastro local para a organização do servidor.
 *
 * O app roda antes de existir Supabase: nesse período ele cria uma organização
 * **local**, com id aleatório, e tudo é cadastrado sob ela. Quando o restaurante
 * finalmente entra, o id no servidor é outro — e sem esta função o cadastro
 * inteiro ficaria órfão, apontando para uma organização que o banco não conhece,
 * sem nunca subir. O comentário no topo deste arquivo promete que "os dados
 * locais sobem pela outbox"; é aqui que a promessa se cumpre.
 *
 * Duas decisões que sustentam a segurança da migração:
 *
 * 1. **A ordem é a de `TABELAS_SINCRONIZADAS`**, que já vai de pastas a
 *    etiquetas, seguida dos livros-razão. É a ordem das chaves estrangeiras: um
 *    evento não pode chegar ao servidor antes da etiqueta que ele referencia.
 * 2. **A fila antiga da organização local é descartada e refeita.** Aquelas
 *    entradas carregam uma cópia do registro com o `org_id` velho dentro; subir
 *    isso criaria linhas com organização inexistente. Reenfileirar tudo é
 *    seguro porque o envio é upsert por id — repetir não duplica.
 *
 * Devolve quantas linhas foram migradas.
 */
export async function adotarOrganizacao(
  orgLocal: string,
  orgServidor: string,
): Promise<number> {
  if (orgLocal === orgServidor) return 0

  const tabelas = [...TABELAS_SINCRONIZADAS, ...TABELAS_APPEND_ONLY]
  let migradas = 0

  await db.transaction(
    'rw',
    [...tabelas.map((t) => db.table(t)), db.org_settings, db.outbox],
    async () => {
      // Descarta a fila da organização velha antes de refazê-la. Filtra pelo
      // org_id de dentro do registro para não tocar em pendência de outra
      // organização, caso o aparelho tenha sido usado por mais de uma.
      const fila = await db.outbox.toArray()
      for (const op of fila) {
        if (op.seq !== undefined && op.dados.org_id === orgLocal) {
          await db.outbox.delete(op.seq)
        }
      }

      const agora = new Date().toISOString()

      for (const tabela of tabelas) {
        const linhas = (await db
          .table(tabela)
          .where('org_id')
          .equals(orgLocal)
          .toArray()) as Array<Record<string, unknown> & { id: string }>

        for (const linha of linhas) {
          const migrada = { ...linha, org_id: orgServidor }
          await db.table(tabela).put(migrada)
          // A linha antiga precisa sair: a chave primária é o id, que não muda,
          // então o `put` já a substituiu. Nada a apagar aqui.
          await db.outbox.add({
            tabela,
            operacao: 'upsert',
            registroId: linha.id,
            dados: migrada,
            criadoEm: agora,
            tentativas: 0,
          })
          migradas++
        }
      }

      // `org_settings` é a exceção: a chave primária é o próprio org_id, então
      // mudar de organização é apagar e recriar, não atualizar no lugar.
      const preferencias = await db.org_settings.get(orgLocal)
      if (preferencias) {
        await db.org_settings.delete(orgLocal)
        await db.org_settings.put({ ...preferencias, org_id: orgServidor })
        migradas++
      }
    },
  )

  gravarLocal(CHAVE_ORG, orgServidor)
  return migradas
}

/** Operador escolhido no aparelho. Fica salvo até alguém trocar. */
export function membroSelecionado(): string | null {
  return lerLocal(CHAVE_MEMBRO)
}

export function selecionarMembro(id: string): void {
  gravarLocal(CHAVE_MEMBRO, id)
}
