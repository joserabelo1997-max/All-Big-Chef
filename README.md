# All Big Chef

PWA de gestão de cozinha profissional. **Módulo 1**: etiquetagem de produtos com
impressão Bluetooth, controle de validade, alertas e rastreabilidade.

Cozinhas precisam etiquetar todo produto retirado da embalagem original (prática
exigida pela RDC 216/ANVISA) com nome, fornecedor, data de abertura e validade.
Feito à mão, isso vira letra ilegível, sem histórico e sem alerta de vencimento.
Este app imprime etiquetas **60 × 40 mm** numa etiquetadora Bluetooth, cada uma
com um **QR Code único** que permite dar baixa e reconstruir o histórico de
qualquer produto.

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

## Impressão Bluetooth: o que funciona onde

O app usa **Web Bluetooth**, que só fala BLE/GATT — nunca Bluetooth Clássico
(SPP). Isso define onde dá para imprimir:

| Plataforma | Navegador | Imprime? |
| --- | --- | --- |
| Android | Chrome / Edge | ✅ |
| Windows, macOS, ChromeOS | Chrome / Edge | ✅ |
| iPhone / iPad | **Bluefy** (grátis na App Store) | ✅ |
| iPhone / iPad | Safari | ❌ — o WebKit não implementa Web Bluetooth |

No iPhone o arranjo é: **Safari instala o app e recebe os alertas de validade;
Bluefy imprime.** É o mesmo app nos dois, sem build separado.

O restante do sistema — cadastro, painel de validades, leitura de QR, baixa de
etiquetas, relatórios — funciona em qualquer navegador moderno, inclusive Safari.

Web Bluetooth exige contexto seguro: `localhost` ou HTTPS. Abrir o `index.html`
direto do disco não funciona.

## Documentação

- [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — criar o projeto e aplicar as migrations
- [`docs/IMPRESSORA.md`](docs/IMPRESSORA.md) — parear a etiquetadora e usar o diagnóstico

## Deploy

Push na branch `main` dispara o build e publica no GitHub Pages
(`.github/workflows/deploy.yml`). As variáveis `VITE_*` vêm dos secrets do
repositório — nenhuma delas é sigilosa, quem protege os dados é o RLS do
Supabase.
