# Módulo 3 — CRM de salão

Plano de layout, modelo de dados e hospedagem para transformar a planilha
`CRM_Kanoe - Oficial.xlsx` num PWA.

## Resposta curta às duas perguntas

**Onde fica o site (o PWA):** no GitHub Pages, que já publica este repositório
em `https://joserabelo1997-max.github.io/All-Big-Chef/`. O workflow de deploy já
existe, roda `typecheck`, `test` e `build` antes de publicar, e custa zero. O
CRM entra como Módulo 3 do mesmo app — não como um segundo projeto.

**Onde ficam os dados dos clientes:** no Supabase — Postgres gerenciado, com
Auth e RLS — na **região São Paulo (sa-east-1)**, que é a mesma infraestrutura
que os Módulos 1 e 2 já usam. O app continua lendo do IndexedDB local e
sincronizando em segundo plano, então o salão não para quando o Wi-Fi cai.

O volume não é problema: **2.082 clientes, 3.347 reservas e 3.292 linhas de
faturamento** ocupam menos de 30 MB, contra os 500 MB do plano gratuito. O que
decide a migração para o plano Pro (US$ 25/mês) não é tamanho, é **backup
diário com retenção e recuperação a um ponto no tempo** — e isso passa a valer
a pena no dia em que o primeiro dado real de cliente entrar.

---

## 1. O que a planilha é hoje

O arquivo enviado é a aba `PERFIL_CLI-00020` — uma *visão* de um cliente só,
montada com links externos para um arquivo no SharePoint
(`CRM_Kanoe - Oficial (1).xlsx`), que por sua vez tem doze abas. Três delas são
as fontes de verdade:

| Aba | Papel | Linhas |
| --- | --- | --- |
| `CLIENTES_MASTER` | Cadastro e perfil — 45 campos por pessoa | ~2.082 |
| `REGISTRO_RESERVAS` | Uma linha por reserva, 19 colunas | 3.347 |
| `FATURAMENTO` | Uma linha por reserva, 16 colunas | 3.292 |
| `LISTAS_CLIENTES` | As listas de classificação dos campos | 226 opções |

Os números que saem daí desenham o problema de negócio antes de qualquer
decisão técnica:

| | |
| --- | --- |
| Clientes cadastrados | 2.082 |
| Reservas registradas | 3.347 |
| Pessoas atendidas | 8.469 |
| Faturamento bruto acumulado | R$ 16.295.236 |
| Consumo de bebidas | R$ 3.988.353 — **24% do bruto** |
| Ticket médio por reserva | ~R$ 4.950 |
| **Clientes que vieram uma única vez** | **1.604 — 77%** |

Esses 77% são a razão de existir do CRM. A planilha registra o passado bem;
ela não faz ninguém agir. Um app que só reproduza a planilha na tela não muda
esse número.

## 2. O que dá para melhorar — e por quê

A planilha está bem pensada para uma planilha. Os sete problemas abaixo não são
descuido: são o limite do formato.

**1. Campo com muitos valores virou texto corrido.** As bebidas do cliente estão
assim:

```
Zaku miyabi jd; zaku megumi jg; yuki no bosha yamahai; drunk whale t;
koshi no kambai jg; niida kimoto; ... (+16 rótulos)
```

Aquele `(+16 rótulos)` é perda de dado: dezesseis sakes que o cliente bebeu e
que ninguém consegue mais recuperar. E como é texto, não existe a pergunta
"quais clientes gostam de Yuzushu?" nem "quem é alérgico a camarão?" — que é
exatamente a pergunta que salva o serviço.

**2. Zero está sendo usado como vazio.** As colunas `data_registro`,
`ocasioes_registradas`, `nome_acompanhantes`, `observacoes_experiencia` e
`feedback_cliente` vêm com `0` quando não há informação. O problema aparece em
`FATURAMENTO`: a reserva `RSV-01979` tem valor `0` — e ali o zero é verdadeiro,
significa "aguardando faturamento". Não há como distinguir *não perguntamos* de
*não tem* de *é zero mesmo*.

**3. O mesmo telefone em dois formatos.** `+55 11 98156-9971` em 24 reservas e
`(11)98156-9971` na última. Mesma pessoa, e nenhuma busca por telefone encontra
as duas.

**4. Horário guardado como fração de dia.** `0,791666...` é 19:00. Uma das
linhas tem literalmente `]` no campo de horário.

**5. Uma aba por cliente não escala.** `PERFIL_CLI-00020` é uma aba inteira,
com 117 linhas de fórmulas, para uma pessoa. Multiplicar isso por 2.082 é
inviável — e é por isso que hoje só alguns clientes têm ficha.

**6. O arquivo depende do Excel de desktop.** Links externos para o SharePoint
não resolvem no celular nem no navegador. Quem está no salão, com o cliente
chegando, não consegue abrir.

**7. Não existe registro de quem mudou o quê.** Nem de quando.

E um ponto que não é de conveniência, é de risco: **alergia alimentar é dado de
saúde**, e dado de saúde é dado pessoal *sensível* pela LGPD (art. 5º, II). Uma
planilha em OneDrive com link compartilhado, contendo alergias, endereço,
telefone, estado civil e nome dos filhos de 2.082 pessoas, é uma exposição real.
O banco com RLS por papel resolve isso — não como burocracia, como redução de
dano.

## 3. O modelo de dados

O princípio é um só: **o que hoje é texto separado por ponto e vírgula vira
relação; o que hoje é fórmula vira cálculo do banco.**

### 3.1 As tabelas

```
organizations ─┬─ crm_clientes ─┬─ crm_cliente_tags ──── crm_taxonomias
               │                ├─ crm_cliente_bebidas ─ crm_bebidas
               │                ├─ crm_relacoes (cônjuge, sócio, filho)
               │                └─ crm_notas          (append-only)
               │
               ├─ crm_reservas ─┬─ crm_reserva_convivas ─ crm_clientes
               │                ├─ crm_reserva_tags ───── crm_taxonomias
               │                └─ crm_faturamento
               │
               └─ crm_eventos   (auditoria: quem mudou o quê, quando)
```

**`crm_clientes`** — só o que é atributo simples da pessoa: `nome`,
`nome_tratamento`, `email`, `telefone_e164`, `aniversario`, `genero`,
`endereco`, `bairro`, `cep`, `mao_dominante`, `possui_hashi_personalizado`,
`empresa`, `preferencia_agua`, `ja_foi_ao_japao`, `ranking`, `status_revisao`.

**`crm_taxonomias`** substitui a aba `LISTAS_CLIENTES` inteira:

```sql
create table crm_taxonomias (
  id     uuid primary key,
  org_id uuid not null,
  tipo   text not null,   -- 'alergia' | 'restricao' | 'preferencia' |
                          -- 'perfil_interesse' | 'ocasiao' | 'cargo' | ...
  valor  text not null,
  ordem  int  not null default 0,
  ativo  boolean not null default true,   -- nunca DELETE: o histórico usa
  unique (org_id, tipo, valor)
);
```

As 226 opções da planilha entram aqui na migração. O administrador passa a
editar as listas **pela tela do app**, sem tocar em código nem em fórmula
`OFFSET`. E um item retirado vira `ativo = false` em vez de sumir — senão a
ficha de quem foi marcado com ele em 2023 perde o sentido.

**`crm_cliente_tags`** é a ligação N:N que resolve os campos multivalor:

```sql
create table crm_cliente_tags (
  cliente_id   uuid not null references crm_clientes(id),
  taxonomia_id uuid not null references crm_taxonomias(id),
  nota         text,          -- "camarão só cozido", "alergia leve"
  primary key (cliente_id, taxonomia_id)
);
```

A partir daqui, "quem é alérgico a camarão e vem este mês" é uma consulta de
duas linhas — e vira um filtro na tela.

**`crm_bebidas` + `crm_cliente_bebidas`** guardam a adega pessoal. Cada rótulo
é uma linha, com `categoria` (`sake`, `vinho`, `champagne`, `espumante`,
`cerveja`, `whisky`, `jerez`, `licor`) e, na ligação, `trouxe_proprio boolean`
— porque "gosta de trazer os próprios sakes", hoje enfiado no meio do texto do
campo `saquê`, é uma característica operacional (rolha, taça, serviço), não um
rótulo.

**`crm_reservas`** guarda `data_reserva date` e `horario time` de verdade,
`total_pessoas`, `tipo_mesa`, `experiencia_servida`, `status_reserva`,
`primeira_visita boolean` (o `NG`/`REP` da coluna C), `confianca_vinculo` e
`origem_registro`. Nome, e-mail e telefone **saem daqui** — vêm por junção com
o cliente. Hoje eles estão repetidos nas três abas e já divergem.

**`crm_reserva_convivas`** resolve o campo `nome_acompanhantes`, que hoje
guarda `"CLI-02151 - Maria Tereza Teixeira Leite"` como texto — um id de cliente
dentro de uma string. Vira chave estrangeira, e a acompanhante ganha ficha
própria com o histórico dela.

**`crm_faturamento`** separa o dinheiro do resto, porque tem outro ciclo (fecha
depois) e outra permissão (nem todo mundo do salão vê valor):

```sql
valor_reserva     numeric(12,2),
consumo_bebida    numeric(12,2),
taxa_servico      numeric(12,2),
total_bruto       numeric(12,2) generated always as
                  (coalesce(valor_reserva,0) + coalesce(consumo_bebida,0)
                   + coalesce(taxa_servico,0)) stored,
```

A taxa de serviço da planilha é consistentemente **15%** sobre reserva + bebida
(conferido em todas as 24 linhas faturadas). Fica como valor gravado, não
recalculado — a alíquota pode mudar, e o histórico precisa continuar batendo.

**`crm_notas`** é append-only, como `label_events` do Módulo 1: observações,
feedback e recados viram linha do tempo, nunca sobrescrita. Quem escreveu e
quando ficam registrados.

### 3.2 O que nunca mais é digitado

Total de reservas, total de pessoas, primeira e última visita, faturamento
acumulado, ticket médio, consumo de bebidas e a lista de menus já servidos —
tudo isso hoje é fórmula na aba de perfil, e `menus_experiencias_servidos` está
gravado como texto no cadastro, envelhecendo a cada visita nova.

No banco vira uma view:

```sql
create view crm_cliente_resumo as
select c.id, count(r.id) as visitas, sum(r.total_pessoas) as pessoas,
       min(r.data_reserva) as primeira, max(r.data_reserva) as ultima,
       sum(f.total_bruto) as bruto,
       sum(f.total_bruto) / nullif(count(r.id), 0) as ticket_medio
  from crm_clientes c
  left join crm_reservas r on r.cliente_id = c.id
  left join crm_faturamento f on f.reserva_id = r.id
 group by c.id;
```

Com 2.082 clientes uma view comum resolve em milissegundos; materializar só se
e quando doer.

### 3.3 Regras que o banco passa a garantir

| Regra | Como |
| --- | --- |
| Telefone sempre em E.164 | Normalização na entrada + `check` |
| Sem cliente duplicado | Índice único parcial `(org_id, telefone_e164)` |
| Vazio é vazio | `null`, nunca `0` — a migração converte |
| Nada some | `deleted_at` (soft delete), como no resto do app |
| Isolamento por restaurante | `org_id` em toda tabela + RLS |
| Rastro de alteração | `crm_eventos`, alimentada por gatilho |

## 4. O layout do PWA

### 4.1 Uma base, três larguras

O mesmo código serve os três dispositivos, com dois pontos de quebra do
Tailwind — nada de "versão mobile" separada:

| | Celular (`< 768px`) | Tablet (`768–1279px`) | Desktop (`≥ 1280px`) |
| --- | --- | --- | --- |
| Navegação | Barra inferior, 5 abas | Barra lateral estreita, ícones | Barra lateral larga, com rótulos |
| Conteúdo | Uma coluna, pilha | Lista + detalhe, lado a lado | Navegação + lista + detalhe |
| Ficha do cliente | Tela cheia, blocos empilhados | Duas colunas | Três colunas, sem rolagem no essencial |
| Alvo de toque | 56px (o `min-h-toque` já no projeto) | 56px | 40px |

O celular é o caso principal: é o aparelho que está no bolso do maître durante
o serviço. O desktop é o caso do escritório — importar, corrigir em lote, olhar
relatório.

### 4.2 As telas

**1 · Hoje** — a tela que abre o app. Não é a lista de clientes; é o serviço de
hoje. Um cartão por reserva, ordenado por horário, e cada cartão diz em dois
segundos o que o salão precisa saber:

```
┌──────────────────────────────────────────────┐
│ 19:00 · Balcão · 2 pessoas          [1ª VEZ] │
│ Carlos Teixeira Leite — "Caca"               │
│ Seasonal Omakase 2026                        │
│ ⚠ ALERGIA: camarão   ⚑ Aniversário           │
│ 🍶 Traz os próprios sakes   💧 ASG            │
└──────────────────────────────────────────────┘
```

A tarja de alergia é vermelha, é a primeira coisa depois do nome e **não
colapsa**. É a única informação da ficha cujo esquecimento causa dano.

**2 · Ficha do cliente** — a tela mais importante, e o lugar onde as 50 linhas
da aba de perfil precisam virar hierarquia em vez de sequência. Seis blocos, em
ordem de urgência para quem está atendendo:

| Bloco | Conteúdo | Comportamento |
| --- | --- | --- |
| **Segurança** | Alergias, restrições | Topo, vermelho, sempre aberto |
| **Identidade** | Nome, como chamar, status, ranking, foto | Sempre visível |
| **À mesa** | Mão dominante, hashi próprio, água (ASG/ACG + marca), lugar preferido | Sempre visível |
| **Adega** | Sakes, vinhos, champagnes — em chips, um por rótulo | Recolhível |
| **História** | Linha do tempo de visitas: data, experiência, ocasião, valor, feedback | Recolhível |
| **Relacionamento** | Profissão, cargo, empresa, cônjuge, filhos, viagens ao Japão, interesses | Recolhível |

"Mão dominante" parece detalhe e não é: no balcão define de que lado o hashi é
posto. Ela sobe para o bloco **À mesa** justamente porque é acionável, e não
fica perdida entre CEP e profissão como está na planilha.

**3 · Clientes** — busca por nome, apelido, telefone ou e-mail, com filtros
facetados construídos direto da taxonomia: alergia, restrição, status,
experiência já servida, faixa de gasto, última visita, ocasião. É o que a
planilha simplesmente não faz, e é onde nasce a ação sobre os 77%.

**4 · Pós-serviço** — a tela que decide se o CRM vive ou morre. Hoje ninguém
preenche ficha porque preencher é chato. Então ao fechar a mesa o app pergunta
**quatro coisas, em chips tocáveis, em menos de trinta segundos**:

- O que foi servido? *(pré-selecionado pela experiência da reserva)*
- Como foi? *(cinco carinhas)*
- O que bebeu? *(busca na adega + "trouxe o próprio")*
- Algo para lembrar? *(voz ou texto, vira nota na linha do tempo)*

Nada obrigatório. Um chip tocado já é mais dado do que a planilha recebe hoje.

**5 · Painel** — os 77% na cara, e não escondidos num relatório: retenção do
mês, aniversariantes da semana, clientes sem vir há mais de X meses com valor
acumulado alto, top 100, ocupação por experiência, participação da bebida no
faturamento.

**6 · Faturamento** — lista, conciliação e o que está "aguardando faturamento".
Visível apenas para quem tem o papel.

**7 · Administração** — editor das listas de classificação, campos, papéis da
equipe, importação e exportação. É o que tira o administrador da dependência do
desenvolvedor.

### 4.3 Decisões de interface que importam

**Chip com busca, nunca `<select>` longo.** Restrições alimentares têm 78
opções na planilha. Um menu suspenso com 78 itens no celular é inutilizável; um
campo que filtra enquanto se digita, mostrando os mais usados primeiro, é
questão de dois toques.

**Nenhum formulário de 50 campos.** O cadastro novo pede **seis**: nome,
telefone, e-mail, status, alergias, restrições. Todo o resto aparece na ficha
como campo vazio discreto, preenchido quando a informação surgir. Formulário
longo não é preenchido — é abandonado, e é por isso que metade das colunas da
planilha está em branco.

**Edição no lugar, sem modo de edição.** Toca no campo, muda, salva sozinho. Sem
botão "editar" e "salvar" globais — o padrão de quem preenche de pé, com o
cliente à mesa.

**Offline por padrão.** Mesmo motor de sincronização dos Módulos 1 e 2: a tela
lê do IndexedDB, a escrita cai na fila local e sobe quando dá. O salão não para
porque o Wi-Fi caiu.

**Papéis, e não um login compartilhado.** Aqui está a diferença crítica em
relação à cozinha: o Módulo 1 usa um login só por restaurante, aberto no tablet
da bancada, porque ninguém digita senha com a mão suja. **Isso não pode valer
para o CRM.** São dados sensíveis de 2.082 pessoas; cada um entra com a própria
conta.

| Papel | Vê | Edita |
| --- | --- | --- |
| Hostess | Hoje, ficha sem valores | Notas, confirmação |
| Maître | Tudo do salão | Ficha, notas, pós-serviço |
| Sommelier | Ficha + adega | Adega, notas |
| Gerente | Tudo | Tudo do salão |
| Financeiro | Faturamento | Faturamento |
| Administrador | Tudo | Tudo, listas e papéis |

## 5. Hospedagem, em detalhe

### 5.1 O site

GitHub Pages, que já está de pé. Vale registrar uma dúvida comum: o repositório
ser público **não expõe dado nenhum de cliente**. O que vai para o Pages é o
código compilado; os dados moram no Supabase, atrás de autenticação e RLS. A
`anon key` que fica no bundle é pública por projeto — quem protege é a política
no banco, não o sigilo da chave.

Um passo adiante, quando fizer sentido: **domínio próprio**
(`crm.kanoe.com.br`), servido pelo Cloudflare Pages ou pelo próprio GitHub
Pages com CNAME. Custa o registro do domínio e melhora a instalação no celular
da equipe.

### 5.2 O banco

| | Supabase (recomendado) | Firebase | Airtable / Notion | Postgres em VPS |
| --- | --- | --- | --- | --- |
| Relacional de verdade | ✅ Postgres | ❌ documentos | ⚠️ limitado | ✅ |
| Já usado neste app | ✅ | ❌ | ❌ | ❌ |
| Região Brasil | ✅ sa-east-1 | ⚠️ | ❌ | ✅ |
| Permissão por papel | ✅ RLS | ⚠️ regras | ⚠️ por base | ✅ |
| Custo em 2.082 clientes | R$ 0 → US$ 25/mês | R$ 0 → variável | ~US$ 20/usuário/mês | US$ 6/mês + trabalho |
| Quem cuida do backup | Supabase | Google | Fornecedor | **Você** |

A recomendação é Supabase por três razões concretas, nesta ordem: o app já fala
com ele (motor de sincronização, autenticação, RLS e migrações prontos), os
dados são relacionais de verdade (cliente ↔ reserva ↔ faturamento ↔ taxonomia),
e a região São Paulo mantém dado pessoal sensível no Brasil.

Sobre custo: comece no plano gratuito para a migração e o teste. **Assim que
dado real de cliente entrar, suba para o Pro.** Não é por limite de tamanho — é
que o plano gratuito pausa projeto ocioso e não tem retenção de backup, e as
duas coisas são inaceitáveis para a base de clientes do restaurante.

### 5.3 LGPD, em termos práticos

Alergia é dado de saúde, logo dado pessoal sensível. O que o desenho já
resolve, sem virar projeto à parte:

- Dados na região brasileira, criptografados em repouso e em trânsito;
- Acesso por papel — a hostess não vê faturamento, o financeiro não precisa ver
  alergia;
- Trilha de auditoria em `crm_eventos`: quem viu e quem mudou;
- Exclusão a pedido do titular: `deleted_at` para o fluxo normal e remoção
  física por procedimento administrativo;
- Exportação da ficha completa de uma pessoa, para atender pedido de acesso;
- Base legal: execução de contrato para reserva e faturamento; consentimento
  para preferência e perfil.

## 6. Migração da planilha

Cinco passos, e o quarto é o que não pode ser pulado:

1. Exportar `CLIENTES_MASTER`, `REGISTRO_RESERVAS` e `FATURAMENTO` para CSV.
2. Carregar `LISTAS_CLIENTES` em `crm_taxonomias` — as 226 opções, com o tipo
   de cada bloco.
3. Rodar o importador, que normaliza pelo caminho: telefone para E.164, fração
   de dia para `time`, serial do Excel para `date`, `0` para `null`, e quebra os
   campos separados por `;` contra a taxonomia.
4. **Relatório de conferência**: toda linha que não casou com a taxonomia entra
   numa fila "a revisar" em vez de ser descartada em silêncio — os rótulos de
   sake escritos à mão vão cair muito aqui, e cada um é informação real sobre um
   cliente. O repositório já tem esse padrão em `supabase/conferir.sql`.
5. Conferir os totais contra a planilha: 2.082 clientes, 3.347 reservas,
   R$ 16.295.236 de bruto. Se não bater, a importação não acabou.

Os `(+16 rótulos)` truncados não têm volta a partir deste arquivo — é preciso
puxar a coluna original do `CLIENTES_MASTER` no SharePoint antes da migração.

## 7. Fases sugeridas

| Fase | Entrega | Por que nesta ordem |
| --- | --- | --- |
| **1** | Schema, RLS, taxonomias e importador com relatório | Sem dado dentro, nenhuma tela pode ser avaliada de verdade |
| **2** | Ficha do cliente + busca com filtros | É o que substitui a planilha no dia a dia |
| **3** | Hoje + pós-serviço | É o que faz o dado *entrar*, e o que sustenta o resto |
| **4** | Faturamento e papéis | Ciclo próprio, permissão própria |
| **5** | Painel e ações sobre os 77% | Só faz sentido com histórico já dentro |
| **6** | Administração das listas pelo app | Tira o administrador da dependência de código |

A fase 3 é a que costuma ser adiada e é a que decide o projeto: um CRM que
ninguém alimenta vira uma planilha mais bonita.

---

## Anexo — Mapa de campos: planilha → banco

| Planilha | Destino | Observação |
| --- | --- | --- |
| `cliente_id` | `crm_clientes.codigo_legado` | Preservado; a chave passa a ser uuid |
| `status_cliente` | `crm_taxonomias` (tipo `status_cliente`) | 7 opções |
| `nome`, `email` | `crm_clientes` | — |
| `telefone` | `crm_clientes.telefone_e164` | Normalizado |
| `Genêro`, `Endereço`, `Bairro`, `CEP` | `crm_clientes` | Nome do campo corrigido |
| `aniversario` | `crm_clientes.aniversario` | `date`; alimenta o painel |
| `mao_dominante` | `crm_clientes` | 3 opções — sobe para o bloco "À mesa" |
| `possui_hashi_personalizado` | `crm_clientes` | `boolean` |
| `casado`, `nome_conjuge_companheiro` | `crm_relacoes` | Vira vínculo entre clientes |
| `possui_filhos`, `quantos_filhos` | `crm_clientes` | — |
| `alergias_alimentares` | `crm_cliente_tags` | 28 opções, N:N |
| `restricoes_alimentares` | `crm_cliente_tags` | 70 opções, N:N |
| `preferencias_gastronomicas` | `crm_cliente_tags` | 30 opções, N:N |
| `perfil_de_interesses` | `crm_cliente_tags` | 7 opções |
| `interesses_gastronomicos` | `crm_cliente_tags` | 8 opções |
| `ocasioes_registradas` | `crm_reserva_tags` | Sai do cadastro: é da visita |
| `profissao_formacao`, `cargo_funcao` | `crm_cliente_tags` | 21 e 31 opções |
| `empresa_organizacao` | `crm_clientes.empresa` | — |
| `ja_foi_para_o_japao`, `tem_habito_de_viajar` | `crm_clientes` | `boolean` |
| `menus_experiencias_servidos` | **view** `crm_cliente_resumo` | Deixa de ser digitado |
| `preferencia_agua`, `marca_agua` | `crm_clientes` | ASG/ACG + 8 marcas |
| `saquê`…`licor` (8 campos) | `crm_cliente_bebidas` | Um rótulo por linha |
| `OBSERVAÇÕES`, `feedback` | `crm_notas` | Linha do tempo, com autor e data |
| `ranking_top_100` | `crm_clientes.ranking` | — |
| `status_revisao_nome`, `motivo_revisao_manual` | `crm_clientes` | Fila de revisão |
| `Titular` (`NG`/`REP`) | `crm_reservas.primeira_visita` | `boolean` |
| `nome_acompanhantes` | `crm_reserva_convivas` | Vira chave estrangeira |
| `valor_reserva`, `consumo_bebida` | `crm_faturamento` | — |
| `total_faturado_servico` | `crm_faturamento.taxa_servico` | 15% conferido |
| `fat_total_bruto` | Coluna gerada | O banco soma |
