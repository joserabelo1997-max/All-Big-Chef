import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessao } from '@/dados/sessao'

/** Porteiro das rotas: sem sessão, nada do app aparece. */
export function ExigirSessao() {
  const { usuario, carregando } = useSessao()
  const local = useLocation()

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-texto2">Abrindo…</p>
      </div>
    )
  }

  if (!usuario) {
    // `state` guarda onde a pessoa queria chegar, para voltar lá depois de entrar.
    return <Navigate to="/entrar" replace state={{ de: local.pathname }} />
  }

  return <Outlet />
}
