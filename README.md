# All Big Chef

PWA de gestão de cozinha, feito para rodar no celular do chef: fichas técnicas,
produção, CMV e compras.

A ideia que sustenta o app cabe numa frase: **um prato é feito de preparos, um
preparo pode conter outros preparos, e as folhas são insumos**. Dessa árvore
saem, sem duplicar nenhum cadastro:

| Percorrendo a árvore… | …sai |
|---|---|
| mostrando os nós aninhados | a ficha técnica |
| marcando cada nó como feito | o checklist de produção |
| somando o custo de baixo para cima | o CMV teórico e o preço sugerido |
| achatando só as folhas e somando | a lista de compras |

Você escreve a receita uma vez. As quatro telas se alimentam dela.

## Telas

- **Início** — o dia de hoje, o que falta produzir e o que está travando alguma conta.
- **Receitas** — fichas de pratos e preparos, com custo recalculado ao vivo. Prato e
  preparo são a mesma entidade, e é isso que permite o aninhamento.
- **Insumos** — preço, fornecedor e fator de correção, com calculadora de FC embutida.
- **CMV e preços** — onze verbetes, cada um com o conceito, a fórmula e a calculadora
  no mesmo cartão: CMV real, CMV teórico, desvio entre os dois, metas por tipo de casa,
  preço de venda, markup, margem de contribuição, fator de correção, índice de cocção e
  escalonamento de receita.
- **Menus** — conjuntos de pratos com as porções previstas.
- **Serviços** — o diário. Cada dia guarda cópias congeladas do que foi servido.
- **Produção** — a mise en place, em duas visões: por prato (aninhada) e por preparo
  (consolidada, na ordem de quem produz).
- **Compras** — lista gerada do menu, em peso bruto, agrupada por categoria ou fornecedor.
- **Configurações** — restaurantes, conta, backup em arquivo e diagnóstico.

## Decisões que importam

**Custo desconhecido é `null`, não zero.** Insumo sem preço torna o prato inteiro
incerto e aparece como aviso. Um zero silencioso barateava o cardápio por omissão.

**O custo cobra o peso bruto.** A ficha escreve o líquido que vai para a panela, mas
quem paga é o bruto que sai do fornecedor. É o fator de correção que separa os dois.

**Converter grama em mililitro exige densidade**, que o app não guarda — então ele
recusa e explica, em vez de chutar.

**Offline primeiro.** O app sempre lê do espelho local (IndexedDB) e escreve nele
antes de tudo. A nuvem é a verdade de longo prazo, não a fonte da tela; cozinha tem
wi-fi ruim.

**Apagar é marcar.** A deleção viaja como dado até os outros aparelhos, senão o
registro ressuscita no sync seguinte.

**O histórico é denormalizado.** O serviço guarda nome, quantidade e modo de preparo
escritos por extenso, não ids. Daqui a um ano a receita terá mudado, mas "o que eu
servi em 10 de setembro" continua tendo resposta.

## Rodar no seu computador

```bash
npm install
cp .env.example .env    # preencha com as chaves do seu projeto Supabase
npm run dev
```

O passo a passo completo do banco está em [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md).
Sem as chaves, o app abre numa tela que diz exatamente o que falta.

## Publicar

O workflow `.github/workflows/deploy.yml` publica no GitHub Pages **a branch padrão do
repositório**, qualquer que seja o nome dela. Push em outra branch roda typecheck,
testes e build, e para antes de publicar.

Antes do primeiro deploy, cadastre em **Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Depois de publicado, abra o endereço no celular e use "Adicionar à tela de início".
Ele passa a abrir como aplicativo, em tela cheia e funcionando offline.

## Conferir

```bash
npm run typecheck     # tipos
npm test              # domínio puro e camada de dados
npm run build         # bundle de produção
```

E, com o app servido (`npm run preview`), quatro scripts que abrem um navegador de
verdade e conferem o comportamento contra contas feitas no papel:

```bash
node scripts/verificar-telas.mjs              # as nove telas montam e cabem em 390px
node scripts/verificar-fluxo.mjs              # insumo → preparo → prato, e o custo fecha
node scripts/verificar-cmv.mjs                # as calculadoras da aba de CMV
node scripts/verificar-historico.mjs          # a versão guardada não muda quando a receita muda
node scripts/verificar-producao-compras.mjs   # uma árvore, quatro leituras
```

Eles plantam a sessão direto no navegador em vez de passar pelo login: o alvo é o
comportamento do app, não o Supabase. As chamadas ao banco falham de propósito e o app
segue de pé lendo do espelho local — que é justamente o comportamento offline prometido.

## Estrutura

```
src/dominio/    funções puras: árvore, custo, unidades, CMV, precificação, produção, compras
src/dados/      Supabase, Dexie, motor de sync, repositório de escrita, consultas
src/ui/         casca do app, campos de formulário, componentes compartilhados
src/telas/      uma tela por rota
supabase/       schema.sql reaplicável, com RLS
scripts/        conferências em navegador
```

O diretório `src/dominio/` não sabe o que é React nem o que é banco: entra número,
sai número. É onde moram as contas, e é por isso que elas são testáveis.
