/**
 * Edge Function `check-expiries` — dispara os avisos de validade.
 *
 * Roda no Supabase (Deno), agendada por cron, e é quem faz a notificação
 * chegar com o aplicativo FECHADO. Esse é o motivo de o app poder viver no
 * GitHub Pages sem prejuízo: o Pages só serve arquivos estáticos, mas quem
 * envia o push é este código, hospedado no Supabase.
 *
 * Por que não agendar do lado do navegador: um service worker não acorda
 * sozinho num horário. `setTimeout` morre quando a aba fecha, e a Periodic
 * Background Sync API não existe no iOS e é imprevisível no Android. Push do
 * servidor é a única forma confiável de alcançar a cozinha antes do turno.
 *
 * Segredos usados (Project Settings -> Edge Functions -> Secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * A SUPABASE_URL e a SERVICE_ROLE_KEY já vêm injetadas pelo ambiente.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Assinatura {
  id: string
  org_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface Etiqueta {
  id: string
  org_id: string
  produto_snapshot: string
  expires_at: string
}

interface Config {
  org_id: string
  alerta_dias_antes: number
  alerta_horario: string
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // A service_role ignora o RLS, o que é necessário aqui: a função varre TODAS
  // as organizações. Ela vive apenas nos secrets do Supabase e nunca chega ao
  // navegador.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:cozinha@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

/** Início do dia, em UTC, deslocado para o fuso do Brasil (UTC-3). */
function limiteEmDias(dias: number): string {
  const alvo = new Date()
  alvo.setUTCDate(alvo.getUTCDate() + dias)
  alvo.setUTCHours(23 + 3, 59, 59, 999)
  return alvo.toISOString()
}

function montarMensagem(etiquetas: Etiqueta[]): { titulo: string; corpo: string } {
  const agora = Date.now()
  const vencidas = etiquetas.filter((e) => new Date(e.expires_at).getTime() < agora)
  const proximas = etiquetas.length - vencidas.length

  const partes: string[] = []
  if (vencidas.length > 0) {
    partes.push(`${vencidas.length} ${vencidas.length === 1 ? 'vencida' : 'vencidas'}`)
  }
  if (proximas > 0) {
    partes.push(`${proximas} ${proximas === 1 ? 'vencendo' : 'vencendo'}`)
  }

  // Citar os produtos pelo nome torna o aviso acionável direto da tela de
  // bloqueio, sem precisar abrir o app para saber do que se trata.
  const nomes = etiquetas
    .slice(0, 3)
    .map((e) => e.produto_snapshot)
    .join(', ')
  const resto = etiquetas.length > 3 ? ` e mais ${etiquetas.length - 3}` : ''

  return {
    titulo: `Validades: ${partes.join(' e ')}`,
    corpo: `${nomes}${resto}.`,
  }
}

Deno.serve(async () => {
  const { data: configs } = await supabase
    .from('org_settings')
    .select('org_id, alerta_dias_antes, alerta_horario')

  const relatorio: Array<Record<string, unknown>> = []

  for (const config of (configs ?? []) as Config[]) {
    const { data: etiquetas } = await supabase
      .from('labels')
      .select('id, org_id, produto_snapshot, expires_at')
      .eq('org_id', config.org_id)
      .eq('status', 'ativa')
      .is('deleted_at', null)
      .lte('expires_at', limiteEmDias(config.alerta_dias_antes))
      .order('expires_at', { ascending: true })

    const pendentes = (etiquetas ?? []) as Etiqueta[]
    if (pendentes.length === 0) {
      relatorio.push({ org: config.org_id, enviados: 0, motivo: 'nada vencendo' })
      continue
    }

    const { data: assinaturas } = await supabase
      .from('push_subscriptions')
      .select('id, org_id, endpoint, p256dh, auth')
      .eq('org_id', config.org_id)

    const { titulo, corpo } = montarMensagem(pendentes)
    const carga = JSON.stringify({
      titulo,
      corpo,
      rota: '#/etiquetas?filtro=vencendo',
      total: pendentes.length,
    })

    let enviados = 0
    for (const assinatura of (assinaturas ?? []) as Assinatura[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: assinatura.endpoint,
            keys: { p256dh: assinatura.p256dh, auth: assinatura.auth },
          },
          carga,
        )
        enviados++
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode
        // 404/410 = assinatura morta (app desinstalado, navegador limpo).
        // Removê-la evita acumular lixo e tentar de novo para sempre.
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', assinatura.id)
        }
      }
    }

    relatorio.push({ org: config.org_id, etiquetas: pendentes.length, enviados })
  }

  return new Response(JSON.stringify({ ok: true, relatorio }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
