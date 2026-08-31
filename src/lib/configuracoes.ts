import type { Configuracoes } from '../domain/types'
import { db } from './db'
import { supabase } from './supabase'

/**
 * Preferências do restaurante.
 *
 * Guardadas no Dexie e replicadas ao Supabase quando há rede, para que o
 * segundo aparelho da cozinha já abra com os mesmos limiares de alerta.
 */

export interface PreferenciasAlerta {
  /** A quantos dias do vencimento começar a avisar. */
  diasAntes: number
  /** Horário do aviso diário, em HH:MM. */
  horario: string
  /**
   * Dias da semana em que a casa fecha: 0 = domingo … 6 = sábado.
   *
   * Alimenta o aviso "vence com a casa fechada" — o que vence enquanto a porta
   * está fechada precisa ser resolvido na véspera, não no dia.
   */
  diasFechados: number[]
}

export const PREFERENCIAS_PADRAO: PreferenciasAlerta = {
  diasAntes: 2,
  horario: '08:00',
  diasFechados: [],
}

export async function lerPreferencias(orgId: string): Promise<PreferenciasAlerta> {
  const salvas = await db.org_settings.get(orgId)
  return salvas
    ? {
        diasAntes: salvas.alerta_dias_antes,
        horario: salvas.alerta_horario.slice(0, 5),
        // Registro gravado antes desta versão não tem o campo.
        diasFechados: salvas.dias_fechados ?? [],
      }
    : PREFERENCIAS_PADRAO
}

export async function salvarPreferencias(
  orgId: string,
  preferencias: PreferenciasAlerta,
): Promise<void> {
  await gravar(orgId, (anteriores, agora) => ({
    alerta_dias_antes: preferencias.diasAntes,
    alerta_horario: `${preferencias.horario}:00`,
    dias_fechados: preferencias.diasFechados,
    mensagem_pedido: anteriores?.mensagem_pedido ?? null,
    default_template_id: anteriores?.default_template_id ?? null,
    printer_profile: anteriores?.printer_profile ?? null,
    created_at: anteriores?.created_at ?? agora,
  }))
}

/** Modelo da mensagem enviada ao fornecedor pelo WhatsApp. */
export async function salvarMensagemPedido(orgId: string, modelo: string): Promise<void> {
  await gravar(orgId, (anteriores, agora) => ({
    alerta_dias_antes: anteriores?.alerta_dias_antes ?? PREFERENCIAS_PADRAO.diasAntes,
    alerta_horario: anteriores?.alerta_horario ?? `${PREFERENCIAS_PADRAO.horario}:00`,
    dias_fechados: anteriores?.dias_fechados ?? [],
    // Texto vazio volta ao modelo padrão em vez de gravar uma mensagem em
    // branco, que abriria o WhatsApp sem nada escrito.
    mensagem_pedido: modelo.trim() || null,
    default_template_id: anteriores?.default_template_id ?? null,
    printer_profile: anteriores?.printer_profile ?? null,
    created_at: anteriores?.created_at ?? agora,
  }))
}

/**
 * Grava o registro único de configurações, local e remotamente.
 *
 * Configurações não passam pela outbox: são um registro único por organização,
 * sem ordem a preservar, e perder a réplica remota de uma preferência é
 * irrelevante perto de manter a fila de etiquetas simples.
 */
async function gravar(
  orgId: string,
  montar: (
    anteriores: Configuracoes | undefined,
    agora: string,
  ) => Omit<Configuracoes, 'org_id' | 'updated_at'>,
): Promise<void> {
  const agora = new Date().toISOString()
  const anteriores = await db.org_settings.get(orgId)

  const registro: Configuracoes = {
    org_id: orgId,
    ...montar(anteriores, agora),
    updated_at: agora,
  }

  await db.org_settings.put(registro)

  if (supabase) {
    await supabase.from('org_settings').upsert(registro, { onConflict: 'org_id' })
  }
}
