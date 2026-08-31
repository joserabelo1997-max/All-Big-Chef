// Popula um histórico de consumo e descarte, confere os números do relatório e
// valida o CSV exportado. Script de apoio.
//   node scripts/verificar-relatorios.mjs [pasta-de-saida]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const SAIDA = process.argv[2] ?? '/tmp/relatorios'
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://localhost:5191/All-Big-Chef/'

mkdirSync(SAIDA, { recursive: true })

const servidor = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { port: 5191 },
  logLevel: 'error',
})
await servidor.listen()

const navegador = await chromium.launch({ executablePath: CHROMIUM })
const pagina = await navegador.newPage({ viewport: { width: 412, height: 1200 } })

const problemas = []
pagina.on('pageerror', (e) => problemas.push(String(e)))
pagina.on('console', (m) => m.type() === 'error' && problemas.push(m.text()))

const checagens = []
const conferir = (nome, ok, detalhe = '') =>
  checagens.push({ nome, ok, ...(detalhe ? { detalhe } : {}) })

await pagina.goto(BASE, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)

// Histórico conhecido: Salmão 3 descartes / 1 consumo, Leite 1 descarte / 4 consumos.
await pagina.evaluate(async () => {
  const { db, salvarESincronizar, registrarEvento } = await import(
    '/All-Big-Chef/src/lib/db.ts'
  )
  const { criarEtiqueta, criarEventoBaixa } = await import(
    '/All-Big-Chef/src/domain/labelData.ts'
  )
  const orgId = (await db.folders.toArray())[0].org_id

  const receita = [
    ['Salmão fresco', 'Pescados', 3, 1],
    ['Leite integral', 'Laticínios', 1, 4],
  ]

  for (const [nome, pastaNome, descartes, consumos] of receita) {
    const produto = {
      id: crypto.randomUUID(),
      org_id: orgId,
      nome,
      shelf_life_days: 3,
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await salvarESincronizar('products', produto)
    const pasta = { id: 'x', org_id: orgId, nome: pastaNome, cor: '#000', ordem: 0,
      created_at: '', updated_at: '' }

    for (let i = 0; i < descartes + consumos; i++) {
      const { etiqueta, evento } = criarEtiqueta({
        orgId, produto, pasta, membroNome: 'Maria', lote: 'L-1',
      })
      await salvarESincronizar('labels', etiqueta)
      await registrarEvento(evento)

      const tipo = i < descartes ? 'descartada' : 'consumida'
      await registrarEvento(
        criarEventoBaixa(etiqueta, tipo, {
          motivo: tipo === 'descartada' ? 'Vencido' : undefined,
          membroNome: 'Maria',
        }),
        tipo,
      )
    }
  }
})

await pagina.goto(`${BASE}#/relatorios`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(800)
await pagina.screenshot({ path: `${SAIDA}/relatorios.png`, fullPage: true })

const texto = await pagina.textContent('body')

// 5 consumidas e 4 descartadas de 9 finalizadas => 56% de aproveitamento.
conferir('conta as consumidas', texto.includes('Consumidas'))
conferir('mostra o aproveitamento calculado', texto.includes('56%'), 'esperado 5/9')
conferir(
  'Salmão aparece antes do Leite (mais descartes primeiro)',
  texto.indexOf('Salmão fresco') < texto.indexOf('Leite integral'),
)
conferir('mostra a taxa de descarte do Salmão', texto.includes('75%'), '3 de 4')

// Valida o CSV gerado, sem depender de download real do navegador.
const csv = await pagina.evaluate(async () => {
  const { db } = await import('/All-Big-Chef/src/lib/db.ts')
  const { agruparDesperdicio, montarCsv, ultimosDias } = await import(
    '/All-Big-Chef/src/domain/relatorios.ts'
  )
  const etiquetas = await db.labels.toArray()
  const eventos = await db.label_events.toArray()
  const linhas = agruparDesperdicio(etiquetas, eventos, ultimosDias(30), 'produto')
  return montarCsv(
    ['Agrupamento', 'Consumidas', 'Descartadas'],
    linhas.map((l) => [l.rotulo, l.consumidas, l.descartadas]),
  )
})

conferir('CSV começa com BOM (Excel lê acento corretamente)', csv.charCodeAt(0) === 0xfeff)
conferir('CSV separa por ponto e vírgula', csv.includes('Agrupamento;Consumidas'))
conferir('CSV preserva a acentuação', csv.includes('Salmão fresco'))
conferir('CSV traz os números certos', csv.includes('Salmão fresco;1;3'), csv.split('\r\n')[1])

const falhas = checagens.filter((c) => !c.ok)
console.log(JSON.stringify({ checagens, problemas }, null, 2))
console.log(
  falhas.length === 0
    ? `\n✓ ${checagens.length} checagens passaram`
    : `\n✗ ${falhas.length} de ${checagens.length} falharam`,
)

await navegador.close()
await servidor.close()

if (falhas.length > 0 || problemas.length > 0) process.exitCode = 1
