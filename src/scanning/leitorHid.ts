/**
 * Reconhecimento de leitor de código de barras em modo teclado (HID).
 *
 * Leitores Bluetooth como o Goldensky GS-CH6 são vistos pelo sistema como um
 * TECLADO: ao escanear, eles "digitam" o conteúdo do código e dão Enter. Isso é
 * uma vantagem enorme e pouco óbvia — os três modos de conexão do aparelho
 * (Bluetooth HID, adaptador 2.4G e cabo USB) são todos modos de teclado, então
 * uma implementação só cobre os três, sem uma linha de Bluetooth.
 *
 * E, principalmente: **funciona no iPhone**. Não passa por Web Bluetooth, então
 * não depende de beacio nem de Bluefy. O pareamento é do sistema operacional.
 *
 * O truque é distinguir o leitor de uma pessoa digitando. Um leitor emite os
 * caracteres em rajada, com poucos milissegundos entre eles e uma regularidade
 * que mão humana não alcança; gente digitando tem pausas irregulares e bem mais
 * longas. É só isso que separa os dois.
 */

/** Intervalo máximo entre teclas para ainda contar como rajada de leitor. */
const INTERVALO_MAXIMO_MS = 50

/** Mínimo de caracteres. Abaixo disso é atalho de teclado, não leitura. */
const TAMANHO_MINIMO = 4

export interface OpcoesLeitor {
  intervaloMaximoMs?: number
  tamanhoMinimo?: number
}

export interface EstadoLeitura {
  buffer: string
  ultimaTeclaEm: number
}

export const ESTADO_INICIAL: EstadoLeitura = { buffer: '', ultimaTeclaEm: 0 }

export interface ResultadoTecla {
  estado: EstadoLeitura
  /** Preenchido só quando a rajada fecha em Enter e passa nos critérios. */
  codigo?: string
}

/**
 * Processa uma tecla e devolve o novo estado.
 *
 * Função pura, com o relógio recebido por parâmetro, justamente para que a
 * heurística de tempo — a parte que decide tudo — possa ser testada sem DOM e
 * sem esperar de verdade.
 */
export function processarTecla(
  estado: EstadoLeitura,
  tecla: string,
  agora: number,
  opcoes: OpcoesLeitor = {},
): ResultadoTecla {
  const {
    intervaloMaximoMs = INTERVALO_MAXIMO_MS,
    tamanhoMinimo = TAMANHO_MINIMO,
  } = opcoes

  const intervalo = agora - estado.ultimaTeclaEm
  const dentroDaRajada = estado.buffer.length > 0 && intervalo <= intervaloMaximoMs

  if (tecla === 'Enter') {
    // Enter fecha a leitura — mas só vale se o Enter também veio na rajada.
    // Alguém que digitou devagar e apertou Enter não pode virar uma leitura.
    if (dentroDaRajada && estado.buffer.length >= tamanhoMinimo) {
      return { estado: ESTADO_INICIAL, codigo: estado.buffer }
    }
    return { estado: ESTADO_INICIAL }
  }

  // Só caracteres imprimíveis entram. Shift, Alt, F5 e afins têm nome com mais
  // de um caractere e são ignorados sem quebrar a rajada em andamento.
  if (tecla.length !== 1) return { estado }

  // Uma pausa longa reinicia a contagem a partir desta tecla: assim a digitação
  // humana nunca se acumula até virar uma leitura por acidente.
  const buffer = dentroDaRajada ? estado.buffer + tecla : tecla

  return { estado: { buffer, ultimaTeclaEm: agora } }
}

/**
 * Diz se o foco está num campo editável.
 *
 * Quando está, o leitor é deixado em paz para digitar no campo — é o que a
 * pessoa quis ao tocar ali. Sequestrar a leitura nesse caso faria o texto sumir
 * do campo sem explicação.
 */
export function focoEmCampoEditavel(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  const etiqueta = alvo.tagName
  return (
    etiqueta === 'INPUT' ||
    etiqueta === 'TEXTAREA' ||
    etiqueta === 'SELECT' ||
    alvo.isContentEditable
  )
}
