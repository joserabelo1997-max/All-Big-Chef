import { novoId } from '../lib/ids'
import { supabase } from '../lib/supabase'

/**
 * Assinatura de Web Push para os alertas de validade.
 *
 * Quem dispara a notificação é uma Edge Function agendada NO SUPABASE, não o
 * site — por isso o app funcionar no GitHub Pages, que não roda servidor, não
 * impede o push de chegar com o aplicativo fechado.
 *
 * ## iPhone
 *
 * O iOS só entrega Web Push quando o app foi INSTALADO na tela de início pelo
 * Safari (iOS 16.4+). Instalado por outro navegador não vale, e aberto como
 * aba comum também não. Como a impressão exige o Bluefy, o arranjo final é:
 * Safari instala o app e recebe os alertas; Bluefy imprime.
 */

const CHAVE_VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type EstadoPush =
  | 'indisponivel'
  | 'precisa-instalar'
  | 'nao-configurado'
  | 'negado'
  | 'desativado'
  | 'ativo'

/** Converte a chave VAPID de base64url para os bytes que a API exige. */
function base64UrlParaBytes(base64: string): Uint8Array {
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const normal = preenchido.replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(normal)
  const bytes = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

function ehIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

/** True quando o app está rodando instalado, e não como aba do navegador. */
function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  )
}

export async function estadoAtual(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // No iPhone a causa quase sempre é o app não estar instalado, e essa
    // distinção muda completamente a orientação que damos à pessoa.
    return ehIOS() && !estaInstalado() ? 'precisa-instalar' : 'indisponivel'
  }

  if (!CHAVE_VAPID) return 'nao-configurado'
  if (Notification.permission === 'denied') return 'negado'

  const registro = await navigator.serviceWorker.ready
  const assinatura = await registro.pushManager.getSubscription()
  return assinatura ? 'ativo' : 'desativado'
}

/**
 * Pede permissão, assina o push e guarda a assinatura no Supabase.
 *
 * A assinatura é por aparelho: o tablet da bancada e o celular do chef são duas
 * linhas distintas, e cada um recebe o alerta.
 */
export async function ativar(orgId: string): Promise<EstadoPush> {
  if (!CHAVE_VAPID) return 'nao-configurado'

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desativado'

  const registro = await navigator.serviceWorker.ready
  const assinatura =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Obrigatório: todo push precisa gerar uma notificação visível. É também
      // o comportamento que queremos — nenhum push aqui é silencioso.
      userVisibleOnly: true,
      applicationServerKey: base64UrlParaBytes(CHAVE_VAPID) as BufferSource,
    }))

  const dados = assinatura.toJSON()
  if (!dados.endpoint || !dados.keys?.p256dh || !dados.keys.auth) {
    throw new Error('O navegador devolveu uma assinatura incompleta.')
  }

  if (supabase) {
    // `onConflict: endpoint` porque reinstalar o app gera a mesma assinatura:
    // sem isso, o mesmo aparelho acumularia linhas e receberia duplicado.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        id: novoId(),
        org_id: orgId,
        endpoint: dados.endpoint,
        p256dh: dados.keys.p256dh,
        auth: dados.keys.auth,
        descricao: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw new Error(`Falha ao registrar o aparelho: ${error.message}`)
  }

  return 'ativo'
}

export async function desativar(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.ready
  const assinatura = await registro.pushManager.getSubscription()
  if (!assinatura) return 'desativado'

  const endpoint = assinatura.endpoint
  await assinatura.unsubscribe()

  if (supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }

  return 'desativado'
}

/** Mensagem acionável para cada estado, em vez de um "indisponível" seco. */
export const EXPLICACAO: Record<EstadoPush, string> = {
  ativo: 'Este aparelho receberá os avisos de validade, mesmo com o app fechado.',
  desativado: 'Este aparelho não está recebendo avisos.',
  negado:
    'As notificações foram bloqueadas para este site. Reative nas configurações ' +
    'do navegador e volte aqui.',
  'precisa-instalar':
    'No iPhone, os avisos só funcionam com o app instalado na tela de início. ' +
    'Abra este endereço no Safari, toque em Compartilhar e escolha "Adicionar à ' +
    'Tela de Início".',
  'nao-configurado':
    'As chaves de notificação ainda não foram configuradas no projeto. ' +
    'Veja docs/SETUP_SUPABASE.md.',
  indisponivel: 'Este navegador não suporta notificações.',
}
