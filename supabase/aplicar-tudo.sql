-- =============================================================================
-- All Big Chef — schema completo, para colar de uma vez no SQL Editor
-- =============================================================================
-- Gerado a partir de supabase/migrations/. As três migrations na ordem certa,
-- num arquivo só: colar fora de ordem era o erro mais provável do processo
-- manual, e ele deixa de existir aqui.
--
-- NÃO inclui a 0003 (agendamento das notificações): ela depende das chaves
-- VAPID e tem passo próprio na seção 7 de docs/SETUP_SUPABASE.md.
--
-- RODAR DE NOVO É SEGURO. Tabelas e índices usam `if not exists`; gatilhos e
-- políticas, que não têm essa forma no Postgres, são derrubados antes de serem
-- recriados; funções usam `create or replace`. Isso foi testado aplicando o
-- arquivo duas vezes no mesmo banco, não só uma vez num banco novo.
--
-- Depois de rodar, cole supabase/conferir.sql para ver o relatório.
-- =============================================================================

-- ###########################################################################
-- ## 0001_schema.sql
-- ###########################################################################

-- =============================================================================
-- All Big Chef — Módulo 1: etiquetas, validades e rastreabilidade
-- Migration 0001 — estrutura de tabelas
-- =============================================================================
-- Convenções aplicadas em todo o schema:
--   * `id` é uuid gerado no CLIENTE, não no banco. O app precisa imprimir a
--     etiqueta (com o QR contendo o id) mesmo offline, antes de qualquer
--     contato com o servidor. Gerar no banco tornaria a impressão offline
--     impossível.
--   * `org_id` em toda tabela — é o eixo do isolamento multi-tenant no RLS.
--   * `updated_at` alimenta o pull incremental do sync (`updated_at > cursor`).
--   * `deleted_at` (soft delete) em vez de DELETE, porque um DELETE físico não
--     se propaga para aparelhos que estavam offline: eles reinseririam a linha.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Gatilho compartilhado de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Organização = o restaurante. Multi-tenant desde o início: é muito mais barato
-- carregar org_id agora do que retrofitar isolamento depois que houver dados.
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Liga o usuário do Supabase Auth (um login por restaurante) à organização.
create table if not exists public.org_members (
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  papel       text not null default 'admin' check (papel in ('admin', 'operador')),
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index if not exists org_members_org_id_idx on public.org_members (org_id);

-- -----------------------------------------------------------------------------
-- Equipe da cozinha.
--
-- Deliberadamente NÃO são usuários do Supabase Auth. O login é único do
-- restaurante (fica aberto no tablet da bancada) e o operador só toca no
-- próprio nome numa lista antes de imprimir ou dar baixa. Autenticar cada
-- cozinheiro por e-mail e senha tornaria a operação inviável — ninguém digita
-- senha com a mão suja no meio do serviço — e a rastreabilidade que a RDC 216
-- pede é "quem fez", que esta tabela já entrega.
--
-- O PIN é opcional e serve contra registro casual em nome de outro colega, não
-- contra um adversário determinado. Guardamos apenas o hash.
-- -----------------------------------------------------------------------------
create table if not exists public.team_members (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  nome        text not null,
  cargo       text,
  pin_hash    text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists team_members_org_id_updated_at_idx on public.team_members (org_id, updated_at);

-- -----------------------------------------------------------------------------
-- Pastas / categorias (Laticínios, Pescados, Carnes...). `parent_id` permite
-- subpastas; a hierarquia é rasa na prática, mas custa pouco suportá-la.
-- -----------------------------------------------------------------------------
create table if not exists public.folders (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  parent_id   uuid references public.folders(id) on delete set null,
  nome        text not null,
  cor         text not null default '#64748b',
  icone       text,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists folders_org_id_updated_at_idx on public.folders (org_id, updated_at);
create index if not exists folders_org_id_parent_id_idx on public.folders (org_id, parent_id);

-- -----------------------------------------------------------------------------
-- Fornecedores. Vira o campo {{fornecedor}} da etiqueta.
-- -----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  nome        text not null,
  cnpj        text,
  contato     text,
  observacoes text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists suppliers_org_id_updated_at_idx on public.suppliers (org_id, updated_at);

-- -----------------------------------------------------------------------------
-- Produtos cadastrados.
--
-- `shelf_life_days` é o número de dias de validade após a abertura, definido
-- uma vez por produto. As referências ficam com ON DELETE SET NULL: apagar uma
-- pasta não pode apagar os produtos dentro dela.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  folder_id        uuid references public.folders(id) on delete set null,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  nome             text not null,
  shelf_life_days  integer not null check (shelf_life_days >= 0),
  unidade          text,
  sku              text,
  observacoes      text,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists products_org_id_updated_at_idx on public.products (org_id, updated_at);
create index if not exists products_org_id_folder_id_idx on public.products (org_id, folder_id);

-- -----------------------------------------------------------------------------
-- Modelos de etiqueta. `elements` guarda o layout desenhado no editor visual:
-- uma lista de elementos posicionados em MILÍMETROS, não em pixels nem em dots.
-- Milímetro é a única unidade que sobrevive à troca de impressora — o mesmo
-- modelo renderiza igual em 203 e em 300 dpi.
-- -----------------------------------------------------------------------------
create table if not exists public.label_templates (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  nome        text not null,
  width_mm    numeric(6, 2) not null default 60,
  height_mm   numeric(6, 2) not null default 40,
  elements    jsonb not null default '[]'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists label_templates_org_id_updated_at_idx on public.label_templates (org_id, updated_at);

-- Garante no máximo um modelo padrão por organização.
create unique index if not exists label_templates_um_padrao_por_org
  on public.label_templates (org_id)
  where is_default and deleted_at is null;

-- -----------------------------------------------------------------------------
-- ETIQUETAS IMPRESSAS — o coração da rastreabilidade.
--
-- Os campos `*_snapshot` não são desnormalização preguiçosa: são obrigatórios
-- para que o histórico não minta. Se amanhã o produto for renomeado de
-- "Creme de leite" para "Creme de leite UHT", ou trocar de fornecedor, a
-- etiqueta impressa ontem precisa continuar dizendo o que estava escrito nela
-- no papel colado no pote. Sem snapshot, um JOIN reescreveria retroativamente o
-- passado — exatamente o que uma auditoria sanitária não pode encontrar.
--
-- `status` é cache derivado de `label_events`, mantido por gatilho (migration
-- 0002). A verdade está nos eventos, que são append-only.
-- -----------------------------------------------------------------------------
create table if not exists public.labels (
  id                    uuid primary key,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  short_code            text not null,
  product_id            uuid references public.products(id) on delete set null,
  template_id           uuid references public.label_templates(id) on delete set null,

  produto_snapshot      text not null,
  fornecedor_snapshot   text,
  pasta_snapshot        text,
  shelf_life_days_snapshot integer,

  opened_at             timestamptz not null,
  expires_at            timestamptz not null,
  lote                  text,
  quantidade            numeric(10, 3),
  unidade               text,

  printed_by_member_id  uuid references public.team_members(id) on delete set null,
  printed_by_snapshot   text,
  printed_at            timestamptz not null default now(),

  status                text not null default 'ativa'
                          check (status in ('ativa', 'consumida', 'descartada')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint labels_validade_apos_abertura check (expires_at >= opened_at)
);

-- O short code é digitado à mão quando o QR está amassado ou sujo de gordura;
-- precisa ser único dentro do restaurante para resolver sem ambiguidade.
create unique index if not exists labels_short_code_por_org
  on public.labels (org_id, short_code)
  where deleted_at is null;

create index if not exists labels_org_id_updated_at_idx on public.labels (org_id, updated_at);
-- Índice do painel de validades: as consultas sempre filtram ativas por prazo.
create index if not exists labels_ativas_por_validade
  on public.labels (org_id, expires_at)
  where status = 'ativa' and deleted_at is null;
create index if not exists labels_org_id_product_id_idx on public.labels (org_id, product_id);

-- -----------------------------------------------------------------------------
-- Trilha de auditoria. Append-only: nada aqui é editado ou apagado.
--
-- É isto que permite responder "quem imprimiu, quem deu baixa, quando e por
-- quê" — e é o que resolve conflito de sync sem perder informação. Se dois
-- aparelhos offline agirem sobre a mesma etiqueta, os dois eventos sobrevivem;
-- fosse um UPDATE em `labels.status`, um deles sumiria em silêncio.
-- -----------------------------------------------------------------------------
create table if not exists public.label_events (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  label_id    uuid not null references public.labels(id) on delete cascade,
  tipo        text not null check (tipo in (
                'impressa', 'reimpressa', 'consumida', 'descartada', 'vencida_auto'
              )),
  motivo      text,
  member_id   uuid references public.team_members(id) on delete set null,
  member_snapshot text,
  ocorrido_em timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists label_events_org_id_created_at_idx on public.label_events (org_id, created_at);
create index if not exists label_events_label_id_ocorrido_em_idx on public.label_events (label_id, ocorrido_em);

-- -----------------------------------------------------------------------------
-- Assinaturas Web Push, uma por aparelho/navegador.
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_org_id_idx on public.push_subscriptions (org_id);

-- -----------------------------------------------------------------------------
-- Configurações do restaurante.
--
-- `printer_profile` guarda o que a tela de Diagnóstico descobriu sobre a
-- etiquetadora: UUIDs GATT, linguagem de comando e DPI. Fica no banco, e não no
-- localStorage, para que um segundo aparelho na cozinha já pareie sabendo os
-- parâmetros certos, sem repetir a descoberta.
-- -----------------------------------------------------------------------------
create table if not exists public.org_settings (
  org_id                uuid primary key references public.organizations(id) on delete cascade,
  alerta_dias_antes     integer not null default 2 check (alerta_dias_antes >= 0),
  alerta_horario        time not null default '08:00',
  default_template_id   uuid references public.label_templates(id) on delete set null,
  printer_profile       jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Gatilhos de updated_at
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'team_members', 'folders', 'suppliers', 'products',
    'label_templates', 'labels', 'push_subscriptions', 'org_settings'
  ]
  loop
    -- Dropa antes de criar: o Postgres não tem `create trigger if not exists`,
    -- e sem isso reaplicar o schema falha na segunda vez.
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ###########################################################################
-- ## 0002_rls_e_status.sql
-- ###########################################################################

-- =============================================================================
-- Migration 0002 — derivação de status e políticas de acesso (RLS)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- `labels.status` derivado de `label_events`
--
-- A verdade mora nos eventos; `labels.status` é só um cache para o app não
-- precisar agregar a trilha inteira a cada listagem.
--
-- Recalculamos a partir do evento terminal MAIS RECENTE por `ocorrido_em`, em
-- vez de simplesmente aplicar o evento que acabou de chegar. Isso importa
-- porque o sync offline entrega fora de ordem: um tablet que ficou sem rede a
-- manhã toda pode subir às 14h um "consumida" das 9h, depois de outro aparelho
-- já ter registrado "descartada" às 11h. Aplicar o último a chegar deixaria a
-- etiqueta como consumida — contando a história errada. Ordenar por quando o
-- fato aconteceu, e não por quando o pacote chegou, resolve.
-- -----------------------------------------------------------------------------
create or replace function public.recalcular_status_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_status text;
begin
  select case e.tipo when 'consumida' then 'consumida' else 'descartada' end
    into novo_status
  from public.label_events e
  where e.label_id = new.label_id
    and e.tipo in ('consumida', 'descartada')
  order by e.ocorrido_em desc, e.created_at desc
  limit 1;

  update public.labels
     set status = coalesce(novo_status, 'ativa')
   where id = new.label_id
     and status is distinct from coalesce(novo_status, 'ativa');

  return null;
end;
$$;

drop trigger if exists label_events_recalcula_status on public.label_events;
create trigger label_events_recalcula_status
  after insert on public.label_events
  for each row execute function public.recalcular_status_etiqueta();

-- -----------------------------------------------------------------------------
-- Helper de isolamento multi-tenant.
--
-- STABLE + security definer para que o Postgres avalie uma vez por consulta em
-- vez de uma vez por linha — sem isso, o RLS vira gargalo nas listagens.
-- -----------------------------------------------------------------------------
create or replace function public.orgs_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Sem exceção: toda tabela liga RLS. A anon key do Supabase é pública e vai
-- dentro do bundle JavaScript, então é a política aqui embaixo — não o sigilo
-- da chave — que impede um restaurante de ler os dados de outro.
-- -----------------------------------------------------------------------------
alter table public.organizations     enable row level security;
alter table public.org_members       enable row level security;
alter table public.team_members      enable row level security;
alter table public.folders           enable row level security;
alter table public.suppliers         enable row level security;
alter table public.products          enable row level security;
alter table public.label_templates   enable row level security;
alter table public.labels            enable row level security;
alter table public.label_events      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.org_settings      enable row level security;

-- A organização em si: leitura para quem é membro, escrita só via service_role.
drop policy if exists organizations_leitura on public.organizations;
create policy organizations_leitura on public.organizations
  for select using (id in (select public.orgs_do_usuario()));

drop policy if exists org_members_leitura on public.org_members;
create policy org_members_leitura on public.org_members
  for select using (user_id = auth.uid());

-- Tabelas de dados: acesso total dentro da própria organização.
do $$
declare
  t text;
begin
  foreach t in array array[
    'team_members', 'folders', 'suppliers', 'products',
    'label_templates', 'labels', 'label_events', 'push_subscriptions'
  ]
  loop
    -- Idem para políticas: sem `if not exists`, dropa antes.
    execute format('drop policy if exists %1$s_acesso_org on public.%1$I', t);
    execute format($f$
      create policy %1$s_acesso_org on public.%1$I
        for all
        using (org_id in (select public.orgs_do_usuario()))
        with check (org_id in (select public.orgs_do_usuario()));
    $f$, t);
  end loop;
end;
$$;

drop policy if exists org_settings_acesso on public.org_settings;
create policy org_settings_acesso on public.org_settings
  for all
  using (org_id in (select public.orgs_do_usuario()))
  with check (org_id in (select public.orgs_do_usuario()));

-- -----------------------------------------------------------------------------
-- A trilha de auditoria é imutável.
--
-- As políticas acima concedem `for all`, o que incluiria UPDATE e DELETE em
-- label_events. Revogamos no nível de privilégio: uma trilha que pode ser
-- editada não serve como trilha. Correção de erro se faz somando um evento
-- novo, nunca apagando o antigo.
-- -----------------------------------------------------------------------------
revoke update, delete on public.label_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Provisionamento de uma organização nova.
--
-- Roda como security definer porque, no instante em que o usuário se cadastra,
-- ele ainda não é membro de organização alguma — logo o RLS bloquearia o
-- próprio INSERT que o tornaria membro. Cria a org, vincula o usuário, semeia
-- as pastas típicas de cozinha e abre as configurações padrão.
-- -----------------------------------------------------------------------------
create or replace function public.criar_organizacao(nome_org text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nova_org uuid;
  pasta record;
begin
  if auth.uid() is null then
    raise exception 'Necessário estar autenticado.';
  end if;

  insert into public.organizations (nome) values (nome_org) returning id into nova_org;

  insert into public.org_members (user_id, org_id, papel)
  values (auth.uid(), nova_org, 'admin');

  for pasta in
    select * from (values
      ('Laticínios',  '#0ea5e9', '🥛', 1),
      ('Pescados',    '#0891b2', '🐟', 2),
      ('Carnes',      '#dc2626', '🥩', 3),
      ('Aves',        '#ea580c', '🍗', 4),
      ('Hortifrúti',  '#16a34a', '🥬', 5),
      ('Molhos',      '#ca8a04', '🥫', 6),
      ('Congelados',  '#2563eb', '🧊', 7),
      ('Secos',       '#78716c', '🌾', 8),
      ('Pré-preparo', '#7c3aed', '🍲', 9)
    ) as p(nome, cor, icone, ordem)
  loop
    insert into public.folders (id, org_id, nome, cor, icone, ordem)
    values (gen_random_uuid(), nova_org, pasta.nome, pasta.cor, pasta.icone, pasta.ordem);
  end loop;

  insert into public.org_settings (org_id) values (nova_org);

  return nova_org;
end;
$$;

grant execute on function public.criar_organizacao(text) to authenticated;

-- ###########################################################################
-- ## 0004_estoque.sql
-- ###########################################################################

-- =============================================================================
-- Migration 0004 — Módulo de estoque
-- =============================================================================
-- Segue as mesmas convenções das migrations anteriores: id gerado no cliente,
-- org_id em toda tabela, updated_at para o pull incremental, soft delete onde
-- faz sentido, e RLS por organização.
--
-- A decisão estrutural do módulo é o LIVRO-RAZÃO: o saldo do estoque é derivado
-- da soma dos movimentos, nunca um número editável. É a mesma escolha que
-- sustenta `label_events`, e pelo mesmo motivo — dois aparelhos offline
-- ajustando o mesmo item não podem se sobrescrever, e "para onde foi o produto"
-- precisa continuar respondível meses depois.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Facetas do produto
--
-- Catálogo ÚNICO: "Creme de leite" é cadastrado uma vez e pode participar das
-- duas coisas. Duplicar o catálogo faria renomear um produto exigir a mesma
-- edição em dois lugares, e eles divergiriam com o tempo.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists gera_etiqueta   boolean not null default true,
  add column if not exists controla_estoque boolean not null default false,
  -- 'kg' | 'un' | 'ambos'. Em 'ambos', os dois saldos são INDEPENDENTES, sem
  -- conversão: um saco fechado de arroz e o arroz a granel são coisas
  -- diferentes para quem confere a prateleira.
  add column if not exists unidade_estoque text not null default 'un'
    check (unidade_estoque in ('kg', 'un', 'ambos')),
  add column if not exists estoque_minimo_kg numeric(12, 3) not null default 0,
  add column if not exists estoque_minimo_un numeric(12, 3) not null default 0,
  -- Lote impresso na embalagem do fabricante. Fica no produto porque não é um
  -- valor livre por impressão: muda quando muda o lote comprado.
  add column if not exists lote_atual text,
  -- Cache do saldo, mantido por gatilho. A verdade está nos movimentos; isto
  -- existe só para listar rápido, como `labels.status`.
  add column if not exists saldo_kg numeric(12, 3) not null default 0,
  add column if not exists saldo_un numeric(12, 3) not null default 0;

create index if not exists products_estoque
  on public.products (org_id) where controla_estoque;

-- Telefone do fornecedor, para o pedido pelo WhatsApp.
alter table public.suppliers
  add column if not exists telefone text;

-- Quem pode liberar uma requisição de retirada.
alter table public.team_members
  add column if not exists pode_aprovar boolean not null default false;

-- -----------------------------------------------------------------------------
-- Movimentos de estoque — append-only
--
-- `quantidade` é sempre POSITIVA; o sinal vem do tipo. Guardar negativo
-- convidaria a uma "entrada de -3" que ninguém sabe interpretar depois.
-- -----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id              uuid primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,

  tipo            text not null check (tipo in ('entrada', 'saida', 'ajuste', 'perda')),
  quantidade      numeric(12, 3) not null check (quantidade > 0),
  unidade         text not null check (unidade in ('kg', 'un')),

  -- Lote e validade da ENTRADA, que alimentam a ordem de uso (o que vence
  -- antes sai antes).
  lote            text,
  validade        date,

  -- Preço pago por unidade, só em entradas. Alimenta o valor médio ponderado.
  valor_unitario  numeric(12, 4),
  supplier_id     uuid references public.suppliers(id) on delete set null,

  member_id       uuid references public.team_members(id) on delete set null,
  member_snapshot text,
  motivo          text,

  ocorrido_em     timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  -- Um ajuste sem motivo é um número que ninguém consegue explicar na auditoria
  -- seguinte. Perda idem.
  constraint stock_movements_motivo_obrigatorio
    check (tipo not in ('ajuste', 'perda') or motivo is not null)
);

create index if not exists stock_movements_org_id_created_at_idx on public.stock_movements (org_id, created_at);
create index if not exists stock_movements_product_id_ocorrido_em_idx on public.stock_movements (product_id, ocorrido_em);
create index if not exists stock_movements_org_id_product_id_unidade_idx on public.stock_movements (org_id, product_id, unidade);

-- -----------------------------------------------------------------------------
-- Requisição de retirada, com aprovação
-- -----------------------------------------------------------------------------
create table if not exists public.stock_requests (
  id                uuid primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,

  quantidade        numeric(12, 3) not null check (quantidade > 0),
  unidade           text not null check (unidade in ('kg', 'un')),
  motivo            text,

  solicitante_id    uuid references public.team_members(id) on delete set null,
  solicitante_snapshot text,

  status            text not null default 'pendente'
                      check (status in ('pendente', 'aprovada', 'recusada')),
  decidido_por_id   uuid references public.team_members(id) on delete set null,
  decidido_por_snapshot text,
  decidido_em       timestamptz,
  -- Movimento de saída gerado ao aprovar. Sem isso, aprovar duas vezes na
  -- corrida entre dois aparelhos tiraria o produto duas vezes do estoque.
  movimento_id      uuid references public.stock_movements(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists stock_requests_org_id_updated_at_idx on public.stock_requests (org_id, updated_at);
create index if not exists stock_requests_org_id_status_idx on public.stock_requests (org_id, status);

-- -----------------------------------------------------------------------------
-- Contagem de inventário
--
-- Ao finalizar, a diferença vira MOVIMENTO DE AJUSTE, e não sobrescrita do
-- saldo. A diferença é justamente a informação valiosa: é ela que revela perda,
-- furto ou lançamento esquecido.
-- -----------------------------------------------------------------------------
create table if not exists public.stock_counts (
  id             uuid primary key,
  org_id         uuid not null references public.organizations(id) on delete cascade,
  nome           text,
  status         text not null default 'aberta' check (status in ('aberta', 'finalizada')),
  member_id      uuid references public.team_members(id) on delete set null,
  member_snapshot text,
  iniciada_em    timestamptz not null default now(),
  finalizada_em  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists stock_counts_org_id_updated_at_idx on public.stock_counts (org_id, updated_at);

create table if not exists public.stock_count_items (
  id                  uuid primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  count_id            uuid not null references public.stock_counts(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete cascade,
  unidade             text not null check (unidade in ('kg', 'un')),
  -- Saldo que o sistema achava que existia no momento da contagem.
  quantidade_sistema  numeric(12, 3) not null default 0,
  quantidade_contada  numeric(12, 3),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (count_id, product_id, unidade)
);

create index if not exists stock_count_items_org_id_updated_at_idx on public.stock_count_items (org_id, updated_at);

-- -----------------------------------------------------------------------------
-- Etiquetas de inventário
--
-- Tabela SEPARADA de `labels`, e de propósito: não tem `expires_at`, não entra
-- no painel de validades e não gera alerta nenhum. O QR aponta para
-- `#/i/<uuid>` em vez de `#/l/<uuid>`, então uma leitura nunca é confundida com
-- a outra — a separação é estrutural, não depende de disciplina de uso.
--
-- Serve para contar o que a casa produziu e guardou: cada unidade ganha um QR
-- único e a conferência do freezer vira passar o leitor.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_tags (
  id               uuid primary key,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  produto_snapshot text not null,

  short_code       text not null,
  quantidade       numeric(12, 3),
  unidade          text check (unidade in ('kg', 'un')),
  lote             text,

  status           text not null default 'em_estoque'
                     check (status in ('em_estoque', 'consumida')),

  printed_by_id    uuid references public.team_members(id) on delete set null,
  printed_by_snapshot text,
  printed_at       timestamptz not null default now(),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create unique index if not exists inventory_tags_short_code_por_org
  on public.inventory_tags (org_id, short_code) where deleted_at is null;

create index if not exists inventory_tags_org_id_updated_at_idx on public.inventory_tags (org_id, updated_at);
create index if not exists inventory_tags_org_id_status_idx on public.inventory_tags (org_id, status);

-- -----------------------------------------------------------------------------
-- Configurações novas
-- -----------------------------------------------------------------------------
alter table public.org_settings
  -- Dias da semana em que a casa fecha (0 = domingo … 6 = sábado). Alimenta o
  -- aviso "vence com a casa fechada".
  add column if not exists dias_fechados integer[] not null default '{}',
  add column if not exists mensagem_pedido text;

-- -----------------------------------------------------------------------------
-- Saldo derivado dos movimentos
--
-- Recalcula somando o livro inteiro daquele produto e unidade, em vez de somar
-- o delta do movimento recém-inserido. É mais caro, e é o certo: o sync offline
-- entrega movimentos fora de ordem e às vezes repetidos, e um acumulador
-- incremental erraria em silêncio — um saldo errado só é descoberto na
-- contagem, semanas depois.
-- -----------------------------------------------------------------------------
create or replace function public.recalcular_saldo_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
     set saldo_kg = coalesce((
           select sum(case when m.tipo = 'entrada' then m.quantidade
                           when m.tipo = 'ajuste'  then m.quantidade
                           else -m.quantidade end)
             from public.stock_movements m
            where m.product_id = alvo and m.unidade = 'kg'
         ), 0),
         saldo_un = coalesce((
           select sum(case when m.tipo = 'entrada' then m.quantidade
                           when m.tipo = 'ajuste'  then m.quantidade
                           else -m.quantidade end)
             from public.stock_movements m
            where m.product_id = alvo and m.unidade = 'un'
         ), 0)
   where p.id = alvo;

  return null;
end;
$$;

drop trigger if exists stock_movements_recalcula_saldo on public.stock_movements;
create trigger stock_movements_recalcula_saldo
  after insert or delete on public.stock_movements
  for each row execute function public.recalcular_saldo_estoque();

-- -----------------------------------------------------------------------------
-- Gatilhos de updated_at, no mesmo padrão da migration 0001
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'stock_requests', 'stock_counts', 'stock_count_items', 'inventory_tags'
  ]
  loop
    -- Dropa antes de criar: o Postgres não tem `create trigger if not exists`,
    -- e sem isso reaplicar o schema falha na segunda vez.
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS — mesmo desenho das tabelas existentes
-- -----------------------------------------------------------------------------
alter table public.stock_movements   enable row level security;
alter table public.stock_requests    enable row level security;
alter table public.stock_counts      enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.inventory_tags    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'stock_movements', 'stock_requests', 'stock_counts',
    'stock_count_items', 'inventory_tags'
  ]
  loop
    -- Idem para políticas: sem `if not exists`, dropa antes.
    execute format('drop policy if exists %1$s_acesso_org on public.%1$I', t);
    execute format($f$
      create policy %1$s_acesso_org on public.%1$I
        for all
        using (org_id in (select public.orgs_do_usuario()))
        with check (org_id in (select public.orgs_do_usuario()));
    $f$, t);
  end loop;
end;
$$;

-- O livro-razão é imutável, pelo mesmo motivo de `label_events`: um saldo que
-- pode ser reescrito não serve como controle. Correção se faz somando um
-- movimento de ajuste, que fica visível no histórico.
revoke update, delete on public.stock_movements from anon, authenticated;


-- =============================================================================
-- 0005 — Código de barras do produto
-- =============================================================================

alter table public.products
  add column if not exists codigo_barras text;

-- Único POR ORGANIZAÇÃO, e não global: o mesmo EAN existe na cozinha de todo
-- mundo, e um índice global faria o cadastro de um restaurante impedir o do
-- outro. Parcial porque a maioria dos produtos não tem código — nulo não
-- conflita com nulo no Postgres, mas o índice parcial também não os carrega.
create unique index if not exists products_codigo_barras_por_org
  on public.products (org_id, codigo_barras)
  where codigo_barras is not null and deleted_at is null;


-- =============================================================================
-- 0006 — Mensagem do pedido em duas partes
-- =============================================================================

alter table public.org_settings
  add column if not exists pedido_abertura text,
  add column if not exists pedido_fecho    text;
