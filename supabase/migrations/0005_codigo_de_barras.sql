-- =============================================================================
-- 0005 — Código de barras do produto
-- =============================================================================
-- Guardar o EAN da embalagem do fabricante é o que deixa bipar um saco de
-- farinha na prateleira e cair direto no produto, sem procurar na lista com a
-- mão ocupada.
--
-- É seguro rodar mais de uma vez.
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
