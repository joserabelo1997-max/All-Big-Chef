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
}

export const PREFERENCIAS_PADRAO: PreferenciasAlerta = {
  diasAntes: 2,
  horario: '08:00',
}

export async function lerPreferencias(orgId: string): Promise<PreferenciasAlerta> {
  const salvas = await db.org_settings.get(orgId)
  return salvas
    ? { diasAntes: salvas.alerta_dias_antes, horario: salvas.alerta_horario.slice(0, 5) }
    : PREFERENCIAS_PADRAO
}

export async function salvarPreferencias(
  orgId: string,
  preferencias: PreferenciasAlerta,
): Promise<void> {
  const agora = new Date().toISOString()
  const anteriores = await db.org_settings.get(orgId)

  const registro = {
    org_id: orgId,
    alerta_dias_antes: preferencias.diasAntes,
    alerta_horario: `${preferencias.horario}:00`,
    default_template_id: anteriores?.default_template_id ?? null,
    printer_profile: anteriores?.printer_profile ?? null,
    created_at: anteriores?.created_at ?? agora,
    updated_at: agora,
  }

  await db.org_settings.put(registro)

  // Configurações não passam pela outbox: são um registro único por
  // organização, sem ordem a preservar, e perder a réplica remota de uma
  // preferência é irrelevante perto de manter a fila de etiquetas simples.
  if (supabase) {
    await supabase.from('org_settings').upsert(registro, { onConflict: 'org_id' })
  }
}
