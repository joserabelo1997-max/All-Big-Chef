import { Link } from 'react-router-dom'

import { lerPerfilLocal, perfilEstaCompleto } from '../printing/printerProfile'
import { motivoIndisponivel } from '../printing/transport/ble'

const ITENS = [
  {
    para: '/config/impressora',
    icone: '🖨️',
    titulo: 'Impressora',
    descricao: 'Parear a etiquetadora e testar a impressão',
  },
  {
    para: '/editor',
    icone: '🏷️',
    titulo: 'Modelo da etiqueta',
    descricao: 'Escolher o que sai impresso e onde',
  },
  {
    para: '/relatorios',
    icone: '📊',
    titulo: 'Relatórios',
    descricao: 'Desperdício, aproveitamento e exportação',
  },
  {
    para: '/config/alertas',
    icone: '🔔',
    titulo: 'Alertas de validade',
    descricao: 'Quantos dias antes avisar, e a que horas',
  },
  {
    para: '/config/equipe',
    icone: '👥',
    titulo: 'Equipe',
    descricao: 'Quem aparece na lista ao imprimir e ao escanear',
  },
  {
    para: '/config/fornecedores',
    icone: '🚚',
    titulo: 'Fornecedores',
    descricao: 'Cadastro usado no campo da etiqueta',
  },
] as const

export function Configuracoes() {
  const perfil = lerPerfilLocal()
  const impressoraPronta = perfilEstaCompleto(perfil)
  const bluetoothIndisponivel = motivoIndisponivel()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Configurações</h1>

      {/* A impressora é o que trava a operação inteira: se não estiver
          configurada, nada é impresso. Merece destaque, não uma linha na lista. */}
      {!impressoraPronta && !bluetoothIndisponivel && (
        <Link
          to="/config/impressora"
          className="cartao mb-4 block border-amber-300 bg-amber-50 p-4"
        >
          <p className="font-semibold text-amber-900">Impressora ainda não configurada</p>
          <p className="mt-1 text-sm text-amber-800">
            Toque aqui para parear a etiquetadora e imprimir uma etiqueta de teste.
          </p>
        </Link>
      )}

      {bluetoothIndisponivel && (
        <div className="cartao mb-4 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{bluetoothIndisponivel}</p>
        </div>
      )}

      <div className="grid gap-3">
        {ITENS.map((item) => (
          <Link key={item.para} to={item.para} className="cartao flex items-center gap-4 p-4">
            <span aria-hidden className="text-2xl">
              {item.icone}
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{item.titulo}</span>
              <span className="block text-sm text-slate-500">{item.descricao}</span>
            </span>
            {item.para === '/config/impressora' && impressoraPronta && (
              <span className="text-sm font-semibold text-validade-ok">✓</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
