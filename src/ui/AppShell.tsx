import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { DESTINOS, DESTINOS_BARRA } from './navegacao'
import { IconeFechar, IconeMenu } from './Icones'
import { SeletorEspaco } from './SeletorEspaco'
import { COR_SYNC, ROTULO_SYNC, useSync } from '@/dados/useSync'

/**
 * Casca do app. Duas navegações de propósito, porque servem a dois momentos:
 * a barra inferior é para o serviço acontecendo (polegar, cinco destinos, sem
 * pensar), e a gaveta é para quando você senta para organizar as coisas.
 */
export function AppShell() {
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const local = useLocation()

  // Navegar fecha a gaveta. Sem isso ela fica aberta por cima da tela nova.
  useEffect(() => {
    setGavetaAberta(false)
  }, [local.pathname])

  // Com a gaveta aberta, o fundo não deve rolar atrás dela.
  useEffect(() => {
    document.body.style.overflow = gavetaAberta ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [gavetaAberta])

  return (
    <div className="min-h-dvh bg-fundo">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-borda bg-fundo/95 px-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setGavetaAberta(true)}
          className="botao-fantasma -ml-1 p-2"
          aria-label="Abrir menu"
        >
          <IconeMenu />
        </button>
        <SeletorEspaco />
        <div className="ml-auto">
          <LuzDoSync />
        </div>
      </header>

      <Gaveta aberta={gavetaAberta} aoFechar={() => setGavetaAberta(false)} />

      {/* O padding de baixo tira a última linha de conteúdo de debaixo da barra. */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
        <Outlet />
      </main>

      <BarraInferior />
    </div>
  )
}

/**
 * Um ponto colorido e nada mais. Estado de sincronia interessa quando algo está
 * errado; no resto do tempo, não deve disputar atenção com o serviço.
 */
function LuzDoSync() {
  const { estado, pendentes, agora } = useSync()
  const rotulo = ROTULO_SYNC[estado]

  return (
    <button
      type="button"
      onClick={agora}
      title={pendentes > 0 ? `${rotulo} (${pendentes} para enviar)` : rotulo}
      aria-label={rotulo}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-texto2 hover:bg-painel2"
    >
      <span className={`h-2 w-2 rounded-full ${COR_SYNC[estado]}`} />
      {pendentes > 0 ? <span>{pendentes}</span> : null}
    </button>
  )
}

function Gaveta({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  return (
    <>
      <div
        onClick={aoFechar}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          aberta ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />
      <nav
        className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col border-r border-borda bg-painel transition-transform duration-200 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu principal"
        aria-hidden={!aberta}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-4">
          <div>
            <p className="text-base font-semibold">All Big Chef</p>
            <p className="text-xs text-texto2">Gestão de cozinha</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="botao-fantasma p-2"
            aria-label="Fechar menu"
          >
            <IconeFechar />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {DESTINOS.map((d) => (
            <NavLink
              key={d.para}
              to={d.para}
              end={d.para === '/'}
              tabIndex={aberta ? 0 : -1}
              className={({ isActive }) =>
                `flex items-start gap-3 rounded-xl px-3 py-3 transition ${
                  isActive ? 'bg-painel2 text-brasa' : 'text-texto hover:bg-painel2'
                }`
              }
            >
              <d.icone className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{d.rotulo}</span>
                <span className="block text-xs leading-snug text-texto2">{d.descricao}</span>
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}

function BarraInferior() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-painel/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Atalhos"
    >
      <div className="mx-auto flex max-w-3xl">
        {DESTINOS_BARRA.map((d) => (
          <NavLink
            key={d.para}
            to={d.para}
            end={d.para === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
                isActive ? 'text-brasa' : 'text-texto2'
              }`
            }
          >
            <d.icone className="h-6 w-6" />
            {d.rotulo}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
