import type { ModeloSalvo } from '../domain/types'
import { db, salvarESincronizar } from './db'
import { novoId } from './ids'
import { MODELO_PADRAO, type ElementoEtiqueta, type ModeloEtiqueta } from '../printing/template'

/**
 * Persistência dos modelos de etiqueta.
 *
 * O layout é guardado em milímetros no campo `elements`, e não em pixels: é a
 * única unidade que sobrevive à troca de impressora, e o mesmo modelo desenhado
 * aqui imprime idêntico numa térmica de 203 e numa de 300 dpi.
 */

function paraDominio(salvo: ModeloSalvo): ModeloEtiqueta {
  return {
    id: salvo.id,
    nome: salvo.nome,
    larguraMm: Number(salvo.width_mm),
    alturaMm: Number(salvo.height_mm),
    elementos: (salvo.elements as ElementoEtiqueta[]) ?? [],
  }
}

/**
 * Modelo usado ao imprimir.
 *
 * Cai no modelo embutido quando ainda não há nenhum salvo — a cozinha precisa
 * conseguir imprimir no primeiro dia, sem passar pelo editor.
 */
export async function modeloAtivo(orgId: string): Promise<ModeloEtiqueta> {
  const salvos = await db.label_templates.where('org_id').equals(orgId).toArray()
  const validos = salvos.filter((m) => !m.deleted_at)
  const padrao = validos.find((m) => m.is_default) ?? validos[0]
  return padrao ? paraDominio(padrao) : MODELO_PADRAO
}

export async function listarModelos(orgId: string): Promise<ModeloEtiqueta[]> {
  const salvos = await db.label_templates.where('org_id').equals(orgId).toArray()
  return salvos.filter((m) => !m.deleted_at).map(paraDominio)
}

export async function salvarModelo(
  orgId: string,
  modelo: ModeloEtiqueta,
  comoPadrao = true,
): Promise<void> {
  const agora = new Date().toISOString()
  const anterior = await db.label_templates.get(modelo.id)

  if (comoPadrao) {
    // O banco tem índice único garantindo um padrão por organização; rebaixar
    // os outros aqui evita que o upsert seja recusado no sync.
    const outros = await db.label_templates.where('org_id').equals(orgId).toArray()
    for (const outro of outros) {
      if (outro.id !== modelo.id && outro.is_default) {
        await salvarESincronizar('label_templates', {
          ...outro,
          is_default: false,
          updated_at: agora,
        })
      }
    }
  }

  await salvarESincronizar('label_templates', {
    id: modelo.id,
    org_id: orgId,
    nome: modelo.nome,
    width_mm: modelo.larguraMm,
    height_mm: modelo.alturaMm,
    elements: modelo.elementos,
    is_default: comoPadrao,
    created_at: anterior?.created_at ?? agora,
    updated_at: agora,
  })
}

/** Cópia do modelo embutido, com id novo, para servir de ponto de partida. */
export function duplicarPadrao(nome = 'Meu modelo'): ModeloEtiqueta {
  return {
    ...MODELO_PADRAO,
    id: novoId(),
    nome,
    elementos: MODELO_PADRAO.elementos.map((e) => ({ ...e })),
  }
}
