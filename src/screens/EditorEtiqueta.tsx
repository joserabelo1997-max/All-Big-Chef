import { useEffect, useRef, useState } from 'react'

import { duplicarPadrao, modeloAtivo, salvarModelo } from '../lib/modelos'
import { novoId } from '../lib/ids'
import { useSessao } from '../lib/useSessao'
import { lerPerfilLocal } from '../printing/printerProfile'
import type {
  Alinhamento,
  DadosEtiqueta,
  ElementoEtiqueta,
  ElementoTexto,
  ModeloEtiqueta,
} from '../printing/template'
import { PreviaEtiqueta } from '../ui/PreviaEtiqueta'

/**
 * Editor visual da etiqueta.
 *
 * A prévia real fica POR BAIXO e os alvos de arrasto ficam por cima, como
 * retângulos transparentes. É o que garante que o editor nunca minta: o que
 * você vê é o bitmap que a impressora vai receber, não uma aproximação em HTML
 * que some ou muda ao imprimir.
 *
 * Tudo é medido em milímetros. O `ESCALA` só converte para pixels na hora de
 * desenhar os alvos na tela.
 */

/** Pixels de tela por milímetro. 60 mm cabem confortavelmente num celular. */
const ESCALA = 5.6

/** Passo do arrasto. Meio milímetro é fino o bastante e evita tremer. */
const PASSO = 0.5

const EXEMPLO: DadosEtiqueta = {
  produto: 'Molho bechamel de alho-poró',
  fornecedor: 'Laticínios São João',
  pasta: 'Molhos',
  abertura: '30/08/26 14:20',
  validade: '02/09/2026',
  lote: 'L-4412',
  responsavel: 'Maria',
  codigo: 'A7K293',
  quantidade: '1 L',
  url: 'https://exemplo/#/l/demo',
}

/** Campos disponíveis para inserir num texto. */
const MARCADORES: Array<{ chave: keyof DadosEtiqueta; rotulo: string }> = [
  { chave: 'produto', rotulo: 'Produto' },
  { chave: 'validade', rotulo: 'Validade' },
  { chave: 'abertura', rotulo: 'Abertura' },
  { chave: 'fornecedor', rotulo: 'Fornecedor' },
  { chave: 'lote', rotulo: 'Lote' },
  { chave: 'responsavel', rotulo: 'Responsável' },
  { chave: 'codigo', rotulo: 'Código' },
  { chave: 'pasta', rotulo: 'Pasta' },
  { chave: 'quantidade', rotulo: 'Quantidade' },
]

export function EditorEtiqueta() {
  const { orgId, carregando } = useSessao()
  const [modelo, setModelo] = useState<ModeloEtiqueta | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const perfil = lerPerfilLocal()

  useEffect(() => {
    if (!orgId) return
    void modeloAtivo(orgId).then((m) => setModelo({ ...m, elementos: [...m.elementos] }))
  }, [orgId])

  function atualizar(id: string, mudanca: Partial<ElementoEtiqueta>) {
    setModelo((atual) =>
      atual
        ? {
            ...atual,
            elementos: atual.elementos.map((e) =>
              e.id === id ? ({ ...e, ...mudanca } as ElementoEtiqueta) : e,
            ),
          }
        : atual,
    )
  }

  function remover(id: string) {
    setModelo((atual) =>
      atual ? { ...atual, elementos: atual.elementos.filter((e) => e.id !== id) } : atual,
    )
    setSelecionado(null)
  }

  function adicionarTexto() {
    if (!modelo) return
    const novo: ElementoTexto = {
      id: novoId().slice(0, 8),
      tipo: 'texto',
      x: 2,
      y: 2,
      largura: 30,
      altura: 5,
      conteudo: 'Novo texto',
      alturaFonte: 3,
      alinhamento: 'esquerda',
      ajustar: true,
    }
    setModelo({ ...modelo, elementos: [...modelo.elementos, novo] })
    setSelecionado(novo.id)
  }

  async function guardar() {
    if (!modelo || !orgId) return
    // Um modelo vindo do embutido precisa de id próprio antes de ser salvo, ou
    // sobrescreveria o padrão de referência.
    const paraSalvar =
      modelo.id === 'padrao-60x40'
        ? { ...modelo, id: novoId(), nome: modelo.nome }
        : modelo
    await salvarModelo(orgId, paraSalvar)
    setModelo(paraSalvar)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  function restaurar() {
    const padrao = duplicarPadrao(modelo?.nome ?? 'Meu modelo')
    setModelo(modelo ? { ...padrao, id: modelo.id } : padrao)
    setSelecionado(null)
  }

  if (carregando || !modelo) {
    return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>
  }

  const elemento = modelo.elementos.find((e) => e.id === selecionado) ?? null

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Editor de etiqueta</h1>
      <p className="mb-5 text-sm text-slate-500">
        Arraste os campos. A prévia é o bitmap real que a impressora recebe.
      </p>

      <Tela
        modelo={modelo}
        selecionado={selecionado}
        dpi={perfil?.dpi ?? 203}
        aoSelecionar={setSelecionado}
        aoMover={(id, x, y) => atualizar(id, { x, y })}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-secundario px-4" onClick={adicionarTexto}>
          + Texto
        </button>
        <button className="btn-secundario px-4" onClick={restaurar}>
          Restaurar padrão
        </button>
      </div>

      {elemento ? (
        <Propriedades
          elemento={elemento}
          modelo={modelo}
          aoMudar={(mudanca) => atualizar(elemento.id, mudanca)}
          aoRemover={() => remover(elemento.id)}
          aoFechar={() => setSelecionado(null)}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-slate-400">
          Toque num campo da etiqueta para editá-lo.
        </p>
      )}

      <button className="btn-primario mt-8 w-full" onClick={() => void guardar()}>
        Salvar modelo
      </button>

      {salvo && (
        <p
          className="mt-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-center text-sm text-emerald-900"
          role="status"
        >
          Modelo salvo. As próximas impressões já usam este layout.
        </p>
      )}
    </div>
  )
}

/** Prévia real com os alvos de arrasto sobrepostos. */
function Tela({
  modelo,
  selecionado,
  dpi,
  aoSelecionar,
  aoMover,
}: {
  modelo: ModeloEtiqueta
  selecionado: string | null
  dpi: number
  aoSelecionar: (id: string) => void
  aoMover: (id: string, x: number, y: number) => void
}) {
  const area = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const largura = modelo.larguraMm * ESCALA
  const altura = modelo.alturaMm * ESCALA

  function aoPressionar(evento: React.PointerEvent, el: ElementoEtiqueta) {
    evento.preventDefault()
    aoSelecionar(el.id)
    const caixa = area.current?.getBoundingClientRect()
    if (!caixa) return

    arrasto.current = {
      id: el.id,
      // Guarda onde dentro do elemento o dedo tocou, para que ele não "pule"
      // para debaixo do dedo ao começar o arrasto.
      dx: (evento.clientX - caixa.left) / ESCALA - el.x,
      dy: (evento.clientY - caixa.top) / ESCALA - el.y,
    }
    evento.currentTarget.setPointerCapture(evento.pointerId)
  }

  function aoArrastar(evento: React.PointerEvent) {
    const atual = arrasto.current
    const caixa = area.current?.getBoundingClientRect()
    if (!atual || !caixa) return

    const el = modelo.elementos.find((e) => e.id === atual.id)
    if (!el) return

    const larguraEl = 'largura' in el ? el.largura : 'tamanho' in el ? el.tamanho : 0
    const alturaEl =
      'altura' in el
        ? el.altura
        : 'tamanho' in el
          ? el.tamanho
          : el.tipo === 'linha'
            ? el.espessura
            : 0

    const bruto = {
      x: (evento.clientX - caixa.left) / ESCALA - atual.dx,
      y: (evento.clientY - caixa.top) / ESCALA - atual.dy,
    }

    // Preso dentro da etiqueta: um elemento arrastado para fora não é cortado
    // com aviso, some da impressão em silêncio.
    const x = travar(arredondar(bruto.x), 0, modelo.larguraMm - larguraEl)
    const y = travar(arredondar(bruto.y), 0, modelo.alturaMm - alturaEl)

    aoMover(atual.id, x, y)
  }

  return (
    <div
      ref={area}
      className="relative mx-auto touch-none select-none"
      style={{ width: largura, height: altura }}
    >
      <PreviaEtiqueta
        modelo={modelo}
        dados={EXEMPLO}
        dpi={dpi}
        larguraExibicao={largura}
        semBorda
      />

      <div className="absolute inset-0" style={{ height: altura }}>
        {modelo.elementos.map((el) => {
          const larguraEl = 'largura' in el ? el.largura : 'tamanho' in el ? el.tamanho : 4
          const alturaEl =
            'altura' in el
              ? el.altura
              : 'tamanho' in el
                ? el.tamanho
                : el.tipo === 'linha'
                  ? Math.max(el.espessura, 1.5)
                  : 4

          return (
            <button
              key={el.id}
              onPointerDown={(e) => aoPressionar(e, el)}
              onPointerMove={aoArrastar}
              onPointerUp={() => (arrasto.current = null)}
              onPointerCancel={() => (arrasto.current = null)}
              className={[
                'absolute cursor-move rounded-sm border-2 transition-colors',
                selecionado === el.id
                  ? 'border-sky-500 bg-sky-500/20'
                  : 'border-transparent hover:border-sky-300',
              ].join(' ')}
              style={{
                left: el.x * ESCALA,
                top: el.y * ESCALA,
                width: larguraEl * ESCALA,
                height: alturaEl * ESCALA,
              }}
              aria-label={`Mover ${el.id}`}
            />
          )
        })}
      </div>
    </div>
  )
}

function Propriedades({
  elemento,
  modelo,
  aoMudar,
  aoRemover,
  aoFechar,
}: {
  elemento: ElementoEtiqueta
  modelo: ModeloEtiqueta
  aoMudar: (mudanca: Partial<ElementoEtiqueta>) => void
  aoRemover: () => void
  aoFechar: () => void
}) {
  const ehTexto = elemento.tipo === 'texto'

  return (
    <div className="cartao mt-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{rotuloTipo(elemento)}</h2>
        <button className="text-sm font-semibold text-slate-500" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      {ehTexto && (
        <>
          <label className="rotulo" htmlFor="conteudo">
            Conteúdo
          </label>
          <input
            id="conteudo"
            className="campo mb-2"
            value={elemento.conteudo}
            onChange={(e) => aoMudar({ conteudo: e.target.value } as Partial<ElementoTexto>)}
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {MARCADORES.map((m) => (
              <button
                key={m.chave}
                type="button"
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600"
                onClick={() =>
                  aoMudar({
                    conteudo: `${elemento.conteudo}{{${m.chave}}}`,
                  } as Partial<ElementoTexto>)
                }
              >
                + {m.rotulo}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Numero
          rotulo="Posição X (mm)"
          valor={elemento.x}
          max={modelo.larguraMm}
          aoMudar={(x) => aoMudar({ x })}
        />
        <Numero
          rotulo="Posição Y (mm)"
          valor={elemento.y}
          max={modelo.alturaMm}
          aoMudar={(y) => aoMudar({ y })}
        />
        {'largura' in elemento && (
          <Numero
            rotulo="Largura (mm)"
            valor={elemento.largura}
            max={modelo.larguraMm}
            aoMudar={(largura) => aoMudar({ largura } as Partial<ElementoEtiqueta>)}
          />
        )}
        {ehTexto && (
          <Numero
            rotulo="Tamanho do texto (mm)"
            valor={elemento.alturaFonte}
            max={modelo.alturaMm}
            passo={0.2}
            aoMudar={(alturaFonte) =>
              aoMudar({ alturaFonte } as Partial<ElementoTexto>)
            }
          />
        )}
        {'tamanho' in elemento && (
          <Numero
            rotulo="Tamanho (mm)"
            valor={elemento.tamanho}
            max={Math.min(modelo.larguraMm, modelo.alturaMm)}
            aoMudar={(tamanho) => aoMudar({ tamanho } as Partial<ElementoEtiqueta>)}
          />
        )}
      </div>

      {ehTexto && (
        <>
          <label className="rotulo">Alinhamento</label>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(['esquerda', 'centro', 'direita'] as Alinhamento[]).map((a) => (
              <button
                key={a}
                onClick={() => aoMudar({ alinhamento: a } as Partial<ElementoTexto>)}
                className={[
                  'min-h-[2.75rem] rounded-xl border-2 text-sm font-semibold capitalize',
                  (elemento.alinhamento ?? 'esquerda') === a
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Alternador
              rotulo="Negrito"
              ligado={elemento.negrito ?? true}
              aoMudar={(negrito) => aoMudar({ negrito } as Partial<ElementoTexto>)}
            />
            <Alternador
              rotulo="MAIÚSCULAS"
              ligado={elemento.maiuscula ?? false}
              aoMudar={(maiuscula) => aoMudar({ maiuscula } as Partial<ElementoTexto>)}
            />
            <Alternador
              rotulo="Encolher p/ caber"
              ligado={elemento.ajustar !== false}
              aoMudar={(ajustar) => aoMudar({ ajustar } as Partial<ElementoTexto>)}
            />
          </div>
        </>
      )}

      <button className="btn-secundario w-full text-red-700" onClick={aoRemover}>
        Remover campo
      </button>
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  max,
  passo = PASSO,
  aoMudar,
}: {
  rotulo: string
  valor: number
  max: number
  passo?: number
  aoMudar: (valor: number) => void
}) {
  return (
    <div>
      <label className="rotulo">{rotulo}</label>
      <input
        type="number"
        className="campo"
        value={valor}
        step={passo}
        min={0}
        max={max}
        onChange={(e) => aoMudar(travar(Number(e.target.value), 0, max))}
      />
    </div>
  )
}

function Alternador({
  rotulo,
  ligado,
  aoMudar,
}: {
  rotulo: string
  ligado: boolean
  aoMudar: (ligado: boolean) => void
}) {
  return (
    <button
      onClick={() => aoMudar(!ligado)}
      className={[
        'min-h-[2.75rem] rounded-xl border-2 px-3 text-sm font-semibold',
        ligado ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {rotulo}
    </button>
  )
}

function rotuloTipo(elemento: ElementoEtiqueta): string {
  switch (elemento.tipo) {
    case 'texto':
      return 'Texto'
    case 'qrcode':
      return 'QR Code'
    case 'linha':
      return 'Linha'
    default:
      return 'Retângulo'
  }
}

function arredondar(valor: number): number {
  return Math.round(valor / PASSO) * PASSO
}

function travar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo))
}
