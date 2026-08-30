/**
 * Transporte Bluetooth Low Energy via Web Bluetooth.
 *
 * ## Por que BLE e não Bluetooth Clássico
 *
 * A Web Bluetooth API só fala BLE/GATT. Bluetooth Clássico (SPP/RFCOMM), usado
 * por impressoras Zebra, Brother QL e boa parte das Elgin, é inalcançável a
 * partir de um navegador — não existe contorno em JavaScript.
 *
 * Isso não é problema para a AIYIN: eles distribuem app para iPhone, e o iOS
 * não permite SPP sem certificação MFi, que fabricante chinês não paga. Uma
 * impressora com app de iPhone é, na prática, uma impressora BLE.
 *
 * ## Onde funciona
 *
 * Chrome e Edge no Android, Windows, macOS e ChromeOS. No iOS o Safari não
 * implementa Web Bluetooth — lá a impressão sai pelo navegador Bluefy, que
 * embarca a própria pilha Bluetooth e roda este mesmo código sem alteração.
 */

/**
 * Serviços GATT conhecidos de impressoras térmicas.
 *
 * Esta lista existe por uma limitação da API que pega muita gente: só é
 * possível ACESSAR um serviço declarado em `optionalServices` ANTES do
 * pareamento. Descobrir depois não adianta — `getPrimaryServices()` devolve
 * apenas o que foi declarado. Como não sabemos de antemão qual serviço a AIYIN
 * expõe, declaramos todos os candidatos conhecidos do mercado.
 */
export const SERVICOS_CONHECIDOS: BluetoothServiceUUID[] = [
  0x18f0, // o mais comum nas térmicas chinesas
  0xff00,
  0xffe0, // módulos HM-10 e clones
  0xfff0,
  0xae30, // visto em várias portáteis
  0xff80,
  0x1101, // porta serial mapeada em BLE por alguns firmwares
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // UART transparente ISSC/Microchip
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  // Serviços informativos, úteis no diagnóstico para identificar o modelo.
  'device_information',
  'battery_service',
]

export interface CaracteristicaEncontrada {
  servicoUuid: string
  caracteristicaUuid: string
  podeEscrever: boolean
  podeEscreverSemResposta: boolean
  podeNotificar: boolean
}

export interface DispositivoConectado {
  device: BluetoothDevice
  server: BluetoothRemoteGATTServer
}

export function bluetoothDisponivel(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Mensagem de erro que diz o que fazer, e não só o que falhou.
 *
 * Quem vai ler isso é um cozinheiro no meio do serviço, não um desenvolvedor.
 */
export function motivoIndisponivel(): string | null {
  if (typeof navigator === 'undefined') return null
  if (bluetoothDisponivel()) return null

  const ua = navigator.userAgent
  const ehIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)

  if (ehIOS) {
    return (
      'O Safari do iPhone não permite acesso a Bluetooth. Para imprimir, abra ' +
      'este mesmo endereço no navegador Bluefy (gratuito na App Store). O resto ' +
      'do aplicativo continua funcionando normalmente aqui.'
    )
  }

  if (!window.isSecureContext) {
    return (
      'O Bluetooth exige conexão segura (HTTPS). Abra o aplicativo pelo ' +
      'endereço oficial em vez de um arquivo local ou um IP sem HTTPS.'
    )
  }

  return (
    'Este navegador não tem suporte a Bluetooth. Use o Chrome no Android, ' +
    'Windows ou Mac — ou o Bluefy, no iPhone.'
  )
}

/**
 * Abre o seletor de dispositivos do navegador.
 *
 * `acceptAllDevices` porque não sabemos como a AIYIN se anuncia: o nome varia
 * por lote de fabricação e filtrar por prefixo esconderia justamente a
 * impressora que queremos achar.
 *
 * Exige gesto do usuário — só pode ser chamado a partir de um clique.
 */
export async function escolherImpressora(): Promise<BluetoothDevice> {
  if (!bluetoothDisponivel()) {
    throw new Error(motivoIndisponivel() ?? 'Bluetooth indisponível.')
  }

  return navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICOS_CONHECIDOS,
  })
}

export async function conectar(device: BluetoothDevice): Promise<DispositivoConectado> {
  if (!device.gatt) throw new Error('Dispositivo sem interface GATT.')
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  return { device, server }
}

/**
 * Varre tudo que o dispositivo expõe.
 *
 * É o que sustenta a tela de Diagnóstico: em vez de chutar os UUIDs da AIYIN a
 * partir de documentação que o fabricante não publica, perguntamos à própria
 * impressora e deixamos a pessoa testar os candidatos.
 */
export async function inspecionar(
  server: BluetoothRemoteGATTServer,
): Promise<CaracteristicaEncontrada[]> {
  const achados: CaracteristicaEncontrada[] = []

  let servicos: BluetoothRemoteGATTService[]
  try {
    servicos = await server.getPrimaryServices()
  } catch {
    // Alguns firmwares recusam a enumeração geral mas respondem por UUID.
    servicos = []
    for (const uuid of SERVICOS_CONHECIDOS) {
      try {
        servicos.push(await server.getPrimaryService(uuid))
      } catch {
        // Serviço ausente neste modelo: seguir adiante é o comportamento certo.
      }
    }
  }

  for (const servico of servicos) {
    let caracteristicas: BluetoothRemoteGATTCharacteristic[]
    try {
      caracteristicas = await servico.getCharacteristics()
    } catch {
      continue
    }

    for (const c of caracteristicas) {
      achados.push({
        servicoUuid: servico.uuid,
        caracteristicaUuid: c.uuid,
        podeEscrever: c.properties.write,
        podeEscreverSemResposta: c.properties.writeWithoutResponse,
        podeNotificar: c.properties.notify,
      })
    }
  }

  return achados
}

/** Ordena os candidatos deixando primeiro o que mais provavelmente imprime. */
export function ranquearCandidatos(
  achados: CaracteristicaEncontrada[],
): CaracteristicaEncontrada[] {
  const escrevíveis = achados.filter((a) => a.podeEscrever || a.podeEscreverSemResposta)

  return escrevíveis.sort((a, b) => pontuar(b) - pontuar(a))

  function pontuar(c: CaracteristicaEncontrada): number {
    let pontos = 0
    // writeWithoutResponse é o modo de fluxo contínuo: sem ele, cada pedaço
    // espera confirmação e a etiqueta leva dezenas de segundos para sair.
    if (c.podeEscreverSemResposta) pontos += 3
    if (c.podeEscrever) pontos += 1
    // Serviços genéricos do Bluetooth nunca são a via de impressão.
    if (/0000180[0-9a-f]/i.test(c.servicoUuid)) pontos -= 10
    if (/000018f0/i.test(c.servicoUuid)) pontos += 4
    if (/0000ff(00|e0|f0)/i.test(c.servicoUuid)) pontos += 3
    if (/49535343/i.test(c.servicoUuid)) pontos += 3
    return pontos
  }
}

export interface OpcoesEnvio {
  /**
   * Bytes por escrita. O MTU negociado não é exposto pela Web Bluetooth, então
   * usamos um valor conservador: 182 cabe no MTU mínimo estendido da maioria
   * das impressoras. Pedaços maiores travam firmwares mais simples no meio da
   * etiqueta, deixando meia impressão no papel.
   */
  tamanhoPedaco?: number
  /** Pausa entre escritas, em ms. Dá tempo do buffer da impressora escoar. */
  pausaMs?: number
  aoProgredir?: (enviados: number, total: number) => void
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Envia os bytes em pedaços.
 *
 * Preferimos `writeValueWithoutResponse` porque impressão é fluxo unidirecional
 * e esperar confirmação a cada pedaço multiplica o tempo total. Nem todo
 * firmware suporta, então caímos para a escrita com resposta quando necessário.
 */
export async function enviar(
  caracteristica: BluetoothRemoteGATTCharacteristic,
  dados: Uint8Array,
  opcoes: OpcoesEnvio = {},
): Promise<void> {
  const { tamanhoPedaco = 182, pausaMs = 12, aoProgredir } = opcoes

  const semResposta = caracteristica.properties.writeWithoutResponse
  const escrever = async (pedaco: Uint8Array) => {
    if (semResposta) await caracteristica.writeValueWithoutResponse(pedaco as BufferSource)
    else await caracteristica.writeValue(pedaco as BufferSource)
  }

  for (let i = 0; i < dados.length; i += tamanhoPedaco) {
    const pedaco = dados.slice(i, i + tamanhoPedaco)

    try {
      await escrever(pedaco)
    } catch (erro) {
      // Uma falha isolada costuma ser buffer cheio, não desconexão. Uma nova
      // tentativa com folga resolve; a segunda falha é real e deve subir.
      await espera(pausaMs * 6)
      await escrever(pedaco)
      void erro
    }

    aoProgredir?.(Math.min(i + tamanhoPedaco, dados.length), dados.length)
    if (pausaMs > 0) await espera(pausaMs)
  }
}

/** Localiza a característica de escrita a partir dos UUIDs salvos no perfil. */
export async function obterCaracteristica(
  server: BluetoothRemoteGATTServer,
  servicoUuid: string,
  caracteristicaUuid: string,
): Promise<BluetoothRemoteGATTCharacteristic> {
  const servico = await server.getPrimaryService(servicoUuid)
  return servico.getCharacteristic(caracteristicaUuid)
}
