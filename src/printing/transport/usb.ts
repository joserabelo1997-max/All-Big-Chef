import { espera, type Conexao, type OpcoesEnvio } from './tipos'

/**
 * Transporte USB via WebUSB.
 *
 * Faz sentido justamente para esta impressora: uma AIYIN de bancada, ligada na
 * tomada (127/220 V) e parada ao lado do preparo. Nesse cenário o cabo é
 * vantagem, não estorvo — o USB manda os ~19 KB de uma etiqueta em uma fração
 * do tempo do BLE, não perde pareamento e não briga com o celular que conectou
 * antes.
 *
 * ## Onde funciona
 *
 * Chrome e Edge no **Android** (com cabo OTG), Linux e ChromeOS: funciona
 * direto. No **Windows e macOS** costuma falhar ao reivindicar a interface,
 * porque o driver de impressora do sistema já tomou o dispositivo — não é bug
 * nosso, é como o sistema operacional protege o aparelho. No **iPhone** não
 * existe WebUSB de forma alguma, nem no Bluefy.
 *
 * Por isso o USB é uma alternativa, nunca o único caminho: quem não puder
 * usá-lo continua imprimindo por Bluetooth.
 */

/**
 * Classe USB de impressora. Usada para achar a interface certa quando o
 * aparelho expõe várias.
 */
const CLASSE_IMPRESSORA = 0x07

export function usbDisponivel(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

/** Diz o que fazer, e não apenas que não deu. */
export function motivoUsbIndisponivel(): string | null {
  if (typeof navigator === 'undefined') return null
  if (usbDisponivel()) return null

  const ua = navigator.userAgent
  const ehIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)

  if (ehIOS) {
    return (
      'O iPhone não permite acesso a USB pelo navegador. Use a conexão ' +
      'Bluetooth — no iPhone, pelo navegador Bluefy.'
    )
  }

  return (
    'Este navegador não tem suporte a USB. Use o Chrome no Android (com cabo ' +
    'OTG), Linux ou ChromeOS — ou conecte por Bluetooth.'
  )
}

interface SaidaEncontrada {
  interfaceNumero: number
  endpoint: number
}

/**
 * Procura a interface e o endpoint de saída em massa.
 *
 * Prioriza a interface de classe "impressora"; se não houver, aceita qualquer
 * uma com endpoint bulk de saída, porque muitos clones chineses se declaram
 * como fornecedor-específico em vez de usar a classe padrão.
 */
function acharSaida(device: USBDevice): SaidaEncontrada | null {
  const configuracao = device.configuration
  if (!configuracao) return null

  const candidatas: SaidaEncontrada[] = []

  for (const face of configuracao.interfaces) {
    for (const alternativa of face.alternates) {
      const saida = alternativa.endpoints.find(
        (e) => e.direction === 'out' && e.type === 'bulk',
      )
      if (!saida) continue

      const achado = {
        interfaceNumero: face.interfaceNumber,
        endpoint: saida.endpointNumber,
      }

      if (alternativa.interfaceClass === CLASSE_IMPRESSORA) return achado
      candidatas.push(achado)
    }
  }

  return candidatas[0] ?? null
}

/** Abre o seletor de dispositivos USB. Exige gesto do usuário. */
export async function escolherImpressoraUsb(): Promise<USBDevice> {
  if (!usbDisponivel()) {
    throw new Error(motivoUsbIndisponivel() ?? 'USB indisponível.')
  }

  // `filters: []` mostra todos os dispositivos. Filtrar por classe esconderia
  // justamente os clones que se declaram como fornecedor-específico.
  return navigator.usb.requestDevice({ filters: [] })
}

export async function conectarUsb(device: USBDevice): Promise<Conexao> {
  if (!device.opened) await device.open()

  if (!device.configuration) await device.selectConfiguration(1)

  const saida = acharSaida(device)
  if (!saida) {
    throw new Error(
      'Este dispositivo não expõe um canal de impressão por USB. ' +
        'Confira se é mesmo a impressora e não um hub ou adaptador.',
    )
  }

  try {
    await device.claimInterface(saida.interfaceNumero)
  } catch {
    // O caso comum no Windows e no macOS: o driver de impressora do sistema já
    // reivindicou o aparelho. Não há contorno pelo navegador.
    throw new Error(
      'O sistema operacional já está usando esta impressora e não a libera ' +
        'para o navegador. Isso é comum no Windows e no Mac. Conecte por ' +
        'Bluetooth, ou use o Chrome num Android com cabo OTG.',
    )
  }

  return {
    tipo: 'usb',
    nome: device.productName ?? 'Impressora USB',

    async enviar(dados, opcoes: OpcoesEnvio = {}) {
      // Pedaços bem maiores que no BLE: o USB aguenta e a etiqueta sai numa
      // fração do tempo. A pausa existe só para não estourar o buffer de
      // firmwares mais simples.
      const { tamanhoPedaco = 8192, pausaMs = 0, aoProgredir } = opcoes

      for (let i = 0; i < dados.length; i += tamanhoPedaco) {
        const pedaco = dados.slice(i, i + tamanhoPedaco)
        const resultado = await device.transferOut(saida.endpoint, pedaco as BufferSource)

        if (resultado.status !== 'ok') {
          throw new Error(`A impressora recusou o envio (${resultado.status}).`)
        }

        aoProgredir?.(Math.min(i + tamanhoPedaco, dados.length), dados.length)
        if (pausaMs > 0) await espera(pausaMs)
      }
    },

    async desconectar() {
      try {
        await device.releaseInterface(saida.interfaceNumero)
        await device.close()
      } catch {
        // Aparelho já desconectado fisicamente: nada a liberar.
      }
    },
  }
}
