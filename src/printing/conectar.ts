import type { PerfilImpressora } from './printerProfile'
import { conectarBle, escolherImpressora, motivoIndisponivel } from './transport/ble'
import type { Conexao } from './transport/tipos'
import {
  conectarUsb,
  escolherImpressoraUsb,
  motivoUsbIndisponivel,
} from './transport/usb'

/**
 * Abre a conexão que o perfil pede.
 *
 * Existe para que as telas de impressão não precisem repetir a lógica de "é BLE
 * ou USB?" cada uma à sua maneira — três cópias divergiriam na primeira
 * correção de bug.
 *
 * Exige gesto do usuário: tanto `requestDevice` quanto `requestUSBDevice` só
 * podem ser chamados a partir de um clique.
 */
export async function abrirConexao(perfil: PerfilImpressora): Promise<Conexao> {
  if (perfil.conexao === 'usb') {
    const device = await escolherImpressoraUsb()
    return conectarUsb(device)
  }

  const device = await escolherImpressora()
  return conectarBle(device, perfil.servicoUuid, perfil.caracteristicaUuid)
}

/**
 * Explica por que não dá para imprimir neste aparelho, se for o caso.
 *
 * Devolve `null` quando está tudo certo. A mensagem já vem escrita para quem
 * está na bancada, não para quem programa.
 */
export function motivoNaoPodeImprimir(perfil: PerfilImpressora | null): string | null {
  return perfil?.conexao === 'usb' ? motivoUsbIndisponivel() : motivoIndisponivel()
}

/** Cancelamento do seletor de dispositivos não é erro — é desistência. */
export function foiCancelado(erro: unknown): boolean {
  return erro instanceof Error && erro.name === 'NotFoundError'
}
