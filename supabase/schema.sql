-- All Big Chef — schema completo.
--
-- Cole ISTO INTEIRO no SQL Editor do Supabase e rode. Pode rodar de novo quantas
-- vezes quiser: tudo aqui é idempotente, então aplicar duas vezes não quebra nada
-- e não apaga dado nenhum.
--
-- Modelo de segurança: cada linha pertence a um `dono_id`, e a política de RLS só
-- deixa você enxergar as suas. Por isso a anon key pode ser pública — ela não abre
-- porta nenhuma sem uma sessão válida por trás.

-- ---------------------------------------------------------------------------
-- Colunas comuns a todas as tabelas
-- ---------------------------------------------------------------------------
-- id            identidade da linha, gerada no cliente para funcionar offline
-- dono_id       quem pode ver (auth.uid())
-- espaco_id     restaurante; NULO = biblioteca pessoal, visível de todos
-- atualizado_em carimbo do servidor; é o cursor que o sync usa para puxar o novo
-- apagado_em    soft delete; apagar precisa viajar como dado para chegar no outro
--               aparelho, senão o registro ressuscita no próximo sync

-- ---------------------------------------------------------------------------
-- Gatilho de carimbo
-- ---------------------------------------------------------------------------
-- O carimbo é do SERVIDOR, não do celular. Relógio de aparelho atrasado faria a
-- linha nova nascer "velha" e o sync nunca mais a enxergaria.
create or replace function public.carimbar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.espacos (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  tipo_casa text not null default 'a_la_carte',
  cmv_alvo numeric not null default 0.32,
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.insumos (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  nome text not null,
  categoria text not null default '',
  fornecedor text not null default '',
  quantidade_compra numeric not null default 1,
  unidade_compra text not null default 'kg',
  preco_compra numeric not null default 0,
  unidade_uso text not null default 'g',
  fator_correcao numeric not null default 1,
  observacao text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.fichas (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  -- 'prato' e 'preparo' são a mesma coisa com papéis diferentes. É isso que deixa
  -- um prato conter dez preparos e um preparo conter outros preparos.
  tipo text not null default 'preparo',
  nome text not null,
  categoria text not null default '',
  rendimento_quantidade numeric not null default 1,
  rendimento_unidade text not null default 'un',
  porcoes numeric not null default 1,
  modo_preparo jsonb not null default '[]'::jsonb,
  tempo_minutos integer,
  alergenicos jsonb not null default '[]'::jsonb,
  observacao text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.ficha_componentes (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  ficha_id uuid not null references public.fichas (id) on delete cascade,
  insumo_id uuid references public.insumos (id) on delete set null,
  ficha_filha_id uuid references public.fichas (id) on delete set null,
  quantidade numeric not null default 0,
  unidade text not null default 'g',
  ordem integer not null default 0,
  observacao text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz,
  -- Um componente é OU um ingrediente OU um preparo. Nunca os dois, nunca nenhum.
  constraint componente_aponta_para_um_so check (
    (insumo_id is not null and ficha_filha_id is null)
    or (insumo_id is null and ficha_filha_id is not null)
  ),
  -- Laço de um nível só; os mais fundos o app corta na hora de montar a árvore.
  constraint componente_nao_se_referencia check (ficha_filha_id is null or ficha_filha_id <> ficha_id)
);

create table if not exists public.menus (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.menu_itens (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  ficha_id uuid not null references public.fichas (id) on delete cascade,
  porcoes_previstas numeric not null default 1,
  ordem integer not null default 0,
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.servicos (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  data date not null,
  nome text not null default '',
  menu_id uuid references public.menus (id) on delete set null,
  observacao text not null default '',
  -- Cópia congelada do que foi servido naquele dia: nomes, quantidades e modo de
  -- preparo como estavam ALI. Sem isso, consultar 10 de setembro daqui a um ano
  -- mostraria a receita de hoje — que é justamente o que não se quer saber.
  snapshot jsonb,
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

create table if not exists public.producao_itens (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  servico_id uuid not null references public.servicos (id) on delete cascade,
  ficha_id uuid not null references public.fichas (id) on delete cascade,
  status text not null default 'a_fazer',
  quantidade_ajustada numeric,
  nota text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz,
  -- A tarefa é o preparo, não a posição na árvore: se o fundo entra em três
  -- pratos, fazer o fundo é UM trabalho.
  constraint producao_uma_tarefa_por_preparo unique (servico_id, ficha_id)
);

create table if not exists public.compra_itens (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  origem_tipo text not null,
  origem_id uuid not null,
  insumo_id uuid not null references public.insumos (id) on delete cascade,
  comprado boolean not null default false,
  quantidade_ajustada numeric,
  nota text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz,
  constraint compra_um_item_por_insumo unique (origem_tipo, origem_id, insumo_id)
);

create table if not exists public.periodos_cmv (
  id uuid primary key,
  dono_id uuid not null references auth.users (id) on delete cascade,
  espaco_id uuid references public.espacos (id) on delete cascade,
  rotulo text not null,
  inicio date not null,
  fim date not null,
  estoque_inicial numeric not null default 0,
  compras numeric not null default 0,
  estoque_final numeric not null default 0,
  faturamento numeric not null default 0,
  observacao text not null default '',
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz
);

-- ---------------------------------------------------------------------------
-- Índices, gatilhos e RLS, aplicados igual em todas as tabelas
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tabelas text[] := array[
    'espacos', 'insumos', 'fichas', 'ficha_componentes', 'menus', 'menu_itens',
    'servicos', 'producao_itens', 'compra_itens', 'periodos_cmv'
  ];
begin
  foreach t in array tabelas loop
    -- O sync puxa "o que mudou desde X" — sem este índice isso vira varredura.
    execute format(
      'create index if not exists %I on public.%I (dono_id, atualizado_em)',
      'idx_' || t || '_sync', t
    );

    execute format('drop trigger if exists trg_%I_carimbo on public.%I', t, t);
    execute format(
      'create trigger trg_%I_carimbo before insert or update on public.%I
         for each row execute function public.carimbar_atualizacao()', t, t
    );

    execute format('alter table public.%I enable row level security', t);

    -- Uma política por operação, todas dizendo a mesma coisa: é seu ou não existe.
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format(
      'create policy %I on public.%I for select using (dono_id = auth.uid())', t || '_ler', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format(
      'create policy %I on public.%I for insert with check (dono_id = auth.uid())',
      t || '_inserir', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_alterar', t);
    execute format(
      'create policy %I on public.%I for update using (dono_id = auth.uid())
         with check (dono_id = auth.uid())', t || '_alterar', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_apagar', t);
    execute format(
      'create policy %I on public.%I for delete using (dono_id = auth.uid())', t || '_apagar', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
-- Roda junto e imprime o resultado. Se alguma linha aqui vier com 'FALTANDO' ou
-- com RLS desligado, o schema NÃO está pronto — e é melhor saber agora do que
-- descobrir quando o app não salvar.
select
  t.tabela,
  case when c.oid is null then 'FALTANDO' else 'ok' end as tabela_existe,
  coalesce(c.relrowsecurity, false) as rls_ligado,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabela) as politicas
from (
  values
    ('espacos'), ('insumos'), ('fichas'), ('ficha_componentes'), ('menus'),
    ('menu_itens'), ('servicos'), ('producao_itens'), ('compra_itens'), ('periodos_cmv')
) as t (tabela)
left join pg_class c on c.relname = t.tabela and c.relnamespace = 'public'::regnamespace
order by t.tabela;
