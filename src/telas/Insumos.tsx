import { useMemo, useState } from 'react'
import { useEspacos } from '@/dados/espacos'
import { useInsumos } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import {
  apagarInsumo,
  insumoEmBranco,
  salvarInsumo,
  usosDoInsumo,
} from '@/dados/repositorio'
import { Busca, CampoNumero, CampoTexto, SeletorUnidade, combina } from '@/ui/Campos'
import { Folha } from '@/ui/SeletorEspaco'
import { TituloTela, Vazio } from '@/ui/Cabecalhos'
import { IconeMais } from '@/ui/Icones'
import { precoPorUnidadeDeUso } from '@/dominio/custo'
import { fatorCorrecao } from '@/dominio/tecnica'
import { formatarPercentual, formatarQuantidade, formatarReais } from '@/dominio/unidades'
import type { Insumo } from '@/dominio/tipos'

export default function Insumos() {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const insumos = useInsumos(espacoAtivo?.id ?? null)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Insumo | null>(null)

  const filtrados = useMemo(
    () => (insumos ?? []).filter((i) => combina(`${i.nome} ${i.categoria} ${i.fornecedor}`, busca)),
    [insumos, busca],
  )

  return (
    <>
      <TituloTela
        titulo="Insumos"
        subtitulo="O que você compra, por quanto, e quanto se perde ao limpar."
      />

      <div className="mb-3 flex gap-2">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar insumo…" />
        <button
          type="button"
          className="botao-principal shrink-0 px-3"
          onClick={() =>
            setEditando(insumoEmBranco({ donoId: usuario!.id, espacoId: espacoAtivo!.id }))
          }
          aria-label="Novo insumo"
        >
          <IconeMais className="h-5 w-5" />
        </button>
      </div>

      {insumos === undefined ? (
        <p className="text-sm text-texto2">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <Vazio
          titulo={busca ? 'Nada com esse nome' : 'Nenhum insumo ainda'}
          texto={
            busca
              ? 'Tente outro termo, ou cadastre esse insumo agora.'
              : 'Insumo é o que você compra pronto: cebola, farinha, azeite. É deles que sai o custo de toda receita — e a lista de compras.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((insumo) => (
            <li key={insumo.id}>
              <button
                type="button"
                onClick={() => setEditando(insumo)}
                className="cartao flex w-full items-center justify-between gap-3 text-left hover:border-brasa/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{insumo.nome}</span>
                  <span className="block truncate text-xs text-texto2">
                    {[insumo.categoria, insumo.fornecedor].filter(Boolean).join(' · ') ||
                      'Sem categoria'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <PrecoDeUso insumo={insumo} />
                  {insumo.fator_correcao > 1 ? (
                    <span className="block text-xs text-texto2">
                      perde {formatarPercentual(1 - 1 / insumo.fator_correcao, 0)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando ? (
        <EditorInsumo insumo={editando} aoFechar={() => setEditando(null)} />
      ) : null}
    </>
  )
}

function PrecoDeUso({ insumo }: { insumo: Insumo }) {
  const preco = precoPorUnidadeDeUso(insumo)
  if (preco === null) {
    return <span className="block text-sm text-alerta">sem preço</span>
  }
  return (
    <span className="block text-sm">
      {formatarReais(preco)}
      <span className="text-texto2">/{insumo.unidade_uso}</span>
    </span>
  )
}

function EditorInsumo({ insumo, aoFechar }: { insumo: Insumo; aoFechar: () => void }) {
  const [rascunho, setRascunho] = useState<Insumo>(insumo)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoApagar, setConfirmandoApagar] = useState<string[] | null>(null)

  const novo = insumo.nome === ''
  const preco = precoPorUnidadeDeUso(rascunho)

  function mudar<K extends keyof Insumo>(campo: K, valor: Insumo[K]) {
    setRascunho((r) => ({ ...r, [campo]: valor }))
  }

  async function guardar() {
    if (!rascunho.nome.trim()) {
      setErro('Dê um nome ao insumo.')
      return
    }
    await salvarInsumo(rascunho)
    aoFechar()
  }

  async function pedirParaApagar() {
    setConfirmandoApagar(await usosDoInsumo(rascunho.id))
  }

  return (
    <Folha titulo={novo ? 'Novo insumo' : rascunho.nome || 'Insumo'} aoFechar={aoFechar}>
      <div className="space-y-4">
        <CampoTexto
          rotulo="Nome"
          valor={rascunho.nome}
          aoMudar={(v) => mudar('nome', v)}
          placeholder="Cebola"
          autoFocus={novo}
        />

        <div className="grid grid-cols-2 gap-3">
          <CampoTexto
            rotulo="Categoria"
            valor={rascunho.categoria}
            aoMudar={(v) => mudar('categoria', v)}
            placeholder="Hortifrúti"
          />
          <CampoTexto
            rotulo="Fornecedor"
            valor={rascunho.fornecedor}
            aoMudar={(v) => mudar('fornecedor', v)}
            placeholder="Feira"
          />
        </div>

        <div className="cartao space-y-3 bg-painel2">
          <p className="text-sm font-medium">Como você compra</p>
          <div className="grid grid-cols-[1fr,auto] gap-3">
            <CampoNumero
              rotulo="Quantidade"
              valor={rascunho.quantidade_compra}
              aoMudar={(v) => mudar('quantidade_compra', v)}
            />
            <SeletorUnidade
              rotulo="Unidade de compra"
              valor={rascunho.unidade_compra}
              aoMudar={(u) => mudar('unidade_compra', u)}
            />
          </div>
          <CampoNumero
            rotulo="Preço dessa quantidade"
            valor={rascunho.preco_compra}
            aoMudar={(v) => mudar('preco_compra', v)}
            sufixo="R$"
          />
        </div>

        <div className="cartao space-y-3 bg-painel2">
          <p className="text-sm font-medium">Como você usa na receita</p>
          <SeletorUnidade
            rotulo="Unidade de uso"
            valor={rascunho.unidade_uso}
            aoMudar={(u) => mudar('unidade_uso', u)}
            dica="Precisa ser da mesma grandeza da unidade de compra: massa com massa, volume com volume. Comprar em litro e usar em grama exigiria a densidade do ingrediente."
          />

          {preco !== null ? (
            <p className="rounded-xl bg-painel px-3 py-2 text-sm">
              Sai a <span className="font-medium text-brasa">{formatarReais(preco)}</span> por{' '}
              {rascunho.unidade_uso}.
            </p>
          ) : rascunho.preco_compra > 0 ? (
            <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-alerta">
              Não dá para converter {rascunho.unidade_compra} em {rascunho.unidade_uso}. Escolha
              unidades da mesma grandeza.
            </p>
          ) : null}
        </div>

        <FatorDeCorrecao
          valor={rascunho.fator_correcao}
          aoMudar={(v) => mudar('fator_correcao', v)}
        />

        <CampoTexto
          rotulo="Observação"
          valor={rascunho.observacao}
          aoMudar={(v) => mudar('observacao', v)}
          placeholder="Marca, corte, detalhe do pedido…"
        />

        {erro ? <p className="text-sm text-perigo">{erro}</p> : null}

        <div className="flex gap-2">
          <button type="button" className="botao-principal flex-1" onClick={guardar}>
            Salvar
          </button>
          {!novo ? (
            <button type="button" className="botao-secundario" onClick={pedirParaApagar}>
              Apagar
            </button>
          ) : null}
        </div>
      </div>

      {confirmandoApagar ? (
        <Folha titulo="Apagar insumo" aoFechar={() => setConfirmandoApagar(null)}>
          {confirmandoApagar.length > 0 ? (
            <>
              <p className="text-sm">
                <span className="font-medium">{rascunho.nome}</span> ainda é usado em:
              </p>
              <ul className="my-3 space-y-1 text-sm text-texto2">
                {confirmandoApagar.map((nome) => (
                  <li key={nome} className="rounded-lg bg-painel2 px-3 py-2">
                    {nome}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-texto2">
                Apagando, essas fichas ficam com um ingrediente faltando e o custo delas passa a ser
                desconhecido.
              </p>
            </>
          ) : (
            <p className="text-sm text-texto2">
              Esse insumo não é usado em nenhuma ficha. Pode apagar tranquilo.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => setConfirmandoApagar(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao flex-1 bg-perigo text-fundo"
              onClick={async () => {
                await apagarInsumo(rascunho.id)
                setConfirmandoApagar(null)
                aoFechar()
              }}
            >
              Apagar mesmo assim
            </button>
          </div>
        </Folha>
      ) : null}
    </Folha>
  )
}

/**
 * O fator de correção é o número que menos gente sabe de cabeça, então o campo vem
 * com a calculadora do lado: você pesa o bruto, pesa o limpo, e ele se preenche.
 */
function FatorDeCorrecao({
  valor,
  aoMudar,
}: {
  valor: number
  aoMudar: (v: number) => void
}) {
  const [bruto, setBruto] = useState(0)
  const [liquido, setLiquido] = useState(0)
  const [abertoCalculo, setAbertoCalculo] = useState(false)

  const podeCalcular = bruto > 0 && liquido > 0
  const calculado = podeCalcular ? fatorCorrecao(bruto, liquido) : null

  return (
    <div className="cartao space-y-3 bg-painel2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">Fator de correção</p>
        <button
          type="button"
          className="shrink-0 text-xs text-brasa hover:text-brasa2"
          onClick={() => setAbertoCalculo((a) => !a)}
        >
          {abertoCalculo ? 'fechar' : 'calcular pesando'}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-texto2">
        Quanto do que você compra vira lixo na limpeza. Cebola com casca tem fator 1,2: para ter
        100 g limpos, você compra 120 g — e paga por 120 g. Sem perda nenhuma, o fator é 1.
      </p>

      <CampoNumero rotulo="Fator" valor={valor} aoMudar={aoMudar} />

      {valor > 1 ? (
        <p className="text-xs text-texto2">
          Perda de {formatarPercentual(1 - 1 / valor, 0)} no pré-preparo.
        </p>
      ) : null}

      {abertoCalculo ? (
        <div className="space-y-3 border-t border-borda pt-3">
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero rotulo="Peso bruto" valor={bruto} aoMudar={setBruto} />
            <CampoNumero rotulo="Peso limpo" valor={liquido} aoMudar={setLiquido} />
          </div>
          {calculado ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-painel px-3 py-2">
              <span className="text-sm">
                Fator {formatarQuantidade(calculado.fator, 3)} · perde{' '}
                {formatarPercentual(calculado.perda, 0)}
              </span>
              <button
                type="button"
                className="botao-secundario px-3 py-1.5 text-sm"
                onClick={() => {
                  aoMudar(Number(calculado.fator.toFixed(3)))
                  setAbertoCalculo(false)
                }}
              >
                Usar
              </button>
            </div>
          ) : (
            <p className="text-xs text-texto2">
              Pese o ingrediente como veio e depois de limpo, na mesma unidade.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
