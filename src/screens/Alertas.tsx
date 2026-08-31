import { useEffect, useState } from 'react'

import { DIAS_DA_SEMANA } from '../domain/expiry'
import {
  lerPreferencias,
  PREFERENCIAS_PADRAO,
  salvarPreferencias,
  type PreferenciasAlerta,
} from '../lib/configuracoes'
import { useSessao } from '../lib/useSessao'
import {
  ativar,
  desativar,
  estadoAtual,
  EXPLICACAO,
  type EstadoPush,
} from '../notifications/push'

const DIAS_SUGERIDOS = [1, 2, 3, 5, 7]

export function Alertas() {
  const { orgId, carregando } = useSessao()
  const [preferencias, setPreferencias] = useState<PreferenciasAlerta>(PREFERENCIAS_PADRAO)
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    if (!orgId) return
    void lerPreferencias(orgId).then(setPreferencias)
  }, [orgId])

  useEffect(() => {
    void estadoAtual().then(setEstado)
  }, [])

  async function guardar(novas: PreferenciasAlerta) {
    setPreferencias(novas)
    if (!orgId) return
    await salvarPreferencias(orgId, novas)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  async function alternarPush() {
    if (!orgId || ocupado) return
    setOcupado(true)
    setErro(null)
    try {
      setEstado(estado === 'ativo' ? await desativar() : await ativar(orgId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao configurar as notificações.')
    } finally {
      setOcupado(false)
    }
  }

  if (carregando) return <div className="px-4 py-20 text-center text-slate-400">Carregando…</div>

  const podeAlternar = estado === 'ativo' || estado === 'desativado'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Alertas de validade</h1>

      <section className="mb-8">
        <h2 className="rotulo">Avisar com quantos dias de antecedência</h2>
        <div className="mb-2 flex flex-wrap gap-2">
          {DIAS_SUGERIDOS.map((d) => (
            <button
              key={d}
              onClick={() => void guardar({ ...preferencias, diasAntes: d })}
              className={[
                'min-h-toque min-w-[3.5rem] rounded-xl border-2 px-3 font-semibold transition',
                preferencias.diasAntes === d
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              {d} {d === 1 ? 'dia' : 'dias'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Etiquetas dentro desse prazo aparecem como “vence em breve” no painel.
          O que vence hoje e o que já venceu são sempre destacados.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="rotulo">Dias em que a casa fecha</h2>
        <div className="mb-2 flex flex-wrap gap-2">
          {DIAS_DA_SEMANA.map((nome, dia) => {
            const fechado = preferencias.diasFechados.includes(dia)
            return (
              <button
                key={dia}
                aria-pressed={fechado}
                onClick={() =>
                  void guardar({
                    ...preferencias,
                    diasFechados: fechado
                      ? preferencias.diasFechados.filter((d) => d !== dia)
                      : [...preferencias.diasFechados, dia].sort((a, b) => a - b),
                  })
                }
                className={[
                  'min-h-toque min-w-[4.5rem] rounded-xl border-2 px-3 font-semibold transition',
                  fechado
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                {nome}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          O painel passa a mostrar, à parte, o que vence nesses dias — porque com
          a porta fechada não há ninguém para consumir, doar ou descartar. É um
          aviso a mais, e não substitui o “vence em breve”.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="rotulo" id="rotulo-horario">
          Horário do aviso diário
        </h2>
        <input
          type="time"
          className="campo"
          aria-labelledby="rotulo-horario"
          value={preferencias.horario}
          onChange={(e) => void guardar({ ...preferencias, horario: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Um resumo por dia, no começo do turno. Vale para todos os aparelhos do
          restaurante.
        </p>
      </section>

      <section>
        <h2 className="rotulo">Notificações neste aparelho</h2>
        <div className="cartao p-4">
          <p className="mb-3 text-sm text-slate-600">
            {estado ? EXPLICACAO[estado] : 'Verificando…'}
          </p>

          {erro && (
            <p className="mb-3 rounded-lg border-2 border-red-200 bg-red-50 p-2 text-sm text-red-800">
              {erro}
            </p>
          )}

          {podeAlternar && (
            <button
              className={estado === 'ativo' ? 'btn-secundario w-full' : 'btn-primario w-full'}
              onClick={() => void alternarPush()}
              disabled={ocupado}
            >
              {ocupado
                ? 'Aguarde…'
                : estado === 'ativo'
                  ? 'Desativar avisos aqui'
                  : 'Ativar avisos neste aparelho'}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Cada aparelho é ativado separadamente — o tablet da bancada e o celular
          do chef recebem o aviso de forma independente.
        </p>
      </section>

      {salvo && (
        <p
          className="mt-6 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-center text-sm text-emerald-900"
          role="status"
        >
          Preferências salvas.
        </p>
      )}
    </div>
  )
}
