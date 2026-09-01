-- =============================================================================
-- 0006 — Mensagem do pedido em duas partes
-- =============================================================================
-- A mensagem era um modelo único com `{{fornecedor}}` e `{{itens}}` dentro. Os
-- marcadores eram texto comum, então dava para digitar por cima, apagar metade
-- ou o ditado por voz trocar a palavra — e foi o que aconteceu numa cozinha de
-- verdade: `{{itens}}` virou `{{hamach}}`, e o pedido passou a sair sem produto
-- nenhum, sem nada avisar.
--
-- Agora são duas partes livres e a lista entra sempre entre elas. Não há
-- marcador para corromper.
--
-- `mensagem_pedido` fica onde está, sem ser lida pelo app novo: o cliente migra
-- o texto antigo na primeira abertura, e apagar a coluna agora deixaria sem
-- saída quem ainda não abriu o app atualizado.
--
-- É seguro rodar mais de uma vez.
-- =============================================================================

alter table public.org_settings
  add column if not exists pedido_abertura text,
  add column if not exists pedido_fecho    text;
