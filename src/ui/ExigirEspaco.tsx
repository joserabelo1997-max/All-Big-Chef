import { Outlet } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { FormularioEspaco } from './SeletorEspaco'

/**
 * Primeiro acesso. Sem nenhum restaurante cadastrado o app não tem onde pendurar
 * receita nenhuma, então pede esse único dado antes de qualquer outra coisa.
 */
export function ExigirEspaco() {
  const { espacos, carregando } = useEspacos()

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-texto2">Abrindo suas cozinhas…</p>
      </div>
    )
  }

  if (espacos.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Onde você cozinha?</h1>
            <p className="mt-2 text-sm leading-relaxed text-texto2">
              Comece pelo restaurante. Cada um guarda as próprias receitas, menus e serviços, e você
              troca entre eles no alto da tela. Se cozinhar em mais de um lugar, é só criar outro
              depois.
            </p>
          </div>
          <div className="cartao">
            <FormularioEspaco comoBoasVindas />
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
