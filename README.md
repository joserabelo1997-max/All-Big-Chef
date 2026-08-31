# All Big Chef

PWA de gestão de cozinha profissional.

- **Módulo 1** — etiquetagem de produtos com impressão Bluetooth, controle de
  validade, alertas e rastreabilidade.
- **Módulo 2** — controle de estoque: entrada e saída, saldo, estoque mínimo,
  requisição com aprovação, contagem de inventário e pedido ao fornecedor pelo
  WhatsApp.

Cozinhas precisam etiquetar todo produto retirado da embalagem original (prática
exigida pela RDC 216/ANVISA) com nome, fornecedor, data de abertura e validade.
Feito à mão, isso vira letra ilegível, sem histórico e sem alerta de vencimento.
Este app imprime etiquetas **60 × 40 mm** numa etiquetadora Bluetooth, cada uma
com um **QR Code único** que permite dar baixa e reconstruir o histórico de
qualquer produto.

## O que já funciona

| | |
| --- | --- |
| **Cadastros** | Produtos com dias de validade, organizados por pastas (Laticínios, Pescados, Carnes…), fornecedores e equipe |
| **Impressão** | Etiqueta 60 × 40 mm por Bluetooth, avulsa ou em lote, com prévia fiel ao bitmap que a impressora recebe |
| **Diagnóstico** | Descobre sozinho como sua etiquetadora se comunica e guarda os parâmetros |
| **Validades** | Painel com semáforo, alertas configuráveis e notificação no celular com o app fechado |
| **Rastreabilidade** | QR único por etiqueta, baixa por câmera ou código digitado, trilha de auditoria imutável |
| **Editor** | Arrastar e soltar os campos da etiqueta, com prévia real |
| **Relatórios** | Desperdício por produto e pasta, aproveitamento, exportação CSV para fiscalização |
| **Estoque** | Entrada, saída, perda e ajuste; saldo derivado do livro-razão; kg e unidade como contagens independentes |
| **Reposição** | Aviso de estoque mínimo e pedido agrupado por fornecedor, aberto no WhatsApp com a mensagem pronta |
| **Requisições** | Retirada do estoque com liberação do responsável — quem tem permissão libera a própria |
| **Contagem** | Conferência do físico; a diferença vira movimento registrado, nunca sobrescrita do saldo |
| **Inventário** | Etiqueta com QR único para o que a casa produz e guarda, só para contagem — sem data de validade |
| **Offline** | Tudo acima funciona sem internet; sincroniza sozinho ao reconectar |

## Instalar no celular

O app fica em **https://joserabelo1997-max.github.io/All-Big-Chef/**

**iPhone e iPad** — abra o endereço no **Safari** (Chrome e Firefox no iPhone não
instalam PWA), toque em **Compartilhar** (o quadrado com a seta para cima) e
escolha **Adicionar à Tela de Início**.

**Android** — abra no Chrome e toque em **Instalar aplicativo**, no menu de três
pontos. Alguns aparelhos oferecem sozinho, num aviso na parte de baixo da tela.

> **No iPhone, instalar não é opcional se você quer os alertas de validade.** O
> iOS só entrega notificação para PWA instalado pelo Safari (iOS 16.4+). Aberto
> como aba comum, o aviso de vencimento **não chega** — por isso cada pessoa da
> equipe precisa instalar no próprio celular.

Para também **imprimir pelo iPhone**, veja
[`docs/IMPRESSORA.md`](docs/IMPRESSORA.md#imprimir-do-iphone-as-opções-da-melhor-para-a-pior).

## Como rodar

```bash
npm install
cp .env.example .env    # preencha seguindo docs/SETUP_SUPABASE.md
npm run dev
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor local em `http://localhost:5173/All-Big-Chef/` |
| `npm run dev:https` | Igual, mas em HTTPS e acessível na rede — necessário para testar impressão no celular |
| `npm test` | Testes de unidade (Vitest) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção em `dist/` |

Há também scripts de verificação que rodam o app num Chromium real e conferem o
comportamento de ponta a ponta — úteis depois de mexer no pipeline de impressão
ou nas telas:

```bash
node scripts/verificar-etiqueta.mjs   # renderiza as duas etiquetas e decodifica o QR de volta
node scripts/verificar-fluxo.mjs      # cadastro -> etiqueta -> baixa -> busca por código
node scripts/verificar-carrinho.mjs   # somar etiquetas atravessando pastas
node scripts/verificar-leitor.mjs     # leitor de código de barras em modo teclado
node scripts/verificar-cadastro.mjs   # fornecedor na hora, lote no produto, dia fechado
node scripts/verificar-estoque.mjs    # entrada -> requisição -> aprovação -> repor -> contagem
node scripts/verificar-inventario.mjs # etiqueta de contagem sem conflito com a de validade
node scripts/verificar-painel.mjs     # classificação e ordenação por validade
node scripts/verificar-editor.mjs     # arrasta um campo e confere a persistência
node scripts/verificar-relatorios.mjs # números do relatório e formato do CSV
node scripts/verificar-telas.mjs      # captura todas as telas e reporta erros
```

## Impressão: o que funciona onde

O app fala com a impressora por **cabo USB** ou por **Bluetooth**, e você escolhe
em Ajustes → Impressora. Ter as duas vias importa: cada uma cobre a lacuna da
outra.

| Plataforma | Cabo USB | Bluetooth |
| --- | --- | --- |
| Android (Chrome/Edge) | ✅ com cabo OTG | ✅ |
| Linux, ChromeOS | ✅ | ✅ |
| Windows, macOS | ⚠️ o driver do sistema costuma travar o acesso | ✅ |
| iPhone / iPad | ❌ não existe no iOS | ✅ com **beacio** ou **Bluefy** |

Para uma impressora de bancada ligada na tomada, **o cabo costuma ser a melhor
escolha**: manda a etiqueta em uma fração do tempo e não depende de pareamento.

**No iPhone o Safari imprime**, com a extensão gratuita
[beacio](https://beacio.com/) — ela instala `navigator.bluetooth` no próprio
Safari e não exige mudança nenhuma no app. Sem ela, o
[Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)
é a alternativa, num navegador à parte.
Ver [`docs/IMPRESSORA.md`](docs/IMPRESSORA.md#imprimir-do-iphone-as-opções-da-melhor-para-a-pior)
para as quatro opções comparadas.

O restante do sistema — cadastro, painel de validades, leitura de QR, baixa de
etiquetas, relatórios — funciona em qualquer navegador moderno, inclusive Safari.

As duas APIs exigem contexto seguro: `localhost` ou HTTPS. Abrir o `index.html`
direto do disco não funciona.

> **Rolo de etiqueta:** o modelo padrão é desenhado para **60 × 40 mm**. Se sua
> impressora veio com rolos de outro tamanho, compre um 60 × 40 (medida comum e
> barata) ou ajuste o tamanho no diagnóstico e reposicione os campos no editor.

## As duas etiquetas

O app imprime **duas** etiquetas 60 × 40 mm, e elas não se misturam:

| | Etiqueta de validade | Etiqueta de inventário |
| --- | --- | --- |
| Para quê | Produto retirado da embalagem original | O que a casa produziu e guardou |
| Traz data | Manipulação e validade | **Nenhuma** — serve só à contagem |
| QR aponta para | `#/l/<id>` | `#/i/<id>` |
| Ao escanear | Tela de validade, com consumir e descartar | Tela de contagem, com em estoque e consumida |

A separação está no endereço dentro do QR, e não num campo lido depois: uma
leitura nunca cai na tela errada, sem depender de ninguém conferir.

## Documentação

- [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — criar o projeto e aplicar as migrations
- [`docs/IMPRESSORA.md`](docs/IMPRESSORA.md) — parear a etiquetadora e usar o diagnóstico

## Deploy

Push na **branch padrão do repositório** dispara o build e publica no GitHub
Pages (`.github/workflows/deploy.yml`). Push em qualquer outra branch é ignorado
sem falhar.

O nome da branch não está escrito na condição — ela compara com
`github.event.repository.default_branch`, que é exatamente a regra que a
proteção do ambiente `github-pages` aplica. Trocar a branch padrão continua
funcionando sem editar o workflow.

O build roda `typecheck`, `test` e `build` antes de publicar, então um push
quebrado falha sem chegar ao ar.

As variáveis `VITE_*` vêm dos secrets do repositório — nenhuma delas é sigilosa,
quem protege os dados é o RLS do Supabase.
