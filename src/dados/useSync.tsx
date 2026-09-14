import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { sincronizar } from './sync'
import { useSessao } from './sessao'

export type EstadoSync = 'sincronizado' | 'sincronizando' | 'pendente' | 'offline' | 'erro'

interface ValorSync {
  estado: EstadoSync
  pendentes: number
  ultimoErro: string | null
  ultimaVez: Date | null
  agora: () => void
}

const Contexto = createContext<ValorSync | null>(null)

const INTERVALO_MS = 60_000

export function ProvedorSync({ children }: { children: ReactNode }) {
  const { usuario } = useSessao()
  const [rodando, setRodando] = useState(false)
  const [ultimoErro, setUltimoErro] = useState<string | null>(null)
  const [ultimaVez, setUltimaVez] = useState<Date | null>(null)
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const rodandoRef = useRef(false)

  const pendentes = useLiveQuery(() => db.outbox.count(), [], 0) ?? 0

  const disparar = useCallback(async () => {
    if (!usuario || rodandoRef.current) return
    rodandoRef.current = true
    setRodando(true)
    try {
      const resultado = await sincronizar()
      const reais = resultado.erros.filter((e) => e !== 'offline')
      setUltimoErro(reais.length > 0 ? reais.join(' · ') : null)
      if (reais.length === 0) setUltimaVez(new Date())
    } catch (e) {
      setUltimoErro(e instanceof Error ? e.message : String(e))
    } finally {
      rodandoRef.current = false
      setRodando(false)
    }
  }, [usuario])

  // Sincroniza ao abrir, quando a rede volta, quando o app volta para a frente,
  // e de minuto em minuto. Voltar para a frente é o gatilho que mais importa no
  // celular: o app fica minutos em segundo plano durante o serviço.
  useEffect(() => {
    if (!usuario) return

    void disparar()

    const aoVoltarRede = () => {
      setOnline(true)
      void disparar()
    }
    const aoCairRede = () => setOnline(false)
    const aoVoltarParaFrente = () => {
      if (document.visibilityState === 'visible') void disparar()
    }

    window.addEventListener('online', aoVoltarRede)
    window.addEventListener('offline', aoCairRede)
    document.addEventListener('visibilitychange', aoVoltarParaFrente)
    const intervalo = window.setInterval(() => void disparar(), INTERVALO_MS)

    return () => {
      window.removeEventListener('online', aoVoltarRede)
      window.removeEventListener('offline', aoCairRede)
      document.removeEventListener('visibilitychange', aoVoltarParaFrente)
      window.clearInterval(intervalo)
    }
  }, [usuario, disparar])

  const estado: EstadoSync = !online
    ? 'offline'
    : rodando
      ? 'sincronizando'
      : ultimoErro
        ? 'erro'
        : pendentes > 0
          ? 'pendente'
          : 'sincronizado'

  const valor = useMemo<ValorSync>(
    () => ({ estado, pendentes, ultimoErro, ultimaVez, agora: () => void disparar() }),
    [estado, pendentes, ultimoErro, ultimaVez, disparar],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSync(): ValorSync {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useSync precisa estar dentro de <ProvedorSync>')
  return valor
}

export const ROTULO_SYNC: Record<EstadoSync, string> = {
  sincronizado: 'Tudo salvo na nuvem',
  sincronizando: 'Sincronizando…',
  pendente: 'Salvo aqui, esperando a nuvem',
  offline: 'Offline — salvando no aparelho',
  erro: 'Não consegui sincronizar',
}

export const COR_SYNC: Record<EstadoSync, string> = {
  sincronizado: 'bg-erva',
  sincronizando: 'bg-brasa animate-pulse',
  pendente: 'bg-alerta',
  offline: 'bg-texto2',
  erro: 'bg-perigo',
}
