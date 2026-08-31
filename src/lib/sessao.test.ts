import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { PADROES_PRODUTO } from '../domain/types'
import { db, registrarEvento, registrarMovimento, salvarESincronizar } from './db'
import { novoCodigoCurto, novoId } from './ids'
import { adotarOrganizacao } from './sessao'

/**
 * A migração de organização, que roda uma vez na vida do aparelho: quando o
 * restaurante entra pela primeira vez e o cadastro feito offline precisa passar
 * para a organização do servidor.
 *
 * É a função mais perigosa do app — errar aqui não dá erro, some com cadastro.
 * Por isso os testes cobrem tabela por tabela, e não só "migrou alguma coisa".
 */

const LOCAL = 'aaaa1111-1111-1111-1111-111111111111'
const SERVIDOR = 'bbbb2222-2222-2222-2222-222222222222'
const OUTRA = 'cccc3333-3333-3333-3333-333333333333'

const agora = () => new Date().toISOString()

/** Monta um cadastro completo, como o de uma cozinha que já usou o app. */
async function semearCozinha(orgId: string) {
  const t = agora()
  const pastaId = novoId()
  const fornecedorId = novoId()
  const produtoId = novoId()
  const membroId = novoId()
  const etiquetaId = novoId()

  await salvarESincronizar('folders', {
    id: pastaId,
    org_id: orgId,
    nome: 'Laticínios',
    cor: '#0ea5e9',
    ordem: 1,
    created_at: t,
    updated_at: t,
  })
  await salvarESincronizar('suppliers', {
    id: fornecedorId,
    org_id: orgId,
    nome: 'Moinho São João',
    ativo: true,
    created_at: t,
    updated_at: t,
  })
  await salvarESincronizar('products', {
    ...PADROES_PRODUTO,
    id: produtoId,
    org_id: orgId,
    folder_id: pastaId,
    nome: 'Creme de leite',
    shelf_life_days: 3,
    controla_estoque: true,
    ativo: true,
    created_at: t,
    updated_at: t,
  })
  await salvarESincronizar('team_members', {
    id: membroId,
    org_id: orgId,
    nome: 'Chef Ana',
    ativo: true,
    pode_aprovar: true,
    created_at: t,
    updated_at: t,
  })
  await salvarESincronizar('labels', {
    id: etiquetaId,
    org_id: orgId,
    short_code: novoCodigoCurto(),
    produto_snapshot: 'Creme de leite',
    opened_at: t,
    expires_at: t,
    printed_at: t,
    status: 'ativa',
    created_at: t,
    updated_at: t,
  })
  await salvarESincronizar('inventory_tags', {
    id: novoId(),
    org_id: orgId,
    produto_snapshot: 'Molho base',
    short_code: novoCodigoCurto(),
    status: 'em_estoque',
    printed_at: t,
    created_at: t,
    updated_at: t,
  })

  // Livros-razão, que não estão em TABELAS_SINCRONIZADAS.
  await registrarEvento({
    id: novoId(),
    org_id: orgId,
    label_id: etiquetaId,
    tipo: 'impressa',
    ocorrido_em: t,
    created_at: t,
  })
  await registrarMovimento({
    id: novoId(),
    org_id: orgId,
    product_id: produtoId,
    tipo: 'entrada',
    quantidade: 10,
    unidade: 'kg',
    ocorrido_em: t,
    created_at: t,
  })

  await db.org_settings.put({
    org_id: orgId,
    alerta_dias_antes: 2,
    alerta_horario: '08:00:00',
    dias_fechados: [0, 1],
    created_at: t,
    updated_at: t,
  })

  return { pastaId, fornecedorId, produtoId, membroId, etiquetaId }
}

describe('adotarOrganizacao', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear()
  })

  it('não deixa nenhuma linha para trás na organização antiga', async () => {
    // O teste que realmente importa: cadastro órfão não dá erro, some.
    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    for (const tabela of db.tables) {
      if (tabela.name === 'outbox' || tabela.name === 'marcas') continue
      const chave = tabela.name === 'org_settings' ? 'org_id' : 'org_id'
      const sobraram = await tabela.where(chave).equals(LOCAL).count()
      expect(`${tabela.name}: ${sobraram}`).toBe(`${tabela.name}: 0`)
    }
  })

  it('migra cada tipo de cadastro, e não só os mais óbvios', async () => {
    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    const contar = async (t: string) =>
      db.table(t).where('org_id').equals(SERVIDOR).count()

    expect(await contar('folders')).toBe(1)
    expect(await contar('suppliers')).toBe(1)
    expect(await contar('products')).toBe(1)
    expect(await contar('team_members')).toBe(1)
    expect(await contar('labels')).toBe(1)
    expect(await contar('inventory_tags')).toBe(1)
    // Os livros-razão são o que mais fácil se esquece: não estão na lista de
    // tabelas sincronizadas.
    expect(await contar('label_events')).toBe(1)
    expect(await contar('stock_movements')).toBe(1)
  })

  it('leva as preferências, cuja chave primária é o próprio org_id', async () => {
    // `org_settings` não pode ser atualizada no lugar — tem que apagar e
    // recriar, senão a preferência fica presa na organização morta.
    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    expect(await db.org_settings.get(LOCAL)).toBeUndefined()
    expect((await db.org_settings.get(SERVIDOR))?.dias_fechados).toEqual([0, 1])
  })

  it('preserva o conteúdo, mudando só a organização', async () => {
    const ids = await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    const produto = await db.products.get(ids.produtoId)
    expect(produto?.nome).toBe('Creme de leite')
    expect(produto?.folder_id).toBe(ids.pastaId)
    expect(produto?.controla_estoque).toBe(true)
    expect(produto?.org_id).toBe(SERVIDOR)
  })

  it('reenfileira tudo para subir, com o org_id já corrigido', async () => {
    // Uma fila com o org_id velho subiria linhas de uma organização que o
    // servidor não conhece, e o RLS as recusaria uma a uma.
    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    const fila = await db.outbox.toArray()
    expect(fila.length).toBeGreaterThan(0)
    expect(fila.every((op) => op.dados.org_id === SERVIDOR)).toBe(true)
    expect(fila.some((op) => op.dados.org_id === LOCAL)).toBe(false)
  })

  it('enfileira os cadastros antes dos livros-razão', async () => {
    // Ordem de chave estrangeira: um evento não pode chegar ao servidor antes
    // da etiqueta que ele referencia.
    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    const fila = await db.outbox.orderBy('seq').toArray()
    const posicaoEtiqueta = fila.findIndex((op) => op.tabela === 'labels')
    const posicaoEvento = fila.findIndex((op) => op.tabela === 'label_events')
    const posicaoProduto = fila.findIndex((op) => op.tabela === 'products')
    const posicaoMovimento = fila.findIndex((op) => op.tabela === 'stock_movements')

    expect(posicaoEtiqueta).toBeLessThan(posicaoEvento)
    expect(posicaoProduto).toBeLessThan(posicaoMovimento)
  })

  it('não toca no cadastro de outra organização', async () => {
    // O aparelho pode ter sido usado por mais de um restaurante.
    await semearCozinha(LOCAL)
    await semearCozinha(OUTRA)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    expect(await db.products.where('org_id').equals(OUTRA).count()).toBe(1)
    expect(await db.org_settings.get(OUTRA)).toBeDefined()
  })

  it('não deixa pendência da outra organização na fila', async () => {
    await semearCozinha(OUTRA)
    const filaAntes = (await db.outbox.toArray()).filter(
      (op) => op.dados.org_id === OUTRA,
    ).length

    await semearCozinha(LOCAL)
    await adotarOrganizacao(LOCAL, SERVIDOR)

    const depois = (await db.outbox.toArray()).filter(
      (op) => op.dados.org_id === OUTRA,
    ).length
    expect(depois).toBe(filaAntes)
  })

  it('é sem efeito quando a organização já é a do servidor', async () => {
    // Entrar de novo no mesmo restaurante não pode reenfileirar tudo a cada vez.
    await semearCozinha(SERVIDOR)
    const filaAntes = await db.outbox.count()

    expect(await adotarOrganizacao(SERVIDOR, SERVIDOR)).toBe(0)
    expect(await db.outbox.count()).toBe(filaAntes)
  })

  it('aguenta um aparelho sem nada cadastrado', async () => {
    expect(await adotarOrganizacao(LOCAL, SERVIDOR)).toBe(0)
  })
})
