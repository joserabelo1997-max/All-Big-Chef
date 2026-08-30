import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  isAfter,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Cálculo de validade e classificação de urgência.
 *
 * Uma decisão atravessa o módulo inteiro: **a cozinha raciocina em dias de
 * calendário, não em janelas de 24 horas.** Um produto aberto às 22h de segunda
 * com 1 dia de validade vence na terça — não às 22h de terça. Quem abre a
 * geladeira na terça de manhã precisa ver "vence hoje", e não "faltam 12
 * horas". Por isso toda comparação usa `differenceInCalendarDays` e limites de
 * início/fim de dia, nunca subtração de timestamps.
 */

export type NivelValidade = 'ok' | 'atencao' | 'hoje' | 'vencido'

export interface SituacaoValidade {
  nivel: NivelValidade
  /** Dias de calendário até vencer. Negativo quando já venceu. */
  diasRestantes: number
  /** Texto curto para a interface: "vence hoje", "há 2 dias", "em 5 dias". */
  descricao: string
}

/**
 * Calcula quando o produto vence.
 *
 * A validade termina no FIM do dia alvo, não no mesmo horário da abertura. É
 * assim que a cozinha usa na prática, e é o que a etiqueta comunica ao imprimir
 * só a data: se o papel diz 02/09, o produto serve o dia 02 inteiro.
 */
export function calcularValidade(abertura: Date, diasDeValidade: number): Date {
  return endOfDay(addDays(abertura, diasDeValidade))
}

export interface LimiaresAlerta {
  /** A quantos dias do vencimento começar a avisar. Padrão 2. */
  diasAntes: number
}

export const LIMIARES_PADRAO: LimiaresAlerta = { diasAntes: 2 }

export function classificar(
  validade: Date | string,
  agora: Date = new Date(),
  limiares: LimiaresAlerta = LIMIARES_PADRAO,
): SituacaoValidade {
  const alvo = typeof validade === 'string' ? parseISO(validade) : validade
  const dias = differenceInCalendarDays(startOfDay(alvo), startOfDay(agora))

  // Vencido é decidido pelo instante exato, e não pelo dia: às 23h do dia da
  // validade o produto ainda serve, e marcá-lo como vencido faria a cozinha
  // jogar comida boa fora.
  if (isAfter(agora, alvo)) {
    return {
      nivel: 'vencido',
      diasRestantes: dias,
      descricao: descreverPassado(dias),
    }
  }

  if (dias <= 0) {
    return { nivel: 'hoje', diasRestantes: 0, descricao: 'vence hoje' }
  }

  if (dias <= limiares.diasAntes) {
    return {
      nivel: 'atencao',
      diasRestantes: dias,
      descricao: dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`,
    }
  }

  return {
    nivel: 'ok',
    diasRestantes: dias,
    descricao: `vence em ${dias} dias`,
  }
}

function descreverPassado(dias: number): string {
  const atraso = Math.abs(dias)
  if (atraso === 0) return 'venceu hoje'
  if (atraso === 1) return 'venceu ontem'
  return `venceu há ${atraso} dias`
}

/** Ordem de urgência, para listar primeiro o que exige ação. */
const PESO: Record<NivelValidade, number> = {
  vencido: 0,
  hoje: 1,
  atencao: 2,
  ok: 3,
}

export function compararUrgencia(a: SituacaoValidade, b: SituacaoValidade): number {
  const porNivel = PESO[a.nivel] - PESO[b.nivel]
  return porNivel !== 0 ? porNivel : a.diasRestantes - b.diasRestantes
}

/** Classe Tailwind do semáforo, para manter a cor consistente entre as telas. */
export const COR_DO_NIVEL: Record<NivelValidade, string> = {
  ok: 'bg-validade-ok',
  atencao: 'bg-validade-atencao',
  hoje: 'bg-validade-hoje',
  vencido: 'bg-validade-vencido',
}

export const ROTULO_DO_NIVEL: Record<NivelValidade, string> = {
  ok: 'No prazo',
  atencao: 'Vence em breve',
  hoje: 'Vence hoje',
  vencido: 'Vencida',
}

/** Data no formato que vai impresso na etiqueta. */
export function formatarData(data: Date | string): string {
  const d = typeof data === 'string' ? parseISO(data) : data
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatarDataHora(data: Date | string): string {
  const d = typeof data === 'string' ? parseISO(data) : data
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/** Versão curta para a etiqueta, onde cada milímetro conta. */
export function formatarDataCurta(data: Date | string): string {
  const d = typeof data === 'string' ? parseISO(data) : data
  return format(d, 'dd/MM/yy HH:mm', { locale: ptBR })
}
