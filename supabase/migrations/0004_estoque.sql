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
