import { Link } from 'react-router-dom'

/**
 * Painel de validades. Por ora mostra a estrutura com contadores zerados; passa a
 * ler dados reais quando a camada Dexie/sync entrar (tarefa 3) e ganha os status
 * calculados em `domain/expiry.ts` (tarefa 8).
 */
export function Painel() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">All Big Chef</h1>
        <p className="text-slate-500">Controle de validades da cozinha</p>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Contador rotulo="Vencidas" valor={0} cor="bg-validade-vencido" />
        <Contador rotulo="Vencem hoje" valor={0} cor="bg-validade-hoje" />
        <Contador rotulo="Em breve" valor={0} cor="bg-validade-atencao" />
      </div>

      <div className="grid gap-3">
        <Link to="/imprimir" className="btn-primario">
          🖨️ Imprimir etiqueta
        </Link>
        <Link to="/baixa" className="btn-secundario">
          📷 Dar baixa
        </Link>
      </div>
    </div>
  )
}

function Contador({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string
  valor: number
  cor: string
}) {
  return (
    <div className={`${cor} rounded-2xl px-3 py-4 text-center text-white shadow-sm`}>
      <div className="text-3xl font-bold tabular-nums">{valor}</div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-90">
        {rotulo}
      </div>
    </div>
  )
}
