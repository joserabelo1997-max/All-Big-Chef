-- =============================================================================
-- All Big Chef — relatório de conferência
-- =============================================================================
-- Cole no SQL Editor depois de `aplicar-tudo.sql`. Devolve uma tabela onde a
-- coluna `situacao` diz "ok" ou "FALTANDO" — não é preciso interpretar nada,
-- só olhar se sobrou algum FALTANDO.
--
-- Não altera nada: só lê o catálogo do banco.
-- =============================================================================

with esperado as (
  select unnest(array[
    'organizations', 'org_members', 'team_members', 'folders', 'suppliers',
    'products', 'label_templates', 'labels', 'label_events',
    'push_subscriptions', 'org_settings',
    'stock_movements', 'stock_requests', 'stock_counts', 'stock_count_items',
    'inventory_tags'
  ]) as nome
),

tabelas as (
  select e.nome,
         exists (
           select 1 from information_schema.tables t
            where t.table_schema = 'public' and t.table_name = e.nome
         ) as existe
    from esperado e
),

funcoes as (
  select unnest(array[
    'criar_organizacao', 'orgs_do_usuario', 'recalcular_saldo_estoque',
    'recalcular_status_etiqueta', 'touch_updated_at'
  ]) as nome
)

select 'Tabelas' as item,
       count(*) filter (where existe) || ' de ' || count(*) as resultado,
       case when count(*) = count(*) filter (where existe)
            then 'ok'
            else 'FALTANDO: ' || string_agg(nome, ', ') filter (where not existe)
       end as situacao
  from tabelas

union all
select 'Funções',
       count(*) filter (where achou) || ' de ' || count(*),
       case when count(*) = count(*) filter (where achou)
            then 'ok'
            else 'FALTANDO: ' || string_agg(nome, ', ') filter (where not achou)
       end
  from (
    select f.nome,
           exists (
             select 1 from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = f.nome
           ) as achou
      from funcoes f
  ) s

union all
-- Sem RLS, um restaurante enxergaria os dados do outro. É a checagem que mais
-- importa das que dão para fazer sem inserir nada.
select 'RLS ligado',
       count(*) filter (where c.relrowsecurity) || ' de ' || count(*),
       case when count(*) = count(*) filter (where c.relrowsecurity)
            then 'ok'
            else 'FALTANDO em: ' || string_agg(c.relname, ', ')
                   filter (where not c.relrowsecurity)
       end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (select nome from esperado)
   and c.relname <> 'organizations'

union all
select 'Políticas de acesso',
       count(*)::text,
       case when count(*) >= 15 then 'ok' else 'poucas — confira a 0002' end
  from pg_policies where schemaname = 'public'

union all
-- O saldo do estoque é derivado por gatilho. Sem ele, o saldo fica sempre zero
-- e nada avisa.
select 'Gatilho do saldo de estoque',
       count(*)::text,
       case when count(*) >= 1 then 'ok' else 'FALTANDO — reveja a 0004' end
  from pg_trigger
 where tgname = 'stock_movements_recalcula_saldo'

union all
select 'Livro-razão imutável (sem UPDATE/DELETE)',
       case when has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE')
              or has_table_privilege('authenticated', 'public.stock_movements', 'DELETE')
            then 'editável' else 'somente inserção' end,
       case when has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE')
              or has_table_privilege('authenticated', 'public.stock_movements', 'DELETE')
            then 'FALTANDO o revoke da 0004' else 'ok' end

union all
-- A etiqueta de inventário serve para contagem e não pode ter validade: é o
-- que garante que ela não conflita com a etiqueta de validade.
select 'Etiqueta de inventário sem validade',
       count(*)::text || ' coluna(s) de data encontrada(s)',
       case when count(*) = 0 then 'ok' else 'INESPERADO — não deveria haver' end
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'inventory_tags'
   and column_name in ('expires_at', 'validade', 'opened_at');
