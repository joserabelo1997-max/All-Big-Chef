import { CODIFICADORES } from './encoders'
import { paraMonocromatico } from './monochrome'
import type { PerfilImpressora } from './printerProfile'
import { renderizarEtiqueta } from './renderer'
import type { DadosEtiqueta, ModeloEtiqueta } from './template'
import { conectar, enviar, obterCaracteristica } from './transport/ble'

/**
 * Amarra o pipeline inteiro: modelo + dados → canvas → bitmap → bytes → BLE.
 *
 * Está separado das telas de propósito. A impressão em lote, o botão de teste do
 * diagnóstico e a impressão avulsa chamam exatamente o mesmo caminho, então um
 * ajuste de densidade ou de fatiamento vale para todos sem precisar lembrar de
 * três lugares.
 */

export interface ProgressoImpressao {
  etapa: 'renderizando' | 'conectando' | 'enviando' | 'concluido'
  enviados?: number
  total?: number
}

/** Converte modelo + dados nos bytes que a impressora entende. */
export async function gerarBytes(
  modelo: ModeloEtiqueta,
  dados: DadosEtiqueta,
  perfil: PerfilImpressora,
  copias = 1,
): Promise<{ bytes: Uint8Array; largura: number; altura: number }> {
  const { rgba, largura, altura } = await renderizarEtiqueta(modelo, dados, {
    dpi: perfil.dpi,
  })

  // Sem dithering: é o padrão certo aqui. Difusão de erro em texto pequeno
  // produz borda serrilhada e, num QR Code, chega a impedir a leitura.
  const bitmap = paraMonocromatico(rgba, largura, altura)

  const codificar = CODIFICADORES[perfil.linguagem]
  const bytes = codificar(bitmap, {
    larguraMm: perfil.larguraMm,
    alturaMm: perfil.alturaMm,
    dpi: perfil.dpi,
    copias,
    densidade: perfil.densidade,
    gapMm: perfil.gapMm,
  })

  return { bytes, largura, altura }
}

/** Renderiza, codifica e envia para a impressora já pareada. */
export async function imprimir(
  device: BluetoothDevice,
  modelo: ModeloEtiqueta,
  dados: DadosEtiqueta,
  perfil: PerfilImpressora,
  opcoes: { copias?: number; aoProgredir?: (p: ProgressoImpressao) => void } = {},
): Promise<void> {
  const { copias = 1, aoProgredir } = opcoes

  aoProgredir?.({ etapa: 'renderizando' })
  const { bytes } = await gerarBytes(modelo, dados, perfil, copias)

  aoProgredir?.({ etapa: 'conectando' })
  const { server } = await conectar(device)
  const caracteristica = await obterCaracteristica(
    server,
    perfil.servicoUuid,
    perfil.caracteristicaUuid,
  )

  aoProgredir?.({ etapa: 'enviando', enviados: 0, total: bytes.length })
  await enviar(caracteristica, bytes, {
    tamanhoPedaco: perfil.tamanhoPedaco,
    pausaMs: perfil.pausaMs,
    aoProgredir: (enviados, total) =>
      aoProgredir?.({ etapa: 'enviando', enviados, total }),
  })

  aoProgredir?.({ etapa: 'concluido' })
}
