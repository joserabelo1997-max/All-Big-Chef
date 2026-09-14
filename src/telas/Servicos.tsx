import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { useFichas, useMenus, useServicos } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { abrirServico, formatarDataCurta, hojeEmIso } from '@/dados/repositorio'
import { Busca, CampoTexto, combina } from '@/ui/Campos'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { Folha } from '@/ui/SeletorEspaco'
import { IconeMais } from '@/ui/Icones'
import { formatarReais } from '@/dominio/unidades'
import type { Servico } from '@/dominio/tipos'

export default function Servicos() {
  const { espacoAtivo } = useEspacos()
  const navegar = useNavigate()
  const servicos = useServicos(espacoAtivo?.id ?? null)
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const [busca, setBusca] = useState('')
  const [abrindo, setAbrindo] = useState(false)

  // Busca por prato, não só por data: a pergunta que se faz é quase sempre
  // "quando foi a última vez que servi isso?".
  const filtrados = useMemo(() => {
    const lista = servicos ?? []
    if (!busca.trim()) return lista
    return lista.filter((servico) => {
      const nomes = servico.itens
        .map((i) => fichas.find((f) => f.id === i.ficha_id)?.nome ?? '')
        .join(' ')
      const nosSnapshots = servico.snapshots
        .flatMap((s) => s.pratos.map((p) => p.nome))
        .join(' ')
      return combina(`${servico.nome} ${servico.data} ${nomes} ${nosSnapshots}`, busca)
    })
  }, [servicos, busca, fichas])

  return (
    <>
      <TituloTela
        titulo="Serviços"
        subtitulo="O diário da cozinha. Cada dia guarda a própria cópia do que foi servido — inclusive as receitas como estavam naquele dia."
        acao={
          <button
            type="button"
            className="botao-principal shrink-0 px-3"
            onClick={() => setAbrindo(true)}
            aria-label="Abrir o dia"
          >
            <IconeMais className="h-5 w-5" />
          </button>
        }
      />

      <div className="mb-3">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por prato ou data…" />
      </div>

      {servicos === undefined ? (
        <p className="text-sm text-texto2">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <Vazio
          titulo={busca ? 'Nada encontrado' : 'Nenhum serviço registrado'}
          texto={
            busca
              ? 'Nenhum dia com esse prato ou nessa data.'
              : 'Abra o dia, carregue um menu, ajuste o que mudou e salve. Daqui a um ano você ainda vai saber o que serviu hoje.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((servico) => (
            <li key={servico.id}>
              <CartaoServico servico={servico} aoAbrir={() => navegar(`/servicos/${servico.id}`)} />
            </li>
          ))}
        </ul>
      )}

      {abrindo ? <AbrirODia aoFechar={() => setAbrindo(false)} /> : null}
    </>
  )
}

function CartaoServico({ servico, aoAbrir }: { servico: Servico; aoAbrir: () => void }) {
  const ultima = servico.snapshots[servico.snapshots.length - 1]

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="cartao flex w-full items-center justify-between gap-3 text-left hover:border-brasa/40"
    >
      <span className="min-w-0">
        <span className="block font-medium">{formatarDataCurta(servico.data)}</span>
        <span className="block truncate text-xs text-texto2">
          {servico.nome || `${servico.itens.length} ${servico.itens.length === 1 ? 'prato' : 'pratos'}`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {ultima ? (
          <>
            <span className="block text-sm">
              {ultima.custo_total !== null ? formatarReais(ultima.custo_total) : '—'}
            </span>
            <span className="block text-xs text-texto2">
              {ultima.versao} {ultima.versao === 1 ? 'versão' : 'versões'}
            </span>
          </>
        ) : (
          <span className="block text-xs text-alerta">não registrado</span>
        )}
      </span>
    </button>
  )
}

function AbrirODia({ aoFechar }: { aoFechar: () => void }) {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const navegar = useNavigate()
  const menus = useMenus(espacoAtivo?.id ?? null) ?? []

  const [data, setData] = useState(hojeEmIso())
  const [nome, setNome] = useState('')
  const [menuId, setMenuId] = useState<string>('')

  return (
    <Folha titulo="Abrir o dia" aoFechar={aoFechar}>
      <div className="space-y-4">
        <div>
          <label className="rotulo" htmlFor="data-servico">
            Data
          </label>
          <input
            id="data-servico"
            type="date"
            className="campo"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>

        <CampoTexto
          rotulo="Nome do serviço"
          valor={nome}
          aoMudar={setNome}
          placeholder="Almoço"
          dica="Opcional. Serve para separar almoço e jantar no mesmo dia."
        />

        <div>
          <label className="rotulo" htmlFor="menu-servico">
            Carregar a partir de um menu
          </label>
          <select
            id="menu-servico"
            className="campo"
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
          >
            <option value="">Começar vazio</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.nome || 'Sem nome'}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-texto2">
            Os pratos são copiados para dentro do dia. Mexer neles aqui não altera o menu padrão da
            casa.
          </p>
        </div>

        <button
          type="button"
          className="botao-principal w-full"
          onClick={async () => {
            const servico = await abrirServico(
              { donoId: usuario!.id, espacoId: espacoAtivo!.id },
              { data, nome, menuId: menuId || null },
            )
            aoFechar()
            navegar(`/servicos/${servico.id}`)
          }}
        >
          Abrir
        </button>
      </div>
    </Folha>
  )
}
