import { useState } from 'react'

import {
  NOMES_LINGUAGEM,
  ORDEM_DE_TESTE,
  type LinguagemImpressora,
} from '../printing/encoders'
import { imprimir } from '../printing/imprimir'
import {
  lerPerfilLocal,
  salvarPerfilLocal,
  PERFIL_PADRAO,
  type PerfilImpressora,
} from '../printing/printerProfile'
import { MODELO_PADRAO, type DadosEtiqueta } from '../printing/template'
import { foiCancelado, motivoNaoPodeImprimir } from '../printing/conectar'
import {
  conectar,
  conectarBle,
  escolherImpressora,
  inspecionar,
  ranquearCandidatos,
  type CaracteristicaEncontrada,
} from '../printing/transport/ble'
import type { Conexao } from '../printing/transport/tipos'
import { conectarUsb, escolherImpressoraUsb } from '../printing/transport/usb'
import { PreviaEtiqueta } from '../ui/PreviaEtiqueta'

/**
 * Diagnóstico da etiquetadora.
 *
 * Existe porque fabricantes como a AIYIN não publicam os UUIDs GATT nem a
 * linguagem de comando dos seus modelos, e esses valores mudam de lote para
 * lote. Em vez de chutar a partir de documentação inexistente, perguntamos à
 * própria impressora o que ela expõe e deixamos a pessoa testar os candidatos
 * até a etiqueta sair certa — depois guardamos o que funcionou.
 *
 * É a tela que transforma "não sabemos se essa impressora funciona" em
 * "funciona, e com estes parâmetros".
 */

const DADOS_TESTE: DadosEtiqueta = {
  produto: 'Teste de impressão',
  fornecedor: 'All Big Chef',
  pasta: 'Diagnóstico',
  abertura: agora(),
  validade: emDias(3),
  lote: 'TESTE',
  responsavel: 'Sistema',
  codigo: 'TESTE1',
  quantidade: '1',
  url: `${window.location.origin}${window.location.pathname}#/config/impressora`,
}

function agora(): string {
  return new Date().toLocaleDateString('pt-BR')
}

function emDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('pt-BR')
}

type Etapa = 'inicio' | 'inspecionando' | 'escolhendo' | 'testando'

export function DiagnosticoImpressora() {
  const [perfil, setPerfil] = useState<PerfilImpressora>(
    () => lerPerfilLocal() ?? PERFIL_PADRAO,
  )
  const indisponivel = motivoNaoPodeImprimir(perfil)

  const [conexao, setConexao] = useState<Conexao | null>(null)
  const [candidatos, setCandidatos] = useState<CaracteristicaEncontrada[]>([])
  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)

  /** USB não precisa de descoberta: o endpoint é achado na própria conexão. */
  async function conectarPorUsb() {
    setErro(null)
    setAviso(null)
    try {
      const device = await escolherImpressoraUsb()
      const aberta = await conectarUsb(device)
      setConexao(aberta)
      setPerfil((p) => ({ ...p, nome: aberta.nome }))
      setCandidatos([])
      setEtapa('escolhendo')
    } catch (e) {
      if (foiCancelado(e)) return
      setErro(e instanceof Error ? e.message : 'Falha ao conectar por USB.')
    }
  }

  async function parear() {
    setErro(null)
    setAviso(null)
    try {
      const aparelho = await escolherImpressora()
      setEtapa('inspecionando')

      const { server } = await conectar(aparelho)
      const achados = await inspecionar(server)
      const ranqueados = ranquearCandidatos(achados)

      setCandidatos(ranqueados)
      setEtapa('escolhendo')

      if (ranqueados.length === 0) {
        setErro(
          'A impressora conectou, mas não expôs nenhuma característica de escrita. ' +
            'Isso costuma significar que ela usa Bluetooth Clássico (SPP), que o ' +
            'navegador não alcança. Me avise se for esse o caso.',
        )
        return
      }

      // Pré-seleciona o candidato mais provável para encurtar o teste.
      const melhor = ranqueados[0]!
      setPerfil((p) => ({
        ...p,
        nome: aparelho.name ?? 'Etiquetadora',
        servicoUuid: melhor.servicoUuid,
        caracteristicaUuid: melhor.caracteristicaUuid,
      }))
      setConexao(
        await conectarBle(aparelho, melhor.servicoUuid, melhor.caracteristicaUuid),
      )
    } catch (e) {
      // Cancelar o seletor não é erro — é a pessoa desistindo.
      if (foiCancelado(e)) {
        setEtapa('inicio')
        return
      }
      setErro(e instanceof Error ? e.message : 'Falha ao parear.')
      setEtapa('inicio')
    }
  }

  async function testar() {
    if (!conexao) return
    setErro(null)
    setAviso(null)
    setEtapa('testando')

    try {
      await imprimir(conexao, MODELO_PADRAO, DADOS_TESTE, perfil, {
        aoProgredir: (p) => {
          if (p.etapa === 'enviando' && p.total) {
            setProgresso(`Enviando… ${Math.round((p.enviados! / p.total) * 100)}%`)
          } else if (p.etapa === 'renderizando') setProgresso('Gerando a etiqueta…')
          else if (p.etapa === 'conectando') setProgresso('Conectando…')
          else setProgresso(null)
        },
      })
      setAviso(
        'Enviado. Se a etiqueta saiu legível e no tamanho certo, salve o perfil. ' +
          'Se saiu em branco, toda preta ou embaralhada, troque a linguagem e teste de novo.',
      )
    } catch (e) {
      setErro(
        (e instanceof Error ? e.message : 'Falha ao imprimir.') +
          ' — se travou no meio do envio, tente reduzir o tamanho do pedaço.',
      )
    } finally {
      setProgresso(null)
      setEtapa('escolhendo')
    }
  }

  function salvar() {
    salvarPerfilLocal(perfil)
    setAviso('Perfil salvo neste aparelho.')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Diagnóstico da impressora</h1>
      <p className="mt-1 text-sm text-slate-500">
        Descobre como sua etiquetadora se comunica e guarda os parâmetros que
        funcionarem.
      </p>

      {erro && (
        <p className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {aviso}
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          1. Como conectar
        </h2>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setPerfil((p) => ({ ...p, conexao: 'usb' }))}
            className={[
              'min-h-toque rounded-xl border-2 px-3 text-sm font-semibold transition',
              perfil.conexao === 'usb'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            🔌 Cabo USB
          </button>
          <button
            onClick={() => setPerfil((p) => ({ ...p, conexao: 'ble' }))}
            className={[
              'min-h-toque rounded-xl border-2 px-3 text-sm font-semibold transition',
              perfil.conexao === 'ble'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            📶 Bluetooth
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          {perfil.conexao === 'usb'
            ? 'Mais rápido e sem pareamento — boa escolha para a impressora ' +
              'parada na bancada. Funciona no Android com cabo OTG, no Linux e ' +
              'no ChromeOS. No Windows e no Mac o sistema costuma travar o ' +
              'acesso, e no iPhone não existe.'
            : 'Funciona em qualquer aparelho, inclusive no iPhone (pelo ' +
              'navegador Bluefy). Mais lento que o cabo e precisa de pareamento.'}
        </p>

        {/* O aviso fica DENTRO desta seção, e não no lugar da tela inteira: se
            ocupasse a tela, quem está num navegador sem Bluetooth não veria os
            botões acima e não teria como trocar para USB — ficaria preso. */}
        {indisponivel ? (
          <div className="cartao border-amber-300 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">{indisponivel}</p>
            <p className="mt-2 text-sm text-amber-800">
              Você ainda pode escolher a outra forma de conexão nos botões acima.
            </p>
          </div>
        ) : (
          <button
            className="btn-primario w-full"
            onClick={() => void (perfil.conexao === 'usb' ? conectarPorUsb() : parear())}
          >
            {conexao
              ? `Reconectar (${conexao.nome})`
              : perfil.conexao === 'usb'
                ? 'Procurar impressora no USB'
                : 'Procurar etiquetadora'}
          </button>
        )}

        {etapa === 'inspecionando' && (
          <p className="mt-2 text-sm text-slate-500">Lendo os serviços do aparelho…</p>
        )}
      </section>

      {conexao && (
        <>
          {/* O canal de escrita só existe no Bluetooth: no USB o endpoint é
              descoberto sozinho na conexão. */}
          {candidatos.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              2. Canal de escrita
            </h2>
            <p className="mb-2 text-sm text-slate-500">
              O primeiro da lista é o mais provável. Se o teste não sair, volte
              aqui e tente o seguinte.
            </p>
            <div className="grid gap-2">
              {candidatos.map((c) => {
                const escolhido =
                  c.servicoUuid === perfil.servicoUuid &&
                  c.caracteristicaUuid === perfil.caracteristicaUuid
                return (
                  <button
                    key={`${c.servicoUuid}/${c.caracteristicaUuid}`}
                    onClick={() =>
                      setPerfil((p) => ({
                        ...p,
                        servicoUuid: c.servicoUuid,
                        caracteristicaUuid: c.caracteristicaUuid,
                      }))
                    }
                    className={[
                      'rounded-xl border-2 p-3 text-left transition',
                      escolhido
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white hover:border-slate-400',
                    ].join(' ')}
                  >
                    <div className="font-mono text-xs opacity-70">{c.servicoUuid}</div>
                    <div className="font-mono text-sm font-semibold">
                      {c.caracteristicaUuid}
                    </div>
                    <div className="mt-1 text-xs opacity-70">
                      {c.podeEscreverSemResposta ? 'escrita rápida' : 'escrita com resposta'}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
          )}

          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {candidatos.length > 0 ? '3.' : '2.'} Linguagem e resolução
            </h2>

            <label className="rotulo">Linguagem de comando</label>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {ORDEM_DE_TESTE.map((lang: LinguagemImpressora) => (
                <button
                  key={lang}
                  onClick={() => setPerfil((p) => ({ ...p, linguagem: lang }))}
                  className={[
                    'min-h-toque rounded-xl border-2 px-2 text-sm font-semibold transition',
                    perfil.linguagem === lang
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {NOMES_LINGUAGEM[lang]}
                </button>
              ))}
            </div>

            <label className="rotulo">Resolução da cabeça térmica</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[203, 300].map((dpi) => (
                <button
                  key={dpi}
                  onClick={() => setPerfil((p) => ({ ...p, dpi }))}
                  className={[
                    'min-h-toque rounded-xl border-2 px-2 text-sm font-semibold transition',
                    perfil.dpi === dpi
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {dpi} dpi
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Quase todas as portáteis são 203 dpi. Se a etiqueta sair maior ou
              menor que 60 × 40 mm medidos com régua, é aqui que se corrige.
            </p>

            <details className="cartao p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Ajuste fino
              </summary>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className="rotulo">Espaçamento entre etiquetas (mm)</label>
                  <input
                    type="number"
                    className="campo"
                    value={perfil.gapMm}
                    step="0.5"
                    onChange={(e) =>
                      setPerfil((p) => ({ ...p, gapMm: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="rotulo">Densidade de queima (0–15)</label>
                  <input
                    type="number"
                    className="campo"
                    value={perfil.densidade}
                    min={0}
                    max={15}
                    onChange={(e) =>
                      setPerfil((p) => ({ ...p, densidade: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="rotulo">Bytes por envio</label>
                  <input
                    type="number"
                    className="campo"
                    value={perfil.tamanhoPedaco}
                    onChange={(e) =>
                      setPerfil((p) => ({ ...p, tamanhoPedaco: Number(e.target.value) }))
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Reduza para 100 ou 60 se a impressão sair cortada no meio.
                  </p>
                </div>
              </div>
            </details>
          </section>

          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {candidatos.length > 0 ? '4.' : '3.'} Testar
            </h2>

            <PreviaEtiqueta
              modelo={MODELO_PADRAO}
              dados={DADOS_TESTE}
              dpi={perfil.dpi}
              className="mb-4"
            />

            <div className="grid gap-2">
              <button
                className="btn-primario"
                onClick={testar}
                disabled={etapa === 'testando' || !conexao}
              >
                {progresso ?? 'Imprimir etiqueta de teste'}
              </button>
              <button className="btn-secundario" onClick={salvar}>
                Salvar perfil
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
