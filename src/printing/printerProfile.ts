import type { LinguagemImpressora } from './encoders'

/**
 * O que a tela de Diagnóstico descobriu sobre a etiquetadora.
 *
 * Guardado no Supabase (`org_settings.printer_profile`) e não no localStorage:
 * assim o segundo aparelho da cozinha já pareia sabendo os parâmetros certos,
 * em vez de repetir a descoberta. O `deviceId` é a exceção — é local por
 * navegador e não faz sentido compartilhar.
 */
export interface PerfilImpressora {
  /** Nome anunciado pelo aparelho, só para exibir. */
  nome: string
  /**
   * Por onde falar com a impressora.
   *
   * A AIYIN de bancada aceita as duas vias. O USB é mais rápido e não depende
   * de pareamento, mas exige cabo e não existe no iPhone; o Bluetooth alcança
   * qualquer aparelho. Quem decide é a cozinha, no diagnóstico.
   */
  conexao: 'ble' | 'usb'
  /** Usados apenas na conexão Bluetooth. */
  servicoUuid: string
  caracteristicaUuid: string
  linguagem: LinguagemImpressora
  /** 203 ou 300 nas portáteis. Errar aqui imprime a etiqueta em escala errada. */
  dpi: number
  larguraMm: number
  alturaMm: number
  gapMm: number
  densidade: number
  /** Bytes por escrita BLE. Reduza se a impressão sair cortada no meio. */
  tamanhoPedaco: number
  pausaMs: number
}

export const PERFIL_PADRAO: PerfilImpressora = {
  nome: '',
  conexao: 'ble',
  servicoUuid: '',
  caracteristicaUuid: '',
  // TSPL primeiro porque domina as etiquetadoras de rolo, que são as que
  // entendem o conceito de etiqueta de 60 × 40 com gap entre elas.
  linguagem: 'tspl',
  dpi: 203,
  larguraMm: 60,
  alturaMm: 40,
  gapMm: 2,
  densidade: 8,
  tamanhoPedaco: 182,
  pausaMs: 12,
}

const CHAVE_LOCAL = 'abc:perfil-impressora'

/**
 * Cópia local do perfil.
 *
 * Existe para que a impressão funcione offline e antes do primeiro login — a
 * cozinha não pode ficar sem etiquetar porque o Wi-Fi caiu. O Supabase continua
 * sendo a fonte de verdade quando há rede.
 */
export function lerPerfilLocal(): PerfilImpressora | null {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCAL)
    if (!bruto) return null
    return { ...PERFIL_PADRAO, ...(JSON.parse(bruto) as Partial<PerfilImpressora>) }
  } catch {
    // localStorage bloqueado (janela privada, cookies desativados) não pode
    // derrubar a tela de impressão.
    return null
  }
}

export function salvarPerfilLocal(perfil: PerfilImpressora): void {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(perfil))
  } catch {
    // Perder o cache local é aceitável; o perfil vive no Supabase.
  }
}

export function perfilEstaCompleto(
  perfil: PerfilImpressora | null,
): perfil is PerfilImpressora {
  if (!perfil) return false
  // No USB não há UUID a guardar: o dispositivo é escolhido na hora, pelo
  // seletor do navegador, e o endpoint é descoberto na conexão.
  if (perfil.conexao === 'usb') return true
  return Boolean(perfil.servicoUuid && perfil.caracteristicaUuid)
}
