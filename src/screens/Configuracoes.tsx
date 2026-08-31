import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabase'
import { lerPerfilLocal, perfilEstaCompleto } from '../printing/printerProfile'
import { motivoIndisponivel } from '../printing/transport/ble'

const ITENS = [
  {
    para: '/config/conta',
    icone: '🔐',
    titulo: 'Conta do restaurante',
    descricao: 'Entrar para sincronizar entre os aparelhos',
  },
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
    descricao: 'Dias de antecedência, horário e dias em que a casa fecha',
  },
  {
    para: '/config/equipe',
    icone: '👥',
    titulo: 'Equipe',
    descricao: 'Quem imprime, quem escaneia e quem libera o estoque',
  },
  {
    para: '/config/fornecedores',
    icone: '🚚',
    titulo: 'Fornecedores',
    descricao: 'Contato, WhatsApp e a mensagem do pedido',
  },
] as const

export function Configuracoes() {
  const perfil = lerPerfilLocal()
  const impressoraPronta = perfilEstaCompleto(perfil)
  const bluetoothIndisponivel = motivoIndisponivel()

  // `null` enquanto não se sabe: evita piscar "fora da conta" por um instante
  // para quem está logado.
  const [conectado, setConectado] = useState<boolean | null>(null)

  useEffect(() => {
    if (!supabase) {
      setConectado(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => setConectado(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_e, sessao) =>
      setConectado(Boolean(sessao)),
    )
    return () => data.subscription.unsubscribe()
  }, [])

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

      {/* Fora da conta, nada sai do aparelho — e isso não dá erro em lugar
          nenhum, o que é justamente o que o torna fácil de não perceber. */}
      {conectado === false && supabase && (
        <Link to="/config/conta" className="cartao mb-4 block border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Fora da conta do restaurante</p>
          <p className="mt-1 text-sm text-amber-800">
            O app funciona, mas nada sincroniza: o que for cadastrado aqui não
            chega aos outros aparelhos da cozinha.
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
            {item.para === '/config/conta' && conectado && (
              <span className="text-sm font-semibold text-validade-ok">✓</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
