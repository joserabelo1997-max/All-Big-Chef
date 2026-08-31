# All Big Chef

PWA de gestão de cozinha profissional. **Módulo 1**: etiquetagem de produtos com
impressão Bluetooth, controle de validade, alertas e rastreabilidade.

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
| **Offline** | Tudo acima funciona sem internet; sincroniza sozinho ao reconectar |

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
node scripts/verificar-etiqueta.mjs   # renderiza a etiqueta e decodifica o QR de volta
node scripts/verificar-fluxo.mjs      # cadastro -> etiqueta -> baixa -> busca por código
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
| iPhone / iPad | ❌ não existe no iOS | ✅ pelo **Bluefy** |
| iPhone / iPad (Safari) | ❌ | ❌ |

Para uma impressora de bancada ligada na tomada, **o cabo costuma ser a melhor
escolha**: manda a etiqueta em uma fração do tempo e não depende de pareamento.

No iPhone o arranjo é: **Safari instala o app e recebe os alertas de validade;
Bluefy imprime.** É o mesmo app nos dois, sem build separado.

O restante do sistema — cadastro, painel de validades, leitura de QR, baixa de
etiquetas, relatórios — funciona em qualquer navegador moderno, inclusive Safari.

As duas APIs exigem contexto seguro: `localhost` ou HTTPS. Abrir o `index.html`
direto do disco não funciona.

> **Rolo de etiqueta:** o modelo padrão é desenhado para **60 × 40 mm**. Se sua
> impressora veio com rolos de outro tamanho, compre um 60 × 40 (medida comum e
> barata) ou ajuste o tamanho no diagnóstico e reposicione os campos no editor.

## Documentação

- [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — criar o projeto e aplicar as migrations
- [`docs/IMPRESSORA.md`](docs/IMPRESSORA.md) — parear a etiquetadora e usar o diagnóstico

## Deploy

Push na branch `main` dispara o build e publica no GitHub Pages
(`.github/workflows/deploy.yml`). As variáveis `VITE_*` vêm dos secrets do
repositório — nenhuma delas é sigilosa, quem protege os dados é o RLS do
Supabase.
