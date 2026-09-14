import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ArquivoInvalido, gerarBackup, importarBackup } from './backup'
import { agora, db, limparLocal, novoId, salvar } from './db'
import type { Insumo } from '@/dominio/tipos'

function insumoNovo(id: string, nome: string, quando: string): Insumo {
  return {
    id,
    dono_id: 'dono',
    espaco_id: 'espaco',
    nome,
    categoria: '',
    fornecedor: '',
    quantidade_compra: 1,
    unidade_compra: 'kg',
    preco_compra: 10,
    unidade_uso: 'g',
    fator_correcao: 1,
    observacao: '',
    atualizado_em: quando,
    apagado_em: null,
  }
}

beforeEach(async () => {
  await limparLocal()
})

describe('gerarBackup', () => {
  it('leva todas as tabelas, mesmo as vazias', async () => {
    await salvar('insumos', insumoNovo(novoId(), 'Cebola', agora()))
    const backup = await gerarBackup()

    expect(backup.formato).toBe('all-big-chef')
    expect(backup.tabelas.insumos).toHaveLength(1)
    expect(backup.tabelas.fichas).toEqual([])
  })
})

describe('importarBackup', () => {
  it('recusa arquivo que não é backup deste app', async () => {
    await expect(importarBackup('{"foo":1}')).rejects.toBeInstanceOf(ArquivoInvalido)
    await expect(importarBackup('isto não é json')).rejects.toBeInstanceOf(ArquivoInvalido)
  })

  it('traz de volta o que não existe mais aqui', async () => {
    const id = novoId()
    await salvar('insumos', insumoNovo(id, 'Cebola', agora()))
    const backup = await gerarBackup()

    await limparLocal()
    const resultado = await importarBackup(JSON.stringify(backup))

    expect(resultado.importados).toBe(1)
    expect((await db.insumos.get(id))?.nome).toBe('Cebola')
  })

  it('funde em vez de substituir: o que só existe aqui sobrevive', async () => {
    const doBackup = novoId()
    await salvar('insumos', insumoNovo(doBackup, 'Cebola', agora()))
    const backup = await gerarBackup()

    await limparLocal()
    const soAqui = novoId()
    await salvar('insumos', insumoNovo(soAqui, 'Alho', agora()))

    await importarBackup(JSON.stringify(backup))

    expect(await db.insumos.count()).toBe(2)
    expect((await db.insumos.get(soAqui))?.nome).toBe('Alho')
  })

  it('a versão mais recente vence, venha ela de onde vier', async () => {
    const id = novoId()
    await salvar('insumos', insumoNovo(id, 'Nome antigo', '2020-01-01T00:00:00.000Z'))
    const backupAntigo = await gerarBackup()

    // Aqui o registro é editado depois: o arquivo velho não pode desfazer isso.
    await salvar('insumos', insumoNovo(id, 'Nome novo', '2030-01-01T00:00:00.000Z'))
    await importarBackup(JSON.stringify(backupAntigo))
    expect((await db.insumos.get(id))?.nome).toBe('Nome novo')

    // E o contrário também vale: arquivo mais novo sobrescreve o que está aqui.
    const backupNovo = JSON.parse(JSON.stringify(backupAntigo)) as typeof backupAntigo
    backupNovo.tabelas.insumos![0]!.nome = 'Nome novíssimo'
    backupNovo.tabelas.insumos![0]!.atualizado_em = '2040-01-01T00:00:00.000Z'
    await importarBackup(JSON.stringify(backupNovo))
    expect((await db.insumos.get(id))?.nome).toBe('Nome novíssimo')
  })

  it('o que foi importado também entra na fila para subir', async () => {
    const id = novoId()
    await salvar('insumos', insumoNovo(id, 'Cebola', agora()))
    const backup = await gerarBackup()
    await limparLocal()

    await importarBackup(JSON.stringify(backup))
    expect(await db.outbox.count()).toBe(1)
  })
})
