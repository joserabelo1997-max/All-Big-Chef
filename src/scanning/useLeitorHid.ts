import { useEffect, useRef } from 'react'

import {
  ESTADO_INICIAL,
  focoEmCampoEditavel,
  processarTecla,
  type EstadoLeitura,
} from './leitorHid'

/**
 * Escuta o leitor de código de barras em modo teclado, em qualquer tela.
 *
 * Fica no nível do app inteiro de propósito: numa cozinha, alguém pega o leitor
 * e escaneia um pote onde estiver — não faz sentido exigir que abra antes uma
 * tela específica. É isso que faz o leitor parecer "acoplado" ao aplicativo.
 */
export function useLeitorHid(aoLer: (codigo: string) => void): void {
  // O callback vive numa ref para que trocá-lo não obrigue a religar o
  // ouvinte — o que descartaria uma rajada já em andamento no meio da leitura.
  const callback = useRef(aoLer)
  callback.current = aoLer

  useEffect(() => {
    let estado: EstadoLeitura = ESTADO_INICIAL

    function aoPressionar(evento: KeyboardEvent) {
      // Com o foco num campo, o leitor é deixado digitar ali — foi o que a
      // pessoa quis ao tocar no campo. Sequestrar a leitura faria o texto
      // sumir de dentro do input sem explicação nenhuma.
      if (focoEmCampoEditavel(evento.target)) {
        estado = ESTADO_INICIAL
        return
      }

      const { estado: proximo, codigo } = processarTecla(
        estado,
        evento.key,
        evento.timeStamp || performance.now(),
      )
      estado = proximo

      if (codigo) {
        // Impede que o Enter final dispare algum botão em foco na tela.
        evento.preventDefault()
        callback.current(codigo)
      }
    }

    window.addEventListener('keydown', aoPressionar)
    return () => window.removeEventListener('keydown', aoPressionar)
  }, [])
}
