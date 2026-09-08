import { paraMonocromatico } from './monochrome'
import type { PerfilImpressora } from './printerProfile'
import { renderizarEtiqueta } from './renderer'
import type { DadosEtiqueta, ModeloEtiqueta } from './template'

/**
 * Impressão em etiquetadoras NIIMBOT (B1, B21, D11, …).
 *
 * ## Por que este arquivo existe separado dos codificadores
 *
 * TSPL, ESC/POS e CPCL são fluxos de mão única: monta-se um bloco de bytes e
 * despeja-se na conexão. A NIIMBOT não é assim. Ela exige uma CONVERSA:
 *
 *   1. aperto de mão e identificação do modelo;
 *   2. densidade e tipo de papel;
 *   3. início do trabalho, início da página, dimensões;
 *   4. a imagem, linha a linha;
 *   5. fim da página, e então **perguntar** de tempos em tempos se já saiu.
 *
 * Os pacotes têm forma própria — `55 55 <cmd> <tam> <dados…> <XOR> AA AA` — e
 * a impressora responde por notificação BLE. Nada disso cabe na interface
 * `Conexao`, que só sabe `enviar(bytes)`. Por isso a NIIMBOT tem caminho
 * próprio, e os outros três continuam intocados.
 *
 * ## Por que uma biblioteca de terceiros
 *
 * `@mmote/niimbluelib` (MIT) já traz a tarefa de impressão específica de cada
 * modelo, a codificação da imagem e a consulta de status. O protocolo é
 * legível, mas não tenho a impressora aqui: escrever do zero seria confiar num
 * aperto de mão que ninguém nunca exercitou. Errar ali não daria erro — daria
 * silêncio, que é pior.
 *
 * ## O que NÃO está verificado
 *
 * Nada neste arquivo foi testado contra uma NIIMBOT de verdade. O que os testes
 * cobrem é o que é verificável sem ela: a conta da largura útil, o cabimento da
 * etiqueta e o recorte da imagem. Conectar e sair tinta no papel é teste de
 * bancada.
 */

/** Estado do trabalho, para a tela mostrar em vez de ficar muda. */
export interface ProgressoNiimbot {
  etapa: 'conectando' | 'identificando' | 'renderizando' | 'enviando' | 'aguardando' | 'concluido'
  /** Página atual, quando há mais de uma cópia. */
  pagina?: number
  total?: number
}

export interface ImpressoraNiimbot {
  /** Modelo que a impressora informou de si mesma. */
  modelo: string
  /** Pontos da cabeça térmica — define a largura máxima da etiqueta. */
  pontosCabeca: number
  dpi: number
  imprimir(
    modelo: ModeloEtiqueta,
    dados: DadosEtiqueta,
    perfil: PerfilImpressora,
    opcoes?: { copias?: number; aoProgredir?: (p: ProgressoNiimbot) => void },
  ): Promise<void>
  desconectar(): Promise<void>
}

/**
 * A biblioteca só é baixada quando alguém realmente usa uma NIIMBOT.
 *
 * São ~38 kB comprimidos que uma cozinha com AIYIN nunca vai precisar. Import
 * dinâmico para que o Vite os deixe num pedaço separado.
 */
async function carregarBiblioteca() {
  const { NiimbotBluetoothClient, ImageEncoder, PageColorType } = await import(
    '@mmote/niimbluelib'
  )
  return { NiimbotBluetoothClient, ImageEncoder, PageColorType }
}

/**
 * Abre o seletor do navegador e conecta.
 *
 * Precisa vir de um toque: `requestDevice` só existe dentro de um gesto.
 *
 * O erro mais comum aqui não é técnico — é o app da NIIMBOT estar aberto
 * segurando a conexão. Um periférico BLE aceita um controlador por vez, e a
 * mensagem genérica do navegador não diz isso a ninguém.
 */
export async function conectarNiimbot(
  aoProgredir?: (p: ProgressoNiimbot) => void,
): Promise<ImpressoraNiimbot> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    throw new Error(
      'Este navegador não tem Bluetooth. Use o Chrome no Android — no iPhone ' +
        'o Safari não permite, e a NIIMBOT precisa de Bluetooth.',
    )
  }

  const { NiimbotBluetoothClient, ImageEncoder, PageColorType } = await carregarBiblioteca()
  const cliente = new NiimbotBluetoothClient()

  aoProgredir?.({ etapa: 'conectando' })
  try {
    await cliente.connect()
  } catch (e) {
    throw new Error(traduzirFalhaDeConexao(e))
  }

  aoProgredir?.({ etapa: 'identificando' })
  const info = cliente.getModelMetadata()

  /**
   * Qual sequência de impressão esta impressora quer.
   *
   * Não é derivável do nome do modelo: a própria biblioteca mapeia modelo mais
   * versão de protocolo para a tarefa certa, e duas B21 de lotes diferentes
   * podem querer sequências distintas. Perguntar é mais barato que adivinhar.
   */
  const tarefa = cliente.getPrintTaskType()
  if (!tarefa) {
    await cliente.disconnect()
    throw new Error(
      `Conectei em "${info?.model ?? 'a impressora'}", mas não sei a sequência ` +
        'de impressão dela. Me diga o modelo exato que está escrito na etiqueta ' +
        'da impressora e eu acrescento.',
    )
  }

  const modelo = String(info?.model ?? 'NIIMBOT')
  const pontosCabeca = info?.printheadPixels ?? 384
  const dpi = info?.dpi ?? 203
  const sentido = info?.printDirection ?? 'top'

  return {
    modelo,
    pontosCabeca,
    dpi,
    desconectar: () => cliente.disconnect(),

    async imprimir(modeloEtiqueta, dados, perfil, opcoes = {}) {
      const { copias = 1, aoProgredir: avisar } = opcoes

      avisar?.({ etapa: 'renderizando' })
      const { rgba, largura, altura } = await renderizarEtiqueta(modeloEtiqueta, dados, {
        dpi,
      })

      // Sem dithering, pelo mesmo motivo do resto do app: difusão de erro em
      // texto pequeno serrilha a borda e chega a impedir a leitura do QR.
      const bitmap = paraMonocromatico(rgba, largura, altura)
      const imagem = ImageEncoder.encodeCanvas(
        paraCanvas(bitmap, largura, altura),
        PageColorType.SingleColor,
        sentido,
      )

      avisar?.({ etapa: 'enviando', pagina: 1, total: copias })
      const trabalho = cliente.abstraction.newPrintTask(tarefa, {
        totalPages: copias,
        // A densidade do nosso perfil é a escala do TSPL (0–15). As NIIMBOT vão
        // de 1 a 5, então recortamos ao que ESTA impressora aceita em vez de
        // mandar um número que ela rejeita em silêncio.
        density: limitar(
          perfil.densidade,
          info?.densityMin ?? 1,
          info?.densityMax ?? 5,
          info?.densityDefault ?? 3,
        ),
      })

      await trabalho.printInit()
      await trabalho.printPage(imagem, copias)

      avisar?.({ etapa: 'aguardando' })
      await trabalho.waitForFinished()
      avisar?.({ etapa: 'concluido' })
    },
  }
}

/**
 * Traduz a falha de conexão para quem está na bancada.
 *
 * O navegador diz "GATT Server is disconnected" ou "Device unreachable", que
 * não ajuda ninguém. Na prática, quase sempre é uma de três coisas, e vale mais
 * listá-las do que repetir o texto do navegador.
 */
function traduzirFalhaDeConexao(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)

  if (erro instanceof Error && erro.name === 'NotFoundError') {
    // Cancelar o seletor é desistência, não erro — quem chama trata isso antes.
    return 'Nenhuma impressora escolhida.'
  }

  return (
    'Não consegui conectar na impressora. Quase sempre é uma destas três: ' +
    '(1) o aplicativo da NIIMBOT está aberto segurando a conexão — feche-o por ' +
    'completo, não só minimize; (2) a impressora está desligada ou longe; ' +
    '(3) ela já está conectada em outro celular. ' +
    `Detalhe técnico: ${texto}`
  )
}

/**
 * Converte nosso bitmap 1 bit por pixel num canvas, que é o que a biblioteca lê.
 *
 * Passo bobo mas necessário: nosso pipeline já entrega monocromático empacotado
 * e o `ImageEncoder` quer pixels. Desempacotar aqui evita ter duas ideias
 * diferentes de "o que é preto" dentro do mesmo app.
 */
function paraCanvas(
  bitmap: { dados: Uint8Array; largura: number; altura: number },
  largura: number,
  altura: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem da etiqueta.')

  const imagem = ctx.createImageData(largura, altura)
  const bytesPorLinha = Math.ceil(largura / 8)

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const byte = bitmap.dados[y * bytesPorLinha + (x >> 3)] ?? 0
      // Bit 1 = tinta, na nossa convenção. O canvas espera preto = 0.
      const aceso = (byte >> (7 - (x & 7))) & 1
      const tom = aceso ? 0 : 255
      const i = (y * largura + x) * 4
      imagem.data[i] = tom
      imagem.data[i + 1] = tom
      imagem.data[i + 2] = tom
      imagem.data[i + 3] = 255
    }
  }

  ctx.putImageData(imagem, 0, 0)
  return canvas
}

/**
 * Recorta a densidade à faixa que a impressora aceita.
 *
 * Nosso perfil guarda a escala do TSPL, que vai a 15; a NIIMBOT B1 vai a 5. Sem
 * o recorte, um perfil herdado da AIYIN mandaria 8 e a impressora recusaria — ou
 * pior, aceitaria e queimaria o papel.
 */
export function limitar(
  valor: number,
  minimo: number,
  maximo: number,
  padrao: number,
): number {
  if (!Number.isFinite(valor) || valor <= 0) return padrao
  return Math.min(maximo, Math.max(minimo, Math.round(valor)))
}
