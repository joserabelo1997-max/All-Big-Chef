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
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Liga o usuário do Supabase Auth (um login por restaurante) à organização.
create table public.org_members (
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  papel       text not null default 'admin' check (papel in ('admin', 'operador')),
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index on public.org_members (org_id);

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
create table public.team_members (
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

create index on public.team_members (org_id, updated_at);

-- -----------------------------------------------------------------------------
-- Pastas / categorias (Laticínios, Pescados, Carnes...). `parent_id` permite
-- subpastas; a hierarquia é rasa na prática, mas custa pouco suportá-la.
-- -----------------------------------------------------------------------------
create table public.folders (
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

create index on public.folders (org_id, updated_at);
create index on public.folders (org_id, parent_id);

-- -----------------------------------------------------------------------------
-- Fornecedores. Vira o campo {{fornecedor}} da etiqueta.
-- -----------------------------------------------------------------------------
create table public.suppliers (
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

create index on public.suppliers (org_id, updated_at);

-- -----------------------------------------------------------------------------
-- Produtos cadastrados.
--
-- `shelf_life_days` é o número de dias de validade após a abertura, definido
-- uma vez por produto. As referências ficam com ON DELETE SET NULL: apagar uma
-- pasta não pode apagar os produtos dentro dela.
-- -----------------------------------------------------------------------------
create table public.products (
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

create index on public.products (org_id, updated_at);
create index on public.products (org_id, folder_id);

-- -----------------------------------------------------------------------------
-- Modelos de etiqueta. `elements` guarda o layout desenhado no editor visual:
-- uma lista de elementos posicionados em MILÍMETROS, não em pixels nem em dots.
-- Milímetro é a única unidade que sobrevive à troca de impressora — o mesmo
-- modelo renderiza igual em 203 e em 300 dpi.
-- -----------------------------------------------------------------------------
create table public.label_templates (
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

create index on public.label_templates (org_id, updated_at);

-- Garante no máximo um modelo padrão por organização.
create unique index label_templates_um_padrao_por_org
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
create table public.labels (
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
create unique index labels_short_code_por_org
  on public.labels (org_id, short_code)
  where deleted_at is null;

create index on public.labels (org_id, updated_at);
-- Índice do painel de validades: as consultas sempre filtram ativas por prazo.
create index labels_ativas_por_validade
  on public.labels (org_id, expires_at)
  where status = 'ativa' and deleted_at is null;
create index on public.labels (org_id, product_id);

-- -----------------------------------------------------------------------------
-- Trilha de auditoria. Append-only: nada aqui é editado ou apagado.
--
-- É isto que permite responder "quem imprimiu, quem deu baixa, quando e por
-- quê" — e é o que resolve conflito de sync sem perder informação. Se dois
-- aparelhos offline agirem sobre a mesma etiqueta, os dois eventos sobrevivem;
-- fosse um UPDATE em `labels.status`, um deles sumiria em silêncio.
-- -----------------------------------------------------------------------------
create table public.label_events (
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

create index on public.label_events (org_id, created_at);
create index on public.label_events (label_id, ocorrido_em);

-- -----------------------------------------------------------------------------
-- Assinaturas Web Push, uma por aparelho/navegador.
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.push_subscriptions (org_id);

-- -----------------------------------------------------------------------------
-- Configurações do restaurante.
--
-- `printer_profile` guarda o que a tela de Diagnóstico descobriu sobre a
-- etiquetadora: UUIDs GATT, linguagem de comando e DPI. Fica no banco, e não no
-- localStorage, para que um segundo aparelho na cozinha já pareie sabendo os
-- parâmetros certos, sem repetir a descoberta.
-- -----------------------------------------------------------------------------
create table public.org_settings (
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
    execute format(
      'create trigger %I_touch before update on public.%I
         for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;
