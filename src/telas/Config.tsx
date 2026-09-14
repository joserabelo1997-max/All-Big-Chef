import { useEffect, useRef, useState } from 'react'
import { TIPOS_CASA, useEspacos } from '@/dados/espacos'
import { useSessao } from '@/dados/sessao'
import { useSync, ROTULO_SYNC } from '@/dados/useSync'
import { diagnostico } from '@/dados/supabase'
import { contarTudo, gerarBackup, importarBackup, nomeDoArquivo } from '@/dados/backup'
import { limparLocal } from '@/dados/db'
import type { NomeTabela } from '@/dados/db'
import { CampoNumero, CampoTexto } from '@/ui/Campos'
import { TituloTela } from '@/ui/Cabecalhos'
import { Folha, FormularioEspaco } from '@/ui/SeletorEspaco'
import { formatarPercentual } from '@/dominio/unidades'
import { FAIXAS_CMV } from '@/dominio/cmv'
import type { Espaco, TipoCasa } from '@/dominio/tipos'

const NOME_DA_TABELA: Record<NomeTabela, string> = {
  espacos: 'Restaurantes',
  insumos: 'Insumos',
  fichas: 'Receitas',
  ficha_componentes: 'Itens de receita',
  menus: 'Menus',
  menu_itens: 'Itens de menu',
  servicos: 'Serviços',
  producao_itens: 'Marcações de produção',
  compra_itens: 'Marcações de compra',
  periodos_cmv: 'Períodos de CMV',
}

export default function Config() {
  return (
    <>
      <TituloTela titulo="Configurações" />
      <div className="space-y-3">
        <Restaurantes />
        <Conta />
        <BackupEmArquivo />
        <Diagnostico />
      </div>
    </>
  )
}

function Restaurantes() {
  const { espacos, espacoAtivo, trocar, atualizar, arquivar } = useEspacos()
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Espaco | null>(null)

  return (
    <section className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Restaurantes</h2>
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-sm"
          onClick={() => setCriando(true)}
        >
          Novo
        </button>
      </div>

      <p className="text-sm leading-relaxed text-texto2">
        Cada restaurante guarda as próprias receitas, menus, serviços e compras. O que você move
        para a biblioteca — fundos, molhos mãe, massas — aparece em todos eles.
      </p>

      <ul className="space-y-1.5">
        {espacos.map((espaco) => (
          <li
            key={espaco.id}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${
              espaco.id === espacoAtivo?.id ? 'bg-painel2' : ''
            }`}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => trocar(espaco.id)}>
              <span
                className={`block truncate font-medium ${espaco.id === espacoAtivo?.id ? 'text-brasa' : ''}`}
              >
                {espaco.nome}
              </span>
              <span className="block text-xs text-texto2">
                {FAIXAS_CMV[espaco.tipo_casa].rotulo} · alvo {formatarPercentual(espaco.cmv_alvo, 0)}
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 text-sm text-texto2 hover:text-texto"
              onClick={() => setEditando(espaco)}
            >
              editar
            </button>
          </li>
        ))}
      </ul>

      {criando ? (
        <Folha titulo="Novo restaurante" aoFechar={() => setCriando(false)}>
          <FormularioEspaco comoBoasVindas aoFechar={() => setCriando(false)} />
        </Folha>
      ) : null}

      {editando ? (
        <Folha titulo={editando.nome} aoFechar={() => setEditando(null)}>
          <div className="space-y-4">
            <CampoTexto
              rotulo="Nome"
              valor={editando.nome}
              aoMudar={(v) => setEditando({ ...editando, nome: v })}
            />
            <div>
              <label className="rotulo" htmlFor="tipo-casa-edicao">
                Tipo de casa
              </label>
              <select
                id="tipo-casa-edicao"
                className="campo"
                value={editando.tipo_casa}
                onChange={(e) => setEditando({ ...editando, tipo_casa: e.target.value as TipoCasa })}
              >
                {TIPOS_CASA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <CampoNumero
              rotulo="CMV alvo"
              valor={Number((editando.cmv_alvo * 100).toFixed(1))}
              aoMudar={(v) => setEditando({ ...editando, cmv_alvo: v / 100 })}
              sufixo="%"
              dica={`A faixa saudável deste tipo de casa vai de ${formatarPercentual(FAIXAS_CMV[editando.tipo_casa].min, 0)} a ${formatarPercentual(FAIXAS_CMV[editando.tipo_casa].max, 0)}.`}
            />

            <button
              type="button"
              className="botao-principal w-full"
              onClick={async () => {
                await atualizar(editando)
                setEditando(null)
              }}
            >
              Salvar
            </button>

            {espacos.length > 1 ? (
              <button
                type="button"
                className="botao-fantasma w-full text-sm text-perigo"
                onClick={async () => {
                  await arquivar(editando.id)
                  setEditando(null)
                }}
              >
                Arquivar restaurante
              </button>
            ) : null}
          </div>
        </Folha>
      ) : null}
    </section>
  )
}

function Conta() {
  const { usuario, sair } = useSessao()
  const { estado, pendentes, ultimoErro, ultimaVez, agora } = useSync()
  const [saindo, setSaindo] = useState(false)

  return (
    <section className="cartao space-y-3">
      <h2 className="font-medium">Conta e sincronização</h2>

      <p className="text-sm text-texto2">
        Entrou como <span className="text-texto">{usuario?.email}</span>
      </p>

      <div className="rounded-xl bg-painel2 px-3 py-2.5 text-sm">
        <p>{ROTULO_SYNC[estado]}</p>
        {pendentes > 0 ? (
          <p className="mt-1 text-xs text-texto2">
            {pendentes} {pendentes === 1 ? 'alteração esperando' : 'alterações esperando'} a nuvem.
          </p>
        ) : null}
        {ultimaVez ? (
          <p className="mt-1 text-xs text-texto2">
            Última sincronização às {ultimaVez.toLocaleTimeString('pt-BR')}.
          </p>
        ) : null}
        {ultimoErro ? <p className="mt-1 text-xs text-perigo">{ultimoErro}</p> : null}
      </div>

      <div className="flex gap-2">
        <button type="button" className="botao-secundario flex-1" onClick={agora}>
          Sincronizar agora
        </button>
        <button type="button" className="botao-secundario" onClick={() => setSaindo(true)}>
          Sair
        </button>
      </div>

      {saindo ? (
        <Folha titulo="Sair da conta" aoFechar={() => setSaindo(false)}>
          {pendentes > 0 ? (
            <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-3 py-2.5 text-sm text-alerta">
              Há {pendentes} {pendentes === 1 ? 'alteração' : 'alterações'} que ainda não subiram.
              Sincronize antes de sair, ou elas se perdem junto com o espelho local.
            </p>
          ) : (
            <p className="text-sm text-texto2">
              Tudo está na nuvem. Sair apaga a cópia local deste aparelho; ao entrar de novo, ela é
              baixada inteira.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" className="botao-secundario flex-1" onClick={() => setSaindo(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="botao flex-1 bg-perigo text-fundo"
              onClick={async () => {
                await limparLocal()
                await sair()
              }}
            >
              Sair mesmo assim
            </button>
          </div>
        </Folha>
      ) : null}
    </section>
  )
}

function BackupEmArquivo() {
  const entrada = useRef<HTMLInputElement>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function exportar() {
    const backup = await gerarBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nomeDoArquivo()
    link.click()
    URL.revokeObjectURL(url)
    setRecado('Arquivo gerado. Guarde fora do celular — e-mail para você mesmo já resolve.')
  }

  async function importar(arquivo: File) {
    setErro(null)
    setRecado(null)
    try {
      const resultado = await importarBackup(await arquivo.text())
      setRecado(
        resultado.importados === 0
          ? 'Nada novo no arquivo: tudo que ele traz já está aqui igual ou mais recente.'
          : `${resultado.importados} ${resultado.importados === 1 ? 'registro trazido' : 'registros trazidos'} do arquivo.`,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="cartao space-y-3">
      <h2 className="font-medium">Backup em arquivo</h2>

      <p className="text-sm leading-relaxed text-texto2">
        Conta na nuvem também acaba: assinatura que vence, projeto apagado por engano, senha
        perdida. Um arquivo guardado por fora é a saída que não depende de ninguém.
      </p>

      <div className="flex gap-2">
        <button type="button" className="botao-secundario flex-1" onClick={exportar}>
          Exportar tudo
        </button>
        <button
          type="button"
          className="botao-secundario flex-1"
          onClick={() => entrada.current?.click()}
        >
          Importar arquivo
        </button>
      </div>

      <input
        ref={entrada}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Escolher arquivo de backup"
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          if (arquivo) void importar(arquivo)
          e.target.value = ''
        }}
      />

      <p className="text-xs leading-relaxed text-texto2">
        Importar funde, nunca substitui: o que existe nos dois lados fica com a versão mais
        recente, e o que só existe aqui sobrevive. Um arquivo antigo não desfaz o trabalho de hoje.
      </p>

      {recado ? <p className="text-sm text-erva">{recado}</p> : null}
      {erro ? <p className="text-sm text-perigo">{erro}</p> : null}
    </section>
  )
}

function Diagnostico() {
  const [contagem, setContagem] = useState<Record<NomeTabela, number> | null>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (aberto) void contarTudo().then(setContagem)
  }, [aberto])

  const temServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

  return (
    <section className="cartao">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="font-medium">Diagnóstico</span>
        <span className="text-texto2" aria-hidden="true">
          {aberto ? '−' : '+'}
        </span>
      </button>

      {aberto ? (
        <div className="mt-4 space-y-3 border-t border-borda pt-4 text-sm">
          <Linha
            rotulo="Banco na nuvem"
            valor={diagnostico.ok ? (diagnostico.host ?? 'configurado') : 'não configurado'}
            bom={diagnostico.ok}
          />
          <Linha
            rotulo="Funciona offline"
            valor={temServiceWorker ? 'sim, service worker ativo' : 'não neste navegador'}
            bom={temServiceWorker}
          />
          <Linha
            rotulo="Instalável na tela de início"
            valor={window.matchMedia('(display-mode: standalone)').matches ? 'já instalado' : 'sim'}
            bom
          />

          {contagem ? (
            <div className="space-y-1 pt-2">
              <p className="text-xs uppercase tracking-wide text-texto2">O que está guardado aqui</p>
              {(Object.keys(NOME_DA_TABELA) as NomeTabela[]).map((nome) => (
                <div key={nome} className="flex justify-between text-texto2">
                  <span>{NOME_DA_TABELA[nome]}</span>
                  <span className="font-mono">{contagem[nome]}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!diagnostico.ok ? (
            <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-3 py-2.5 text-xs leading-relaxed text-alerta">
              Falta configurar: {diagnostico.faltando.join(', ')}. O passo a passo está em
              docs/SETUP_SUPABASE.md no repositório.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Linha({ rotulo, valor, bom }: { rotulo: string; valor: string; bom: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-texto2">{rotulo}</span>
      <span className={bom ? 'text-erva' : 'text-alerta'}>{valor}</span>
    </div>
  )
}
