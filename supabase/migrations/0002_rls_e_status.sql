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
create policy organizations_leitura on public.organizations
  for select using (id in (select public.orgs_do_usuario()));

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
    execute format($f$
      create policy %1$s_acesso_org on public.%1$I
        for all
        using (org_id in (select public.orgs_do_usuario()))
        with check (org_id in (select public.orgs_do_usuario()));
    $f$, t);
  end loop;
end;
$$;

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
