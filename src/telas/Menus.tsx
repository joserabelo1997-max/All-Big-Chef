import { useState } from 'react'
import { useEspacos } from '@/dados/espacos'
import { useContextoArvore, useFichas, useItensDoMenu, useMenus } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import {
  adicionarAoMenu,
  apagarItemDoMenu,
  apagarMenu,
  menuEmBranco,
  salvarItemDoMenu,
  salvarMenu,
} from '@/dados/repositorio'
import { Busca, CampoNumero, CampoTexto, combina } from '@/ui/Campos'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { Folha } from '@/ui/SeletorEspaco'
import { IconeMais } from '@/ui/Icones'
import { explodirFicha } from '@/dominio/arvore'
import { formatarReais } from '@/dominio/unidades'
import type { Menu } from '@/dominio/tipos'

export default function Menus() {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const menus = useMenus(espacoAtivo?.id ?? null)
  const [editando, setEditando] = useState<Menu | null>(null)

  return (
    <>
      <TituloTela
        titulo="Menus"
        subtitulo="Conjuntos de pratos que você serve. Deles saem o serviço do dia, o checklist e a lista de compras."
        acao={
          <button
            type="button"
            className="botao-principal shrink-0 px-3"
            onClick={() => setEditando(menuEmBranco({ donoId: usuario!.id, espacoId: espacoAtivo!.id }))}
            aria-label="Novo menu"
          >
            <IconeMais className="h-5 w-5" />
          </button>
        }
      />

      {menus === undefined ? (
        <p className="text-sm text-texto2">Carregando…</p>
      ) : menus.length === 0 ? (
        <Vazio
          titulo="Nenhum menu ainda"
          texto="Um menu é a lista de pratos de um serviço, com quantas porções de cada um você espera fazer. Monte o seu menu padrão e abra o dia a partir dele."
        />
      ) : (
        <ul className="space-y-2">
          {menus.map((menu) => (
            <li key={menu.id}>
              <CartaoMenu menu={menu} aoAbrir={() => setEditando(menu)} />
            </li>
          ))}
        </ul>
      )}

      {editando ? <EditorMenu menu={editando} aoFechar={() => setEditando(null)} /> : null}
    </>
  )
}

function CartaoMenu({ menu, aoAbrir }: { menu: Menu; aoAbrir: () => void }) {
  const itens = useItensDoMenu(menu.id) ?? []

  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="cartao flex w-full items-center justify-between gap-3 text-left hover:border-brasa/40"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{menu.nome || 'Sem nome'}</span>
        <span className="block truncate text-xs text-texto2">
          {menu.descricao || `${itens.length} ${itens.length === 1 ? 'prato' : 'pratos'}`}
        </span>
      </span>
      <span className="shrink-0 text-sm text-texto2">{itens.length}</span>
    </button>
  )
}

function EditorMenu({ menu, aoFechar }: { menu: Menu; aoFechar: () => void }) {
  const { espacoAtivo } = useEspacos()
  const itens = useItensDoMenu(menu.id) ?? []
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)
  const [adicionando, setAdicionando] = useState(false)
  const [busca, setBusca] = useState('')
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)

  const pratos = fichas.filter((f) => f.tipo === 'prato')
  const jaNoMenu = new Set(itens.map((i) => i.ficha_id))
  const disponiveis = pratos.filter(
    (p) => !jaNoMenu.has(p.id) && combina(`${p.nome} ${p.categoria}`, busca),
  )

  const nomeDaFicha = (id: string) => fichas.find((f) => f.id === id)?.nome ?? 'Prato apagado'

  const custoDoMenu = itens.reduce<number | null>((total, item) => {
    if (total === null || !ctx) return null
    const { raiz } = explodirFicha(ctx, item.ficha_id, { porcoes: item.porcoes_previstas })
    return raiz.custo === null ? null : total + raiz.custo
  }, 0)

  return (
    <Folha titulo={menu.nome || 'Novo menu'} aoFechar={aoFechar}>
      <div className="space-y-4">
        <CampoTexto
          rotulo="Nome do menu"
          valor={menu.nome}
          aoMudar={(v) => void salvarMenu({ ...menu, nome: v })}
          placeholder="Menu de terça"
          autoFocus={!menu.nome}
        />
        <CampoTexto
          rotulo="Descrição"
          valor={menu.descricao}
          aoMudar={(v) => void salvarMenu({ ...menu, descricao: v })}
          placeholder="Almoço executivo"
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Pratos</p>
            <button
              type="button"
              className="botao-secundario px-3 py-1.5 text-sm"
              onClick={() => setAdicionando(true)}
            >
              <IconeMais className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          {itens.length === 0 ? (
            <p className="py-3 text-center text-sm text-texto2">
              Ainda sem pratos. Adicione o que vai ao serviço e quantas porções espera fazer.
            </p>
          ) : (
            <ul className="space-y-2">
              {itens.map((item) => (
                <li key={item.id} className="rounded-xl bg-painel2 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{nomeDaFicha(item.ficha_id)}</span>
                    <button
                      type="button"
                      aria-label={`Remover ${nomeDaFicha(item.ficha_id)}`}
                      className="shrink-0 text-texto2 hover:text-perigo"
                      onClick={() => void apagarItemDoMenu(item.id)}
                    >
                      ×
                    </button>
                  </div>
                  <CampoNumero
                    rotulo="Porções previstas"
                    valor={item.porcoes_previstas}
                    aoMudar={(v) => void salvarItemDoMenu({ ...item, porcoes_previstas: v })}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {itens.length > 0 ? (
          <p className="rounded-xl bg-painel2 px-3 py-2.5 text-sm">
            Custo de insumo do menu inteiro:{' '}
            <span className="font-semibold text-brasa">
              {custoDoMenu !== null ? formatarReais(custoDoMenu) : 'em aberto'}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          className="botao-fantasma w-full text-sm text-perigo"
          onClick={() => setConfirmandoApagar(true)}
        >
          Apagar menu
        </button>
      </div>

      {adicionando ? (
        <Folha titulo="Adicionar prato" aoFechar={() => setAdicionando(false)}>
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar prato…" />
          <ul className="mt-3 space-y-1">
            {disponiveis.length === 0 ? (
              <li className="rounded-xl bg-painel2 px-3 py-3 text-sm text-texto2">
                {pratos.length === 0
                  ? 'Nenhum prato cadastrado ainda. Escreva as fichas em Receitas.'
                  : 'Todos os pratos que combinam já estão no menu.'}
              </li>
            ) : (
              disponiveis.map((prato) => (
                <li key={prato.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-painel2 px-3 py-2.5 text-left hover:bg-borda"
                    onClick={async () => {
                      await adicionarAoMenu(menu, prato.id, prato.porcoes)
                      setAdicionando(false)
                    }}
                  >
                    <span className="block text-sm font-medium">{prato.nome || 'Sem nome'}</span>
                    <span className="block text-xs text-texto2">
                      A ficha rende {prato.porcoes} {prato.porcoes === 1 ? 'porção' : 'porções'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Folha>
      ) : null}

      {confirmandoApagar ? (
        <Folha titulo="Apagar menu" aoFechar={() => setConfirmandoApagar(false)}>
          <p className="text-sm text-texto2">
            As receitas continuam onde estão, e os serviços já registrados também — eles guardam a
            própria cópia. Só este agrupamento some.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => setConfirmandoApagar(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao flex-1 bg-perigo text-fundo"
              onClick={async () => {
                await apagarMenu(menu.id)
                aoFechar()
              }}
            >
              Apagar
            </button>
          </div>
        </Folha>
      ) : null}
    </Folha>
  )
}
