-- =============================================================================
-- Migration 0003 — agendamento diário do aviso de validade
-- =============================================================================
-- Agenda a Edge Function `check-expiries`. Rode esta migration DEPOIS de
-- publicar a função, e troque os dois valores marcados abaixo.
--
-- Por que o agendamento vive aqui, e não no navegador: um service worker não
-- acorda sozinho num horário. `setTimeout` morre quando a aba fecha, e a
-- Periodic Background Sync API não existe no iOS. Push disparado pelo servidor
-- é a única forma confiável de alcançar a cozinha antes do turno começar.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda a URL e a chave do projeto fora do corpo do agendamento, para que
-- trocá-las não exija reescrever o cron.
create table if not exists public.configuracao_interna (
  chave  text primary key,
  valor  text not null
);

alter table public.configuracao_interna enable row level security;
-- Sem policy alguma: só service_role e superusuário leem. A chave guardada
-- aqui ignora o RLS das outras tabelas, então ela não pode ficar ao alcance
-- do app.

-- >>> TROQUE OS DOIS VALORES ABAIXO <<<
insert into public.configuracao_interna (chave, valor) values
  ('url_funcao',  'https://SEU-PROJETO.supabase.co/functions/v1/check-expiries'),
  ('service_key', 'COLE_AQUI_A_SERVICE_ROLE_KEY')
on conflict (chave) do update set valor = excluded.valor;

-- Remove um agendamento anterior, tornando a migration repetível.
select cron.unschedule('avisos-de-validade')
 where exists (select 1 from cron.job where jobname = 'avisos-de-validade');

-- 11:00 UTC = 08:00 no horário de Brasília (UTC-3).
--
-- O cron dispara uma vez por dia para TODAS as organizações, e a função decide
-- o que enviar a cada uma. Respeitar o horário escolhido por restaurante exigiria
-- rodar de hora em hora; como hoje há um restaurante, um disparo diário basta —
-- para vários fusos, troque para '0 * * * *' e filtre por `alerta_horario`
-- dentro da função.
select cron.schedule(
  'avisos-de-validade',
  '0 11 * * *',
  $$
  select net.http_post(
    url := (select valor from public.configuracao_interna where chave = 'url_funcao'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (select valor from public.configuracao_interna where chave = 'service_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
