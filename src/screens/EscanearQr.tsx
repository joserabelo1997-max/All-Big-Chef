import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { db } from '../lib/db'
import { normalizarCodigo } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import { extrairIdDaEtiqueta, iniciarLeitura, type ControleLeitura } from '../scanning/scanner'

/**
 * Leitura de QR — a tela que escaneia a etiqueta.
 *
 * Duas entradas, e as duas importam. A câmera é o caminho normal; a digitação
 * do código curto é o caminho quando a etiqueta está amassada, molhada ou
 * coberta de gordura — o que, numa cozinha, não é caso de borda.
 */
export function EscanearQr() {
  const navegar = useNavigate()
  const { orgId } = useSessao()
  const video = useRef<HTMLVideoElement>(null)
  const controle = useRef<ControleLeitura | null>(null)

  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')

  useEffect(() => {
    return () => controle.current?.parar()
  }, [])

  async function ligarCamera() {
    setErro(null)
    if (!video.current) return

    try {
      controle.current = await iniciarLeitura(video.current, (texto) => {
        const id = extrairIdDaEtiqueta(texto)
        if (!id) return
        // Para a câmera antes de navegar: deixar a trilha de vídeo aberta
        // mantém a luz da câmera acesa e consome bateria à toa.
        controle.current?.parar()
        controle.current = null
        setLendo(false)
        navegar(`/l/${id}`)
      })
      setLendo(true)
    } catch (e) {
      setErro(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Autorize o acesso nas configurações do navegador.'
          : 'Não foi possível abrir a câmera. Use o código impresso abaixo.',
      )
    }
  }

  function pararCamera() {
    controle.current?.parar()
    controle.current = null
    setLendo(false)
  }

  async function buscarPorCodigo() {
    const limpo = normalizarCodigo(codigo)
    if (!limpo || !orgId) return

    const achada = await db.labels.where('short_code').equals(limpo).first()
    if (achada) {
      navegar(`/l/${achada.id}`)
    } else {
      setErro(
        `Nenhuma etiqueta com o código ${limpo}. Confira os caracteres — ` +
          'a etiqueta pode não ter sincronizado ainda.',
      )
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">Escanear QR Code</h1>

      {erro && (
        <p className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <div className="cartao mb-4 overflow-hidden">
        <video
          ref={video}
          className={`aspect-square w-full bg-slate-900 object-cover ${lendo ? '' : 'hidden'}`}
          playsInline
          muted
        />
        {!lendo && (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-400">
            <span aria-hidden className="text-5xl">
              📷
            </span>
            <span className="text-sm">Câmera desligada</span>
          </div>
        )}
      </div>

      <button
        className={lendo ? 'btn-secundario w-full' : 'btn-primario w-full'}
        onClick={() => (lendo ? pararCamera() : void ligarCamera())}
      >
        {lendo ? 'Parar câmera' : 'Escanear QR da etiqueta'}
      </button>

      <div className="my-6 flex items-center gap-3 text-sm text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        ou digite o código
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <label className="rotulo" htmlFor="codigo">
        Código impresso na etiqueta
      </label>
      <div className="flex gap-2">
        <input
          id="codigo"
          className="campo flex-1 font-mono text-lg uppercase tracking-widest"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void buscarPorCodigo()}
          placeholder="A7K293"
          maxLength={10}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="btn-secundario px-5"
          onClick={() => void buscarPorCodigo()}
          disabled={!codigo.trim()}
        >
          Buscar
        </button>
      </div>
    </div>
  )
}
