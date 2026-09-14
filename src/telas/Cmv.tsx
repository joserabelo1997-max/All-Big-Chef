import { useEffect, useMemo, useState } from 'react'
import { useEspacos } from '@/dados/espacos'
import { useContextoArvore, useFichas, usePeriodosCmv } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import {
  apagarPeriodo,
  formatarDataCurta,
  periodoEmBranco,
  salvarPeriodo,
} from '@/dados/repositorio'
import { CampoNumero, CampoTexto } from '@/ui/Campos'
import { TituloTela } from '@/ui/Cabecalhos'
import { Nota, Resultado, Verbete } from '@/ui/Verbete'
import { FAIXAS_CMV, cmvReal, desvioCmv, posicaoNaFaixa } from '@/dominio/cmv'
import {
  arredondarPreco,
  cmvDoPrato,
  margemContribuicao,
  markupDivisor,
  precoPorCmvAlvo,
} from '@/dominio/precificacao'
import { cruNecessarioParaCozido, fatorCorrecao, fatorEscala, indiceCoccao } from '@/dominio/tecnica'
import { explodirFicha } from '@/dominio/arvore'
import { custoPorPorcao } from '@/dominio/custo'
import { formatarPercentual, formatarQuantidade, formatarReais } from '@/dominio/unidades'
import { TIPOS_CASA } from '@/dados/espacos'
import type { Ficha, PeriodoCmv } from '@/dominio/tipos'

export default function Cmv() {
  const { espacoAtivo } = useEspacos()
  // O CMV real e o teórico nascem em verbetes separados, mas o desvio precisa dos
  // dois. Guardar aqui em cima evita pedir de novo o que já foi digitado.
  const [realPercentual, setRealPercentual] = useState<number | null>(null)
  const [teoricoPercentual, setTeoricoPercentual] = useState<number | null>(null)

  const alvo = espacoAtivo?.cmv_alvo ?? 0.32

  return (
    <>
      <TituloTela
        titulo="CMV e preços"
        subtitulo="Cada conta vem com o que ela significa. Para calcular rápido — e para lembrar, quando fizer falta."
      />

      <div className="space-y-3">
        <OQueECmv />
        <CmvRealDoPeriodo aoCalcular={setRealPercentual} />
        <CmvTeorico aoCalcular={setTeoricoPercentual} />
        <Desvio teorico={teoricoPercentual} real={realPercentual} />
        <MetasPorCasa />
        <PrecoDeVenda alvoPadrao={alvo} />
        <Markup />
        <Margem />
        <FatorDeCorrecao />
        <IndiceDeCoccao />
        <EscalonarReceita />
      </div>
    </>
  )
}

function OQueECmv() {
  return (
    <Verbete
      titulo="O que é CMV"
      resumo="Quanto de cada real que entra no caixa vai embora só para repor o que saiu da despensa."
      comecaAberto
    >
      <Nota>
        CMV é Custo da Mercadoria Vendida. Se o restaurante faturou R$ 100 mil no mês e gastou R$ 32
        mil em comida para produzir essas vendas, o CMV é de 32%. Os outros 68% pagam aluguel,
        folha, energia, imposto — e o que sobrar é lucro.
      </Nota>
      <Nota>
        É o número mais vigiado da cozinha porque é o único custo grande que responde ao que você faz
        todo dia: o tamanho da porção, o desperdício, o preço que você negocia com o fornecedor, a
        sobra que vira funcionário e a que vira lixo.
      </Nota>
      <Nota>
        Ele aparece de duas formas neste app. O <strong className="text-texto">real</strong> sai do
        estoque e diz o que aconteceu. O <strong className="text-texto">teórico</strong> sai das
        fichas técnicas e diz o que deveria ter acontecido. A distância entre os dois é onde mora o
        dinheiro que some.
      </Nota>
    </Verbete>
  )
}

function CmvRealDoPeriodo({ aoCalcular }: { aoCalcular: (p: number | null) => void }) {
  const { espacoAtivo } = useEspacos()
  const { usuario } = useSessao()
  const periodos = usePeriodosCmv(espacoAtivo?.id ?? null)
  const [rascunho, setRascunho] = useState<PeriodoCmv | null>(null)

  const emEdicao =
    rascunho ??
    (usuario && espacoAtivo
      ? periodoEmBranco({ donoId: usuario.id, espacoId: espacoAtivo.id })
      : null)

  const resultado = emEdicao
    ? cmvReal({
        estoqueInicial: emEdicao.estoque_inicial,
        compras: emEdicao.compras,
        estoqueFinal: emEdicao.estoque_final,
        faturamento: emEdicao.faturamento,
      })
    : null

  // O verbete do desvio, mais abaixo, precisa deste número. Avisar de dentro de um
  // efeito em vez de durante a renderização evita escrever no estado de outro
  // componente no meio do render.
  const percentualReal = resultado?.percentual ?? null
  useEffect(() => {
    aoCalcular(percentualReal)
  }, [percentualReal, aoCalcular])

  function mudar<K extends keyof PeriodoCmv>(campo: K, valor: PeriodoCmv[K]) {
    if (!emEdicao) return
    setRascunho({ ...emEdicao, [campo]: valor })
  }

  const posicao =
    resultado?.percentual !== null && resultado && espacoAtivo
      ? posicaoNaFaixa(resultado.percentual!, espacoAtivo.tipo_casa)
      : null

  return (
    <Verbete
      titulo="CMV real do período"
      resumo="O que de fato saiu da despensa, contando o estoque nas duas pontas."
      formula="CMV = estoque inicial + compras − estoque final"
    >
      <Nota>
        Conte o estoque no primeiro dia, some tudo que entrou de nota no período, e conte de novo no
        último dia. A diferença é o que foi consumido — desperdício, sobra e erro incluídos, porque
        eles também saíram da despensa.
      </Nota>

      {emEdicao ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero
              rotulo="Estoque inicial"
              valor={emEdicao.estoque_inicial}
              aoMudar={(v) => mudar('estoque_inicial', v)}
              sufixo="R$"
            />
            <CampoNumero
              rotulo="Compras"
              valor={emEdicao.compras}
              aoMudar={(v) => mudar('compras', v)}
              sufixo="R$"
            />
            <CampoNumero
              rotulo="Estoque final"
              valor={emEdicao.estoque_final}
              aoMudar={(v) => mudar('estoque_final', v)}
              sufixo="R$"
            />
            <CampoNumero
              rotulo="Faturamento"
              valor={emEdicao.faturamento}
              aoMudar={(v) => mudar('faturamento', v)}
              sufixo="R$"
            />
          </div>

          {resultado ? (
            <div className="space-y-3">
              <Resultado rotulo="CMV em reais" valor={formatarReais(resultado.valor)} />
              {resultado.percentual !== null ? (
                <Resultado
                  rotulo="CMV sobre o faturamento"
                  valor={formatarPercentual(resultado.percentual)}
                  tom={posicao === 'dentro' ? 'bom' : posicao === 'acima' ? 'ruim' : 'atencao'}
                  leitura={
                    espacoAtivo ? (
                      <>
                        A faixa saudável para {FAIXAS_CMV[espacoAtivo.tipo_casa].rotulo.toLowerCase()}{' '}
                        é de {formatarPercentual(FAIXAS_CMV[espacoAtivo.tipo_casa].min, 0)} a{' '}
                        {formatarPercentual(FAIXAS_CMV[espacoAtivo.tipo_casa].max, 0)}.{' '}
                        {posicao === 'acima'
                          ? 'Acima disso, a comida está comendo o lucro.'
                          : posicao === 'abaixo'
                            ? 'Abaixo pode ser ótimo — ou porção pequena demais e cliente insatisfeito.'
                            : 'Está no lugar.'}
                      </>
                    ) : null
                  }
                />
              ) : (
                <Nota>Informe o faturamento para ver o CMV em percentual.</Nota>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <CampoTexto
              rotulo="Nome do período"
              valor={emEdicao.rotulo}
              aoMudar={(v) => mudar('rotulo', v)}
            />
            <div className="flex items-end">
              <button
                type="button"
                className="botao-secundario w-full"
                onClick={async () => {
                  await salvarPeriodo(emEdicao)
                  setRascunho(
                    usuario && espacoAtivo
                      ? periodoEmBranco({ donoId: usuario.id, espacoId: espacoAtivo.id })
                      : null,
                  )
                }}
              >
                Guardar período
              </button>
            </div>
          </div>
        </>
      ) : null}

      {periodos && periodos.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-texto2">Períodos guardados</p>
          <ul className="space-y-1.5">
            {periodos.map((periodo) => {
              const r = cmvReal({
                estoqueInicial: periodo.estoque_inicial,
                compras: periodo.compras,
                estoqueFinal: periodo.estoque_final,
                faturamento: periodo.faturamento,
              })
              return (
                <li
                  key={periodo.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-painel2 px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{periodo.rotulo}</span>
                    <span className="block text-xs text-texto2">
                      {formatarDataCurta(periodo.inicio)} · {formatarReais(r.valor)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium">
                      {r.percentual !== null ? formatarPercentual(r.percentual) : '—'}
                    </span>
                    <button
                      type="button"
                      aria-label={`Apagar ${periodo.rotulo}`}
                      className="text-texto2 hover:text-perigo"
                      onClick={() => void apagarPeriodo(periodo.id)}
                    >
                      ×
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <Nota>
            Guardar mês a mês é o que transforma um número solto numa linha: é a tendência que conta
            a história, não a foto de um mês.
          </Nota>
        </div>
      ) : null}
    </Verbete>
  )
}

interface LinhaVenda {
  fichaId: string
  quantidade: number
}

function CmvTeorico({ aoCalcular }: { aoCalcular: (p: number | null) => void }) {
  const { espacoAtivo } = useEspacos()
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)
  const [linhas, setLinhas] = useState<LinhaVenda[]>([])
  const [faturamento, setFaturamento] = useState(0)

  const pratos = fichas.filter((f) => f.tipo === 'prato')

  const custoPorFicha = useMemo(() => {
    const mapa = new Map<string, number | null>()
    if (!ctx) return mapa
    for (const ficha of pratos) {
      const explosao = explodirFicha(ctx, ficha.id)
      mapa.set(ficha.id, custoPorPorcao(explosao.raiz.custo, ficha.porcoes))
    }
    return mapa
  }, [ctx, pratos])

  const total = useMemo(() => {
    let soma = 0
    for (const linha of linhas) {
      const custo = custoPorFicha.get(linha.fichaId)
      if (custo === null || custo === undefined) return null
      soma += custo * linha.quantidade
    }
    return soma
  }, [linhas, custoPorFicha])

  const percentual = total !== null && faturamento > 0 ? total / faturamento : null
  useEffect(() => {
    aoCalcular(percentual)
  }, [percentual, aoCalcular])

  return (
    <Verbete
      titulo="CMV teórico"
      resumo="O que as suas fichas dizem que aquelas vendas deveriam ter custado."
      formula="CMV teórico = Σ (custo da porção × quantidade vendida)"
    >
      <Nota>
        Este é o padrão da casa. Ele não olha o estoque: olha a receita. Se a ficha diz que o prato
        custa R$ 12 e você vendeu 200, o teórico daquele prato é R$ 2.400 — quer a cozinha tenha
        seguido a ficha, quer não.
      </Nota>

      {pratos.length === 0 ? (
        <Nota>
          Cadastre pratos com preço de insumo para usar esta conta. Ela se alimenta das fichas
          técnicas.
        </Nota>
      ) : (
        <>
          <div className="space-y-2">
            {linhas.map((linha, indice) => {
              const custo = custoPorFicha.get(linha.fichaId)
              return (
                <div key={indice} className="rounded-xl bg-painel2 p-3">
                  <div className="grid grid-cols-[1fr,auto] items-end gap-2">
                    <div>
                      <label className="rotulo" htmlFor={`prato-${indice}`}>
                        Prato
                      </label>
                      <select
                        id={`prato-${indice}`}
                        className="campo"
                        value={linha.fichaId}
                        onChange={(e) =>
                          setLinhas((atuais) =>
                            atuais.map((l, i) =>
                              i === indice ? { ...l, fichaId: e.target.value } : l,
                            ),
                          )
                        }
                      >
                        {pratos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome || 'Sem nome'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      aria-label="Remover linha"
                      className="botao-fantasma px-3 py-2.5 text-perigo"
                      onClick={() => setLinhas((atuais) => atuais.filter((_, i) => i !== indice))}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2">
                    <CampoNumero
                      rotulo="Quantidade vendida"
                      valor={linha.quantidade}
                      aoMudar={(v) =>
                        setLinhas((atuais) =>
                          atuais.map((l, i) => (i === indice ? { ...l, quantidade: v } : l)),
                        )
                      }
                      dica={
                        custo !== null && custo !== undefined
                          ? `Custo da porção: ${formatarReais(custo)}`
                          : 'Este prato ainda está com o custo aberto.'
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className="botao-secundario w-full"
            onClick={() =>
              setLinhas((atuais) => [...atuais, { fichaId: pratos[0]!.id, quantidade: 0 }])
            }
          >
            + Adicionar prato vendido
          </button>

          <CampoNumero
            rotulo="Faturamento do período"
            valor={faturamento}
            aoMudar={setFaturamento}
            sufixo="R$"
          />

          {linhas.length > 0 ? (
            total === null ? (
              <Nota>
                Algum prato da lista ainda não tem custo fechado, então o teórico fica em aberto.
              </Nota>
            ) : (
              <div className="space-y-3">
                <Resultado rotulo="Custo teórico" valor={formatarReais(total)} />
                {percentual !== null ? (
                  <Resultado
                    rotulo="CMV teórico"
                    valor={formatarPercentual(percentual)}
                    leitura="É contra este número que o CMV real vai ser comparado, logo abaixo."
                  />
                ) : null}
              </div>
            )
          ) : null}
        </>
      )}
    </Verbete>
  )
}

function Desvio({ teorico, real }: { teorico: number | null; real: number | null }) {
  const [manualTeorico, setManualTeorico] = useState(0)
  const [manualReal, setManualReal] = useState(0)

  const usandoTeorico = teorico ?? manualTeorico / 100
  const usandoReal = real ?? manualReal / 100
  const temDados = usandoTeorico > 0 && usandoReal > 0
  const resultado = temDados ? desvioCmv(usandoTeorico, usandoReal) : null

  return (
    <Verbete
      titulo="Desvio: teórico × real"
      resumo="A conta que mostra o dinheiro que saiu da operação sem virar venda."
      formula="desvio = CMV real − CMV teórico (em pontos percentuais)"
    >
      <Nota>
        Se a ficha manda 180 g e a cozinha põe 220, a diferença não aparece em relatório nenhum — ela
        aparece aqui. Desperdício não anotado, quebra, porção fora do padrão, erro de lançamento e
        furo de estoque, todos desembocam nesta conta.
      </Nota>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero
          rotulo="CMV teórico"
          valor={teorico !== null ? Number((teorico * 100).toFixed(2)) : manualTeorico}
          aoMudar={setManualTeorico}
          sufixo="%"
          disabled={teorico !== null}
          dica={teorico !== null ? 'Vindo do verbete acima.' : undefined}
        />
        <CampoNumero
          rotulo="CMV real"
          valor={real !== null ? Number((real * 100).toFixed(2)) : manualReal}
          aoMudar={setManualReal}
          sufixo="%"
          disabled={real !== null}
          dica={real !== null ? 'Vindo do período preenchido acima.' : undefined}
        />
      </div>

      {resultado ? (
        <Resultado
          rotulo="Diferença"
          valor={`${resultado.pontos > 0 ? '+' : ''}${formatarQuantidade(resultado.pontos, 1)} p.p.`}
          tom={
            resultado.classificacao === 'saudavel'
              ? 'bom'
              : resultado.classificacao === 'atencao'
                ? 'atencao'
                : 'ruim'
          }
          leitura={resultado.explicacao}
        />
      ) : (
        <Nota>Preencha os dois percentuais para ver a diferença.</Nota>
      )}

      <div className="rounded-xl bg-painel2 px-3 py-3 text-sm">
        <p className="mb-2 font-medium">Como ler a diferença</p>
        <ul className="space-y-1.5 text-texto2">
          <li>
            <span className="text-erva">Até 2 pontos</span> — variação normal de cozinha.
          </li>
          <li>
            <span className="text-alerta">De 2 a 4 pontos</span> — comece a pesar porções e conferir
            o registro de perdas.
          </li>
          <li>
            <span className="text-perigo">Acima de 4 pontos</span> — tem problema de operação, não de
            arredondamento.
          </li>
        </ul>
      </div>
    </Verbete>
  )
}

function MetasPorCasa() {
  const { espacoAtivo, atualizar } = useEspacos()

  return (
    <Verbete
      titulo="Metas por tipo de casa"
      resumo="Onde o seu CMV deveria estar, dependendo do que você serve."
    >
      <Nota>
        São referências de mercado, não lei. Um japonês trabalha com peixe caro e convive bem com
        40%; um fast food que passe de 30% já está apertado. O que manda de verdade é a sua
        estrutura de custo — mas é bom saber onde os outros estão.
      </Nota>

      <ul className="space-y-1.5">
        {TIPOS_CASA.map((tipo) => {
          const faixa = FAIXAS_CMV[tipo.valor]
          const ehAtual = espacoAtivo?.tipo_casa === tipo.valor
          return (
            <li
              key={tipo.valor}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                ehAtual ? 'bg-painel2 text-brasa' : 'text-texto2'
              }`}
            >
              <span>{faixa.rotulo}</span>
              <span className="font-mono">
                {formatarPercentual(faixa.min, 0)}–{formatarPercentual(faixa.max, 0)}
              </span>
            </li>
          )
        })}
      </ul>

      {espacoAtivo ? (
        <CampoNumero
          rotulo="Seu CMV alvo"
          valor={Number((espacoAtivo.cmv_alvo * 100).toFixed(1))}
          aoMudar={(v) => void atualizar({ ...espacoAtivo, cmv_alvo: v / 100 })}
          sufixo="%"
          dica="É este número que o app usa para sugerir preço nas fichas técnicas."
        />
      ) : null}
    </Verbete>
  )
}

function PrecoDeVenda({ alvoPadrao }: { alvoPadrao: number }) {
  const { espacoAtivo } = useEspacos()
  const fichas = useFichas(espacoAtivo?.id ?? null) ?? []
  const ctx = useContextoArvore(espacoAtivo?.id ?? null)

  const [custo, setCusto] = useState(0)
  const [alvo, setAlvo] = useState(Number((alvoPadrao * 100).toFixed(1)))

  const preco = precoPorCmvAlvo(custo, alvo / 100)
  const pratos = fichas.filter((f) => f.tipo === 'prato')

  return (
    <Verbete
      titulo="Preço de venda pelo CMV alvo"
      resumo="A conta mais direta: do custo do prato ao preço do menu."
      formula="preço = custo da porção ÷ CMV alvo"
    >
      <Nota>
        Se o prato custa R$ 12 e você quer que a comida seja 30% do preço, ele sai a R$ 40. Repare
        que dividir por 0,30 é o mesmo que multiplicar por 3,33 — a conta que muita cozinha faz de
        cabeça sem saber que é esta.
      </Nota>

      <PuxarCustoDeFicha pratos={pratos} ctx={ctx} aoEscolher={setCusto} />

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="Custo da porção" valor={custo} aoMudar={setCusto} sufixo="R$" />
        <CampoNumero rotulo="CMV alvo" valor={alvo} aoMudar={setAlvo} sufixo="%" />
      </div>

      {preco !== null ? (
        <div className="space-y-3">
          <Resultado rotulo="Preço sugerido" valor={formatarReais(preco)} />
          <div className="grid grid-cols-3 gap-2">
            {(['inteiro', 'noventa', 'meio'] as const).map((estilo) => {
              const arredondado = arredondarPreco(preco, estilo)
              if (arredondado === null) return null
              const cmvEfetivo = cmvDoPrato(custo, arredondado)
              return (
                <div key={estilo} className="rounded-xl bg-painel2 px-2 py-2 text-center">
                  <p className="text-sm font-medium">{formatarReais(arredondado)}</p>
                  <p className="text-[11px] text-texto2">
                    {cmvEfetivo !== null ? formatarPercentual(cmvEfetivo) : '—'}
                  </p>
                </div>
              )
            })}
          </div>
          <Nota>
            Arredondar muda o CMV de verdade do prato. Subir o preço derruba o percentual; descer
            para terminar em 90 centavos sobe um pouco.
          </Nota>
        </div>
      ) : (
        <Nota>O CMV alvo precisa estar entre 1% e 99% para existir preço possível.</Nota>
      )}
    </Verbete>
  )
}

function PuxarCustoDeFicha({
  pratos,
  ctx,
  aoEscolher,
}: {
  pratos: Ficha[]
  ctx: ReturnType<typeof useContextoArvore>
  aoEscolher: (custo: number) => void
}) {
  if (pratos.length === 0 || !ctx) return null

  return (
    <div>
      <label className="rotulo" htmlFor="puxar-ficha">
        Puxar o custo de uma ficha
      </label>
      <select
        id="puxar-ficha"
        className="campo"
        defaultValue=""
        onChange={(e) => {
          const ficha = pratos.find((p) => p.id === e.target.value)
          if (!ficha) return
          const explosao = explodirFicha(ctx, ficha.id)
          const porPorcao = custoPorPorcao(explosao.raiz.custo, ficha.porcoes)
          if (porPorcao !== null) aoEscolher(Number(porPorcao.toFixed(4)))
        }}
      >
        <option value="">Escolher um prato…</option>
        {pratos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome || 'Sem nome'}
          </option>
        ))}
      </select>
    </div>
  )
}

function Markup() {
  const [custo, setCusto] = useState(0)
  const [fixo, setFixo] = useState(25)
  const [variavel, setVariavel] = useState(12)
  const [lucro, setLucro] = useState(15)

  const resultado = markupDivisor([fixo / 100, variavel / 100, lucro / 100])
  const preco = resultado ? custo * resultado.markup : null

  return (
    <Verbete
      titulo="Markup"
      resumo="Preço que cobre, além da comida, o custo fixo, a despesa variável e o lucro que você quer."
      formula="markup = 1 ÷ (1 − custo fixo% − despesa variável% − lucro%)"
    >
      <Nota>
        O CMV alvo olha só a comida. O markup olha o preço inteiro e reparte: esta fatia paga
        aluguel e folha, esta paga cartão, imposto e taxa de delivery, esta é o lucro que você quer
        levar. O que sobra é o espaço que o prato tem para custar.
      </Nota>

      <CampoNumero rotulo="Custo da porção" valor={custo} aoMudar={setCusto} sufixo="R$" />

      <div className="grid grid-cols-3 gap-2">
        <CampoNumero rotulo="Custo fixo" valor={fixo} aoMudar={setFixo} sufixo="%" />
        <CampoNumero rotulo="Desp. variável" valor={variavel} aoMudar={setVariavel} sufixo="%" />
        <CampoNumero rotulo="Lucro" valor={lucro} aoMudar={setLucro} sufixo="%" />
      </div>

      {resultado === null ? (
        <Resultado
          rotulo="Markup"
          valor="impossível"
          tom="ruim"
          leitura="Os percentuais somam 100% ou mais: não sobra espaço nenhum para o custo da comida. Reduza alguma fatia."
        />
      ) : (
        <div className="space-y-3">
          <Resultado
            rotulo="Markup"
            valor={`${formatarQuantidade(resultado.markup, 3)}×`}
            leitura={`As três fatias somam ${formatarPercentual(resultado.totalPercentuais, 0)} do preço. Sobram ${formatarPercentual(1 - resultado.totalPercentuais, 0)} para a comida.`}
          />
          {preco !== null && custo > 0 ? (
            <Resultado
              rotulo="Preço sugerido"
              valor={formatarReais(preco)}
              leitura={
                <>
                  O CMV deste prato ficaria em{' '}
                  {formatarPercentual(1 - resultado.totalPercentuais)} do preço.
                </>
              }
            />
          ) : null}
        </div>
      )}
    </Verbete>
  )
}

function Margem() {
  const [preco, setPreco] = useState(0)
  const [custoVariavel, setCustoVariavel] = useState(0)

  const resultado = preco > 0 ? margemContribuicao(preco, custoVariavel) : null

  return (
    <Verbete
      titulo="Margem de contribuição"
      resumo="Quanto cada prato vendido deixa para pagar as contas da casa."
      formula="margem = preço de venda − custos variáveis"
    >
      <Nota>
        Custo variável é o que só existe quando o prato é vendido: a comida, a embalagem, a taxa do
        cartão, a comissão do aplicativo. O que sobra é a contribuição daquele prato para pagar
        aluguel e folha — e, depois disso, virar lucro.
      </Nota>
      <Nota>
        É por isso que o prato mais barato do menu pode ser o melhor negócio da casa: o que importa
        não é o percentual, é quantos reais ele deixa vezes quantas vezes ele sai.
      </Nota>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="Preço de venda" valor={preco} aoMudar={setPreco} sufixo="R$" />
        <CampoNumero
          rotulo="Custos variáveis"
          valor={custoVariavel}
          aoMudar={setCustoVariavel}
          sufixo="R$"
        />
      </div>

      {resultado ? (
        <Resultado
          rotulo="Margem de contribuição"
          valor={formatarReais(resultado.valor)}
          tom={resultado.valor < 0 ? 'ruim' : 'bom'}
          leitura={
            resultado.percentual !== null ? (
              resultado.valor < 0 ? (
                <>
                  Este prato sai no prejuízo: cada venda tira{' '}
                  {formatarReais(Math.abs(resultado.valor))} do caixa.
                </>
              ) : (
                <>
                  {formatarPercentual(resultado.percentual)} do preço sobra para pagar o resto da
                  operação.
                </>
              )
            ) : null
          }
        />
      ) : null}
    </Verbete>
  )
}

function FatorDeCorrecao() {
  const [bruto, setBruto] = useState(0)
  const [liquido, setLiquido] = useState(0)

  const resultado = bruto > 0 && liquido > 0 ? fatorCorrecao(bruto, liquido) : null

  return (
    <Verbete
      titulo="Fator de correção"
      resumo="Quanto do que você compra vira lixo antes de chegar na panela."
      formula="FC = peso bruto ÷ peso líquido"
    >
      <Nota>
        Pese o ingrediente como veio do fornecedor e de novo depois de limpo. A razão entre os dois
        é o fator. Ele é o que separa a quantidade da receita da quantidade da lista de compras — e
        é o que você paga.
      </Nota>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="Peso bruto" valor={bruto} aoMudar={setBruto} />
        <CampoNumero rotulo="Peso limpo" valor={liquido} aoMudar={setLiquido} />
      </div>

      {resultado ? (
        <Resultado
          rotulo="Fator de correção"
          valor={formatarQuantidade(resultado.fator, 3)}
          leitura={
            <>
              Perda de {formatarPercentual(resultado.perda)} no pré-preparo. Para ter 1 kg limpo,
              compre {formatarQuantidade(resultado.fator, 3)} kg.
            </>
          }
        />
      ) : (
        <Nota>Informe os dois pesos, na mesma unidade.</Nota>
      )}
    </Verbete>
  )
}

function IndiceDeCoccao() {
  const [cru, setCru] = useState(0)
  const [cozido, setCozido] = useState(0)
  const [porcaoCozida, setPorcaoCozida] = useState(0)

  const resultado = cru > 0 && cozido > 0 ? indiceCoccao(cozido, cru) : null
  const cruNecessario =
    resultado && porcaoCozida > 0 ? cruNecessarioParaCozido(porcaoCozida, resultado.indice) : null

  return (
    <Verbete
      titulo="Índice de cocção"
      resumo="Quanto o alimento ganha ou perde de peso ao cozinhar."
      formula="IC = peso cozido ÷ peso limpo cru"
    >
      <Nota>
        Cereal absorve água e cresce: arroz sai perto de 2,5. Carne e legume soltam água e encolhem:
        carne assada fica lá pelos 0,7. Importa porque a porção que você promete no menu é a porção
        cozida, e o que você compra é a crua.
      </Nota>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="Peso limpo cru" valor={cru} aoMudar={setCru} />
        <CampoNumero rotulo="Peso depois de cozido" valor={cozido} aoMudar={setCozido} />
      </div>

      {resultado ? (
        <>
          <Resultado
            rotulo="Índice de cocção"
            valor={formatarQuantidade(resultado.indice, 3)}
            leitura={
              resultado.sentido === 'ganhou' ? (
                <>Ganhou {formatarPercentual(resultado.variacao)} de peso na cocção.</>
              ) : resultado.sentido === 'perdeu' ? (
                <>Perdeu {formatarPercentual(Math.abs(resultado.variacao))} de peso na cocção.</>
              ) : (
                'Saiu do fogo com o mesmo peso.'
              )
            }
          />

          <CampoNumero
            rotulo="Porção servida (cozida)"
            valor={porcaoCozida}
            aoMudar={setPorcaoCozida}
            dica="Para descobrir quanto de cru essa porção exige."
          />

          {cruNecessario !== null ? (
            <Resultado
              rotulo="Cru necessário por porção"
              valor={formatarQuantidade(cruNecessario, 1)}
              leitura="É esta quantidade que deve entrar na ficha técnica, não a cozida."
            />
          ) : null}
        </>
      ) : (
        <Nota>Informe os dois pesos, na mesma unidade.</Nota>
      )}
    </Verbete>
  )
}

function EscalonarReceita() {
  const [rende, setRende] = useState(0)
  const [preciso, setPreciso] = useState(0)

  const fator = rende > 0 && preciso > 0 ? fatorEscala(rende, preciso) : null

  return (
    <Verbete
      titulo="Escalonar receita"
      resumo="Multiplicar uma receita para o número de porções do dia."
      formula="fator = rendimento desejado ÷ rendimento original"
    >
      <Nota>
        Multiplique cada ingrediente por este fator. Vale para quantidade — tempero, tempo de cocção
        e tamanho de panela não escalam junto, e é aí que a receita dobrada costuma dar errado.
      </Nota>

      <div className="grid grid-cols-2 gap-3">
        <CampoNumero rotulo="A receita rende" valor={rende} aoMudar={setRende} />
        <CampoNumero rotulo="Você precisa de" valor={preciso} aoMudar={setPreciso} />
      </div>

      {fator !== null ? (
        <Resultado
          rotulo="Multiplique tudo por"
          valor={`${formatarQuantidade(fator, 3)}×`}
          leitura="Na tela de Produção, o app já faz essa conta sozinho a partir das porções do serviço."
        />
      ) : null}
    </Verbete>
  )
}
