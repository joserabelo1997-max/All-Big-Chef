import { imprimir, type ProgressoImpressao } from './imprimir'
import type { PerfilImpressora } from './printerProfile'
import type { DadosEtiqueta, ModeloEtiqueta } from './template'
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
  if (perfil?.conexao === 'usb') return motivoUsbIndisponivel()
  // A NIIMBOT é BLE como as outras, então o motivo de indisponibilidade é o
  // mesmo — o que muda depois é a língua, não o rádio.
  return motivoIndisponivel()
}

/** Cancelamento do seletor de dispositivos não é erro — é desistência. */
export function foiCancelado(erro: unknown): boolean {
  return erro instanceof Error && erro.name === 'NotFoundError'
}

/**
 * Um trabalho de impressão, seja qual for a impressora.
 *
 * Existe porque a NIIMBOT quebrou a premissa de `Conexao`. As outras três
 * linguagens são "monte os bytes e despeje"; a NIIMBOT conduz uma conversa e
 * decide sozinha quando a página saiu. As telas não deviam ter que saber disso
 * — elas querem "imprima esta etiqueta N vezes".
 */
export interface TrabalhoDeImpressao {
  /** Nome para exibir enquanto imprime. */
  nome: string
  imprimirEtiqueta(
    modelo: ModeloEtiqueta,
    dados: DadosEtiqueta,
    copias: number,
    aoProgredir?: (p: ProgressoImpressao) => void,
  ): Promise<void>
  fechar(): Promise<void>
}

/**
 * Abre o trabalho que o perfil pede.
 *
 * Exige gesto do usuário nos dois caminhos: tanto `requestDevice` quanto
 * `requestUSBDevice` só podem ser chamados a partir de um clique.
 */
export async function abrirTrabalho(
  perfil: PerfilImpressora,
): Promise<TrabalhoDeImpressao> {
  if (perfil.conexao === 'niimbot') {
    const { conectarNiimbot } = await import('./niimbot')
    const impressora = await conectarNiimbot()

    return {
      nome: impressora.modelo,
      imprimirEtiqueta: (modelo, dados, copias, aoProgredir) =>
        impressora.imprimir(modelo, dados, perfil, {
          copias,
          // As etapas da NIIMBOT são mais detalhadas que as do fluxo comum;
          // reduzimos ao vocabulário que as telas já sabem mostrar.
          aoProgredir: (p) =>
            aoProgredir?.({
              etapa: p.etapa === 'concluido' ? 'concluido' : 'enviando',
            }),
        }),
      fechar: () => impressora.desconectar(),
    }
  }

  const conexao = await abrirConexao(perfil)
  return {
    nome: conexao.nome,
    imprimirEtiqueta: (modelo, dados, copias, aoProgredir) =>
      imprimir(conexao, modelo, dados, perfil, { copias, aoProgredir }),
    fechar: () => conexao.desconectar(),
  }
}
