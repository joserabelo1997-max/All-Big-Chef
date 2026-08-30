/**
 * Leitura de QR Code pela câmera.
 *
 * Usa a `BarcodeDetector` nativa quando existe (Chrome no Android — decodifica
 * no código nativo, gasta menos bateria e aquece menos o aparelho) e cai para o
 * ZXing em JavaScript quando não existe.
 *
 * O fallback não é detalhe: o Safari e o Bluefy, no iPhone, não têm
 * `BarcodeDetector`. Sem o ZXing, dar baixa por QR simplesmente não
 * funcionaria em nenhum iPhone.
 *
 * O ZXing é carregado sob demanda, e não no topo do módulo. São ~250 KB de
 * JavaScript que o Chrome no Android nunca precisa baixar, já que ali o
 * decodificador nativo dá conta — e numa cozinha com Wi-Fi ruim, cada
 * quilobyte do primeiro carregamento conta.
 */

export interface ControleLeitura {
  parar: () => void
}

type AoLer = (texto: string) => void

interface DetectorDeCodigo {
  detect: (fonte: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}

interface JanelaComDetector {
  BarcodeDetector?: new (opcoes: { formats: string[] }) => DetectorDeCodigo
}

function detectorNativo(): DetectorDeCodigo | null {
  const global = window as unknown as JanelaComDetector
  if (!global.BarcodeDetector) return null
  try {
    return new global.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Liga a câmera e chama `aoLer` a cada código reconhecido.
 *
 * Pede a câmera TRASEIRA (`facingMode: 'environment'`): a pessoa aponta o
 * aparelho para a etiqueta no pote, não para o próprio rosto.
 */
export async function iniciarLeitura(
  video: HTMLVideoElement,
  aoLer: AoLer,
): Promise<ControleLeitura> {
  const nativo = detectorNativo()

  if (nativo) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })
    video.srcObject = stream
    await video.play()

    let ativo = true
    let quadro = 0

    const varrer = async () => {
      if (!ativo) return
      // Analisa 1 quadro a cada 4: decodificar 60 vezes por segundo esquenta o
      // aparelho sem melhorar em nada a percepção de rapidez.
      if (quadro++ % 4 === 0 && video.readyState >= 2) {
        try {
          const codigos = await nativo.detect(video)
          const primeiro = codigos[0]
          if (primeiro?.rawValue) aoLer(primeiro.rawValue)
        } catch {
          // Quadro ilegível (desfoque, movimento) é rotina: seguir adiante.
        }
      }
      if (ativo) requestAnimationFrame(() => void varrer())
    }
    void varrer()

    return {
      parar: () => {
        ativo = false
        for (const trilha of stream.getTracks()) trilha.stop()
        video.srcObject = null
      },
    }
  }

  const { BrowserQRCodeReader } = await import('@zxing/browser')
  const leitor = new BrowserQRCodeReader()
  let controles: Awaited<ReturnType<typeof leitor.decodeFromConstraints>> | null = null

  controles = await leitor.decodeFromConstraints(
    { video: { facingMode: 'environment' } },
    video,
    (resultado) => {
      if (resultado) aoLer(resultado.getText())
    },
  )

  return { parar: () => controles?.stop() }
}

/**
 * Extrai o id da etiqueta do conteúdo lido.
 *
 * Aceita tanto a URL completa impressa no QR quanto um uuid solto, porque
 * etiquetas antigas ou coladas por outro sistema podem trazer só o id.
 */
export function extrairIdDaEtiqueta(conteudo: string): string | null {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const achado = conteudo.match(uuid)
  return achado ? achado[0].toLowerCase() : null
}
