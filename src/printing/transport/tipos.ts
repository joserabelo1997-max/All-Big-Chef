/**
 * Interface comum dos transportes.
 *
 * A impressora do projeto (AIYIN de bancada, 110 mm) tem Bluetooth **e** USB, e
 * cada caminho tem seu ponto forte: o USB é mais rápido e não depende de
 * pareamento, mas exige cabo e não existe no iPhone; o Bluetooth alcança
 * qualquer aparelho, inclusive o iPhone pelo Bluefy.
 *
 * Como não dá para saber de antemão qual funcionará melhor na cozinha, o
 * pipeline de impressão fala com esta interface e não com nenhum dos dois
 * diretamente.
 */
export interface Conexao {
  tipo: 'ble' | 'usb'
  /** Nome exibido na interface. */
  nome: string
  enviar(dados: Uint8Array, opcoes?: OpcoesEnvio): Promise<void>
  desconectar(): Promise<void>
}

export interface OpcoesEnvio {
  /** Bytes por escrita. */
  tamanhoPedaco?: number
  /** Pausa entre escritas, em ms. */
  pausaMs?: number
  aoProgredir?: (enviados: number, total: number) => void
}

export const espera = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
