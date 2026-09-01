// Prova a sincronização contra um Supabase REAL, nos dois sentidos.
//
// É o único teste que exercita o caminho que consertei às cegas: o pull das
// tabelas append-only, que subia movimentos ao servidor e nunca os trazia de
// volta. Sem um banco de verdade, nada aqui é verificável.
//
// Roda em Node, não no Chromium. O Chromium deste ambiente não alcança
// `supabase.co` (ERR_CONNECTION_RESET com e sem proxy); o `fetch` do Node
// alcança. Os módulos do app são carregados pelo próprio Vite (`ssrLoadModule`),
// então o que está sendo exercitado é o código de produção, não uma cópia.
//
// Precisa de `.env` preenchido e de um usuário no projeto. As credenciais vêm
// por variável de ambiente, nunca escritas neste arquivo:
//
//   SYNC_EMAIL=… SYNC_SENHA=… node scripts/verificar-sync.mjs
import 'fake-indexeddb/auto'
import { createServer } from 'vite'
import { randomUUID } from 'node:crypto'

const EMAIL = process.env.SYNC_EMAIL
const SENHA = process.env.SYNC_SENHA
if (!EMAIL || !SENHA) {
  console.error('faltam SYNC_EMAIL e SYNC_SENHA no ambiente')
  process.exit(2)
}

// O app é escrito para o navegador. Estes três globais são tudo o que ele
// espera do ambiente nos caminhos que este teste percorre — o motor consulta
// `navigator.onLine` antes de sincronizar, o cliente Supabase guarda a sessão
// em `localStorage`, e o Dexie precisa de `crypto.randomUUID`.
globalThis.navigator ??= { onLine: true }
if (!('onLine' in globalThis.navigator)) globalThis.navigator.onLine = true
const memoria = new Map()
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
  clear: () => memoria.clear(),
  key: (i) => [...memoria.keys()][i] ?? null,
  get length() {
    return memoria.size
  },
}

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { supabase } = await vite.ssrLoadModule('/src/lib/supabase.ts')
const { db, salvarESincronizar, registrarMovimento } = await vite.ssrLoadModule('/src/lib/db.ts')
const { motorSync } = await vite.ssrLoadModule('/src/lib/sync/engine.ts')
const { PADROES_PRODUTO } = await vite.ssrLoadModule('/src/domain/types.ts')

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

const encerrar = async (codigo) => {
  await vite.close()
  process.exit(codigo)
}

if (!supabase) {
  console.error('sem VITE_SUPABASE_URL/ANON_KEY no .env — nada a verificar')
  await encerrar(2)
}

// --- 1. Entrar na conta ----------------------------------------------------
const { data: entrada, error: erroEntrada } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: SENHA,
})
conferir('entra na conta do restaurante', !erroEntrada, erroEntrada?.message ?? '')
if (erroEntrada) {
  console.log(JSON.stringify({ checagens }, null, 2))
  await encerrar(1)
}
const usuarioId = entrada.user.id

// --- 2. Descobrir a organização do usuário ---------------------------------
const { data: vinculo, error: erroVinculo } = await supabase
  .from('org_members')
  .select('org_id')
  .eq('user_id', usuarioId)
  .limit(1)
  .maybeSingle()

conferir(
  'o usuário pertence a uma organização',
  Boolean(vinculo?.org_id),
  erroVinculo?.message ?? String(vinculo?.org_id),
)
if (!vinculo?.org_id) {
  console.log(JSON.stringify({ checagens }, null, 2))
  await encerrar(1)
}
const orgId = vinculo.org_id
localStorage.setItem('abc:org-id', orgId)

const agora = () => new Date().toISOString()
const produtoId = randomUUID()
const nomeProduto = `Prova de sincronização ${Date.now()}`

// --- 3. SUBIDA: um produto criado no app chega ao banco --------------------
await salvarESincronizar('products', {
  ...PADROES_PRODUTO,
  id: produtoId,
  org_id: orgId,
  nome: nomeProduto,
  shelf_life_days: 5,
  controla_estoque: true,
  unidade_estoque: 'kg',
  estoque_minimo_kg: 2,
  ativo: true,
  created_at: agora(),
  updated_at: agora(),
})
conferir('a gravação local enfileira na outbox', (await db.outbox.count()) > 0)

await motorSync.sincronizar(orgId)
const naFila = await db.outbox.toArray()
conferir(
  'a fila de envio esvazia depois de sincronizar',
  naFila.length === 0,
  naFila.map((o) => `${o.tabela}: ${o.ultimoErro ?? 'sem erro registrado'}`).join(' | '),
)

const { data: noBanco } = await supabase
  .from('products')
  .select('id, nome, saldo_kg')
  .eq('id', produtoId)
  .maybeSingle()
conferir('o produto criado no app aparece no banco', noBanco?.nome === nomeProduto, String(noBanco?.nome))

// --- 4. O gatilho do servidor deriva o saldo --------------------------------
await registrarMovimento({
  id: randomUUID(),
  org_id: orgId,
  product_id: produtoId,
  tipo: 'entrada',
  unidade: 'kg',
  quantidade: 10,
  lote: 'L-prova',
  valor_unitario: 12.5,
  motivo: 'compra de prova',
  ocorrido_em: agora(),
  created_at: agora(),
})
await motorSync.sincronizar(orgId)
const filaMovimento = await db.outbox.toArray()
conferir(
  'o movimento sobe (fila vazia)',
  filaMovimento.length === 0,
  filaMovimento.map((o) => `${o.tabela}: ${o.ultimoErro ?? 'sem erro registrado'}`).join(' | '),
)

const { data: comSaldo } = await supabase
  .from('products')
  .select('saldo_kg')
  .eq('id', produtoId)
  .maybeSingle()
conferir(
  'o gatilho do banco derivou saldo_kg = 10',
  Number(comSaldo?.saldo_kg) === 10,
  `saldo_kg = ${comSaldo?.saldo_kg}`,
)

// --- 5. DESCIDA: o caminho onde o defeito morava ---------------------------
// Um movimento inserido direto no banco, como se viesse de outro aparelho.
// Antes do conserto, `baixarEventos` só puxava `label_events`: isto subia e
// nunca voltava, e o saldo dos aparelhos divergia em silêncio.
const movimentoDeOutroAparelho = randomUUID()
const { error: erroInsercao } = await supabase.from('stock_movements').insert({
  id: movimentoDeOutroAparelho,
  org_id: orgId,
  product_id: produtoId,
  tipo: 'saida',
  unidade: 'kg',
  quantidade: 3,
  motivo: 'producao de prova',
  ocorrido_em: agora(),
  created_at: agora(),
})
conferir('outro aparelho consegue inserir um movimento', !erroInsercao, erroInsercao?.message ?? '')

// Zerar os cursores obriga o motor a puxar tudo de novo — é o que um aparelho
// recém-instalado faria.
await db.marcas.clear()
await motorSync.sincronizar(orgId)

const baixou = await db.stock_movements.get(movimentoDeOutroAparelho)
conferir(
  'o movimento do outro aparelho desce para o app (era este o defeito)',
  Boolean(baixou),
  baixou ? `${baixou.tipo} ${baixou.quantidade}` : 'não chegou',
)

const produtoLocal = await db.products.get(produtoId)
conferir(
  'o saldo local recalculado bate com o do banco (10 − 3 = 7)',
  Number(produtoLocal?.saldo_kg) === 7,
  `saldo_kg local = ${produtoLocal?.saldo_kg}`,
)

// --- 6. Limpeza ------------------------------------------------------------
// O livro-razão é imutável de propósito: os movimentos ficam. O produto é
// desativado, que é o que o app faz — não existe DELETE no caminho normal.
await supabase.from('products').update({ ativo: false }).eq('id', produtoId)

const falhas = checagens.filter((c) => !c.ok)
console.log(JSON.stringify({ checagens, produtoId, orgId }, null, 2))
console.log(
  falhas.length === 0
    ? `\n✓ ${checagens.length} checagens passaram`
    : `\n✗ ${falhas.length} de ${checagens.length} falharam`,
)

await encerrar(falhas.length > 0 ? 1 : 0)
