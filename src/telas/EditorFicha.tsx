import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEspacos } from '@/dados/espacos'
import { useComponentesDaFicha, useContextoArvore, useFicha, useFichas, useInsumos } from '@/dados/consultas'
import {
  adicionarComponente,
  apagarComponente,
  apagarFicha,
  duplicarFicha,
  moverFicha,
  moverNaLista,
  reordenarComponentes,
  salvarComponente,
  salvarFicha,
  usosDaFicha,
} from '@/dados/repositorio'
import { Busca, CampoNumero, CampoTexto, SeletorUnidade, combina } from '@/ui/Campos'
import { Folha } from '@/ui/SeletorEspaco'
import { IconeMais } from '@/ui/Icones'
import { criariaCiclo, explodirFicha } from '@/dominio/arvore'
import { custoPorPorcao } from '@/dominio/custo'
import { precoPorCmvAlvo } from '@/dominio/precificacao'
import { formatarMedida, formatarPercentual, formatarReais } from '@/dominio/unidades'
import type { Ficha, FichaComponente, Unidade } from '@/dominio/tipos'

export default function EditorFicha() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { espacoAtivo, espacos } = useEspacos()
  const ficha = useFicha(id ?? null)
  const componentes = useComponentesDaFicha(id ?? null)
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const [adicionando, setAdicionando] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)

  const explosao = useMemo(
    () => (ctx && id ? explodirFicha(ctx, id) : null),
    [ctx, id],
  )

  if (ficha === undefined || componentes === undefined) {
    return <p className="text-sm text-texto2">Carregando…</p>
  }

  if (ficha === null) {
    return (
      <div className="cartao">
        <p className="text-sm text-texto2">Essa receita não existe mais.</p>
        <button type="button" className="botao-secundario mt-3" onClick={() => navegar('/receitas')}>
          Voltar para as receitas
        </button>
      </div>
    )
  }

  const custo = explosao?.raiz.custo ?? null
  const porPorcao = custoPorPorcao(custo, ficha.porcoes)

  async function mudar<K extends keyof Ficha>(campo: K, valor: Ficha[K]) {
    await salvarFicha({ ...ficha!, [campo]: valor })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => navegar('/receitas')}
          className="botao-fantasma -ml-2 px-2 py-1 text-sm"
        >
          ← Receitas
        </button>
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          className="botao-fantasma px-2 py-1 text-sm"
        >
          Mais…
        </button>
      </div>

      <CampoTexto
        rotulo={ficha.tipo === 'prato' ? 'Nome do prato' : 'Nome do preparo'}
        valor={ficha.nome}
        aoMudar={(v) => void mudar('nome', v)}
      />

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          rotulo="Categoria"
          valor={ficha.categoria}
          aoMudar={(v) => void mudar('categoria', v)}
          placeholder={ficha.tipo === 'prato' ? 'Principal' : 'Fundos'}
        />
        <CampoNumero
          rotulo="Tempo"
          valor={ficha.tempo_minutos ?? 0}
          aoMudar={(v) => void mudar('tempo_minutos', v > 0 ? v : null)}
          sufixo="min"
        />
      </div>

      <div className="cartao space-y-3">
        <p className="text-sm font-medium">Rendimento</p>
        <div className="grid grid-cols-[1fr,auto] gap-3">
          <CampoNumero
            rotulo="A receita inteira rende"
            valor={ficha.rendimento_quantidade}
            aoMudar={(v) => void mudar('rendimento_quantidade', v)}
          />
          <SeletorUnidade
            rotulo="Unidade do rendimento"
            valor={ficha.rendimento_unidade}
            aoMudar={(u) => void mudar('rendimento_unidade', u)}
          />
        </div>
        <CampoNumero
          rotulo="Em quantas porções"
          valor={ficha.porcoes}
          aoMudar={(v) => void mudar('porcoes', v)}
          dica="É esse número que divide o custo total e vira o custo por porção."
        />
      </div>

      <ListaComponentes
        ficha={ficha}
        componentes={componentes}
        explosao={explosao}
        aoAdicionar={() => setAdicionando(true)}
      />

      <ModoDePreparo ficha={ficha} aoMudar={(passos) => void mudar('modo_preparo', passos)} />

      <CartaoCusto
        custo={custo}
        porPorcao={porPorcao}
        porcoes={ficha.porcoes}
        cmvAlvo={espacoAtivo?.cmv_alvo ?? 0.32}
        avisos={explosao?.avisos ?? []}
      />

      <CampoTexto
        rotulo="Observação"
        valor={ficha.observacao}
        aoMudar={(v) => void mudar('observacao', v)}
        placeholder="Ponto, textura, o que costuma dar errado…"
      />

      {adicionando && ctx ? (
        <SeletorDeComponente ficha={ficha} aoFechar={() => setAdicionando(false)} />
      ) : null}

      {menuAberto ? (
        <MenuDaFicha
          ficha={ficha}
          espacos={espacos.map((e) => ({ id: e.id, nome: e.nome }))}
          aoFechar={() => setMenuAberto(false)}
          aoApagar={() => navegar('/receitas')}
        />
      ) : null}
    </div>
  )
}

function ListaComponentes({
  ficha,
  componentes,
  explosao,
  aoAdicionar,
}: {
  ficha: Ficha
  componentes: FichaComponente[]
  explosao: ReturnType<typeof explodirFicha> | null
  aoAdicionar: () => void
}) {
  // O custo de cada linha vem da árvore já montada, casando pelo id do componente
  // — assim a lista mostra exatamente os mesmos números que somaram no total.
  const custoPorComponente = new Map<string, number | null>()
  const nomePorComponente = new Map<string, string>()
  for (const filho of explosao?.raiz.filhos ?? []) {
    if (filho.componenteId) {
      custoPorComponente.set(filho.componenteId, filho.custo)
      nomePorComponente.set(filho.componenteId, filho.nome)
    }
  }

  async function mover(de: number, para: number) {
    await reordenarComponentes(moverNaLista(componentes, de, para))
  }

  return (
    <div className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {ficha.tipo === 'prato' ? 'Componentes do prato' : 'Ingredientes'}
        </p>
        <button type="button" className="botao-secundario px-3 py-1.5 text-sm" onClick={aoAdicionar}>
          <IconeMais className="h-4 w-4" />
          Adicionar
        </button>
      </div>

      {componentes.length === 0 ? (
        <p className="py-4 text-center text-sm text-texto2">
          Ainda vazio. Adicione ingredientes, ou preparos inteiros que você já escreveu.
        </p>
      ) : (
        <ul className="space-y-2">
          {componentes.map((componente, indice) => (
            <LinhaComponente
              key={componente.id}
              componente={componente}
              nome={nomePorComponente.get(componente.id) ?? '—'}
              ehPreparo={componente.ficha_filha_id !== null}
              custo={custoPorComponente.get(componente.id) ?? null}
              podeSubir={indice > 0}
              podeDescer={indice < componentes.length - 1}
              aoSubir={() => void mover(indice, indice - 1)}
              aoDescer={() => void mover(indice, indice + 1)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function LinhaComponente({
  componente,
  nome,
  ehPreparo,
  custo,
  podeSubir,
  podeDescer,
  aoSubir,
  aoDescer,
}: {
  componente: FichaComponente
  nome: string
  ehPreparo: boolean
  custo: number | null
  podeSubir: boolean
  podeDescer: boolean
  aoSubir: () => void
  aoDescer: () => void
}) {
  const [aberto, setAberto] = useState(false)

  async function mudarQuantidade(quantidade: number) {
    await salvarComponente({ ...componente, quantidade })
  }

  async function mudarUnidade(unidade: Unidade) {
    await salvarComponente({ ...componente, unidade })
  }

  return (
    <li className="rounded-xl bg-painel2">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{nome}</span>
            {ehPreparo ? (
              <span className="shrink-0 rounded bg-painel px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brasa">
                preparo
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-texto2">
            {formatarMedida(componente.quantidade, componente.unidade)}
            {custo !== null ? ` · ${formatarReais(custo)}` : ' · custo aberto'}
          </span>
        </span>
        <span className="shrink-0 text-xs text-texto2">{aberto ? 'fechar' : 'editar'}</span>
      </button>

      {aberto ? (
        <div className="space-y-3 border-t border-borda px-3 py-3">
          <div className="grid grid-cols-[1fr,auto] gap-3">
            <CampoNumero
              rotulo="Quantidade"
              valor={componente.quantidade}
              aoMudar={(v) => void mudarQuantidade(v)}
            />
            <SeletorUnidade
              rotulo="Unidade do item"
              valor={componente.unidade}
              aoMudar={(u) => void mudarUnidade(u)}
            />
          </div>

          <CampoTexto
            rotulo="Observação"
            valor={componente.observacao}
            aoMudar={(v) => void salvarComponente({ ...componente, observacao: v })}
            placeholder="Em cubos, sem casca…"
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="botao-secundario flex-1 py-2 text-sm"
              disabled={!podeSubir}
              onClick={aoSubir}
            >
              ↑ Subir
            </button>
            <button
              type="button"
              className="botao-secundario flex-1 py-2 text-sm"
              disabled={!podeDescer}
              onClick={aoDescer}
            >
              ↓ Descer
            </button>
            <button
              type="button"
              className="botao flex-1 border border-perigo/40 py-2 text-sm text-perigo"
              onClick={() => void apagarComponente(componente.id)}
            >
              Remover
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Escolher o que entra na receita. Insumos e preparos aparecem na mesma busca de
 * propósito: na cabeça do cozinheiro "molho de tomate" é um item só, não importa
 * se é comprado pronto ou feito na casa.
 */
function SeletorDeComponente({ ficha, aoFechar }: { ficha: Ficha; aoFechar: () => void }) {
  const { espacoAtivo } = useEspacos()
  const insumos = useInsumos(espacoAtivo?.id ?? null) ?? []
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)
  const [busca, setBusca] = useState('')

  const opcoesInsumos = insumos.filter((i) => combina(`${i.nome} ${i.categoria}`, busca))
  const opcoesFichas = fichas.filter(
    (f) => combina(`${f.nome} ${f.categoria}`, busca) && (!ctx || !criariaCiclo(ctx, ficha.id, f.id)),
  )

  async function escolherInsumo(insumoId: string, unidade: Unidade) {
    await adicionarComponente(ficha, { insumoId }, 0, unidade)
    aoFechar()
  }

  async function escolherFicha(fichaFilhaId: string, unidade: Unidade) {
    await adicionarComponente(ficha, { fichaFilhaId }, 0, unidade)
    aoFechar()
  }

  return (
    <Folha titulo="Adicionar à receita" aoFechar={aoFechar}>
      <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar ingrediente ou preparo…" />

      <div className="mt-3 space-y-4">
        {opcoesFichas.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-texto2">Preparos</p>
            <ul className="space-y-1">
              {opcoesFichas.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-painel2 px-3 py-2.5 text-left hover:bg-borda"
                    onClick={() => void escolherFicha(f.id, f.rendimento_unidade)}
                  >
                    <span className="block text-sm font-medium">{f.nome || 'Sem nome'}</span>
                    <span className="block text-xs text-texto2">
                      Rende {formatarMedida(f.rendimento_quantidade, f.rendimento_unidade)}
                      {f.espaco_id === null ? ' · biblioteca' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-texto2">Insumos</p>
          {opcoesInsumos.length === 0 ? (
            <p className="rounded-xl bg-painel2 px-3 py-3 text-sm text-texto2">
              Nenhum insumo com esse nome. Cadastre em Insumos, no menu lateral.
            </p>
          ) : (
            <ul className="space-y-1">
              {opcoesInsumos.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-painel2 px-3 py-2.5 text-left hover:bg-borda"
                    onClick={() => void escolherInsumo(i.id, i.unidade_uso)}
                  >
                    <span className="block text-sm font-medium">{i.nome}</span>
                    <span className="block text-xs text-texto2">
                      {i.categoria || 'Sem categoria'} · usa em {i.unidade_uso}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-texto2">
        Preparos que já contêm esta receita não aparecem na lista: entrariam em laço, e o custo
        nunca fecharia.
      </p>
    </Folha>
  )
}

function ModoDePreparo({ ficha, aoMudar }: { ficha: Ficha; aoMudar: (passos: string[]) => void }) {
  const passos = ficha.modo_preparo

  return (
    <div className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Modo de preparo</p>
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-sm"
          onClick={() => aoMudar([...passos, ''])}
        >
          <IconeMais className="h-4 w-4" />
          Passo
        </button>
      </div>

      {passos.length === 0 ? (
        <p className="py-3 text-center text-sm text-texto2">
          Escreva em passos. No meio do serviço se lê um de cada vez, não um parágrafo.
        </p>
      ) : (
        <ol className="space-y-2">
          {passos.map((passo, indice) => (
            <li key={indice} className="flex gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-center text-sm text-texto2">
                {indice + 1}
              </span>
              <textarea
                className="campo min-h-[3rem] flex-1 resize-y"
                value={passo}
                placeholder="Suar a cebola em fogo baixo até ficar translúcida"
                onChange={(e) => {
                  const novos = [...passos]
                  novos[indice] = e.target.value
                  aoMudar(novos)
                }}
              />
              <button
                type="button"
                aria-label={`Remover passo ${indice + 1}`}
                className="botao-fantasma shrink-0 self-start px-2 py-2 text-perigo"
                onClick={() => aoMudar(passos.filter((_, i) => i !== indice))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function CartaoCusto({
  custo,
  porPorcao,
  porcoes,
  cmvAlvo,
  avisos,
}: {
  custo: number | null
  porPorcao: number | null
  porcoes: number
  cmvAlvo: number
  avisos: string[]
}) {
  const precoSugerido = precoPorCmvAlvo(porPorcao, cmvAlvo)

  return (
    <div className="cartao space-y-3">
      <p className="text-sm font-medium">Custo</p>

      {custo === null ? (
        <p className="text-sm text-alerta">
          O custo ainda está aberto: falta preço em algum ingrediente, ou uma unidade não converte.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-painel2 px-3 py-2.5">
            <p className="text-xs text-texto2">Receita inteira</p>
            <p className="text-lg font-semibold">{formatarReais(custo)}</p>
          </div>
          <div className="rounded-xl bg-painel2 px-3 py-2.5">
            <p className="text-xs text-texto2">
              Por porção {porcoes > 0 ? `(de ${porcoes})` : ''}
            </p>
            <p className="text-lg font-semibold">
              {porPorcao !== null ? formatarReais(porPorcao) : '—'}
            </p>
          </div>
        </div>
      )}

      {precoSugerido !== null ? (
        <p className="rounded-xl bg-painel2 px-3 py-2.5 text-sm">
          Para um CMV de {formatarPercentual(cmvAlvo, 0)}, este prato sairia a{' '}
          <span className="font-semibold text-brasa">{formatarReais(precoSugerido)}</span>.
          <span className="mt-1 block text-xs text-texto2">
            Ajuste o alvo e veja as outras contas na aba CMV.
          </span>
        </p>
      ) : null}

      {avisos.length > 0 ? (
        <ul className="space-y-1.5">
          {avisos.map((aviso) => (
            <li
              key={aviso}
              className="rounded-xl border border-alerta/40 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta"
            >
              {aviso}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function MenuDaFicha({
  ficha,
  espacos,
  aoFechar,
  aoApagar,
}: {
  ficha: Ficha
  espacos: { id: string; nome: string }[]
  aoFechar: () => void
  aoApagar: () => void
}) {
  const [usos, setUsos] = useState<string[] | null>(null)

  const naBiblioteca = ficha.espaco_id === null
  const outros = espacos.filter((e) => e.id !== ficha.espaco_id)

  return (
    <Folha titulo={ficha.nome || 'Receita'} aoFechar={aoFechar}>
      <div className="space-y-2">
        <button
          type="button"
          className="cartao w-full bg-painel2 text-left"
          onClick={async () => {
            await moverFicha(ficha.id, naBiblioteca ? espacos[0]?.id ?? null : null)
            aoFechar()
          }}
        >
          <span className="block font-medium">
            {naBiblioteca ? 'Trazer para este restaurante' : 'Mover para a biblioteca'}
          </span>
          <span className="mt-1 block text-sm text-texto2">
            {naBiblioteca
              ? 'Sai da biblioteca e passa a pertencer a uma casa só.'
              : 'Receitas da biblioteca aparecem em todos os restaurantes. Bom para fundos, molhos mãe e massas que são seus.'}
          </span>
        </button>

        {outros.map((espaco) => (
          <button
            key={espaco.id}
            type="button"
            className="cartao w-full bg-painel2 text-left"
            onClick={async () => {
              await duplicarFicha(ficha.id, { espacoId: espaco.id })
              aoFechar()
            }}
          >
            <span className="block font-medium">Copiar para {espaco.nome}</span>
            <span className="mt-1 block text-sm text-texto2">
              Cópia independente: ajustar lá não mexe aqui.
            </span>
          </button>
        ))}

        <button
          type="button"
          className="cartao w-full border-perigo/40 bg-painel2 text-left"
          onClick={async () => setUsos(await usosDaFicha(ficha.id))}
        >
          <span className="block font-medium text-perigo">Apagar receita</span>
        </button>
      </div>

      {usos ? (
        <Folha titulo="Apagar receita" aoFechar={() => setUsos(null)}>
          {usos.length > 0 ? (
            <>
              <p className="text-sm">
                <span className="font-medium">{ficha.nome}</span> é usada dentro de:
              </p>
              <ul className="my-3 space-y-1 text-sm text-texto2">
                {usos.map((nome) => (
                  <li key={nome} className="rounded-lg bg-painel2 px-3 py-2">
                    {nome}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-texto2">
                Essas receitas ficarão com um componente faltando, e o custo delas passa a ser
                desconhecido.
              </p>
            </>
          ) : (
            <p className="text-sm text-texto2">
              Essa receita não é usada em nenhuma outra. Pode apagar tranquilo.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" className="botao-secundario flex-1" onClick={() => setUsos(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="botao flex-1 bg-perigo text-fundo"
              onClick={async () => {
                await apagarFicha(ficha.id)
                aoApagar()
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
