-- Graventum Inbox — thread canonica de WhatsApp para o provider Gupshup (API oficial).
-- A Evolution guarda o historico dela; o Gupshup nao expoe findChats/findMessages,
-- entao persistimos inbound + outbound + status aqui e o Inbox le desta tabela.
-- Rodar no SQL editor do Supabase (projeto ckjiixentlgitwqoquzm) ou via psql.

create table if not exists public.wa_messages (
  id             uuid primary key default gen_random_uuid(),
  contact_phone  text not null,                         -- E.164 sem '+', ex: 5541985216023
  direction      text not null check (direction in ('inbound','outbound')),
  body           text,
  media_url      text,
  media_type     text,                                  -- image|video|audio|file|sticker
  wa_message_id  text,                                  -- gsId/messageId do Gupshup (correlaciona status)
  status         text default 'queued'                  -- queued|sent|delivered|read|failed
                 check (status in ('queued','sent','delivered','read','failed')),
  provider       text not null default 'gupshup',
  wa_timestamp   timestamptz not null default now(),    -- ordenacao autoritativa (evento Gupshup)
  created_at     timestamptz not null default now(),
  raw            jsonb
);

-- Ordenacao da thread e listagem de conversas
create index if not exists wa_messages_phone_ts_idx
  on public.wa_messages (contact_phone, wa_timestamp desc);

-- Dedup de webhook duplicado + update de status por messageId.
-- Indice unico SIMPLES (nao parcial) para servir de arbitro no upsert onConflict do
-- PostgREST. Postgres trata NULLs como distintos, entao outbound sem messageId nao colide.
create unique index if not exists wa_messages_message_id_uidx
  on public.wa_messages (wa_message_id);

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Adiciona a tabela a publication do Supabase Realtime (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.wa_messages';
  end if;
end $$;

-- ─── RLS (LGPD: privado por padrao) ─────────────────────────────────────────
-- Com RLS ligado e sem policy permissiva, o role anon NAO le nada.
-- O app acessa via SUPABASE_SERVICE_ROLE_KEY (bypassa RLS) nas rotas server.
alter table public.wa_messages enable row level security;

-- OPCIONAL — habilitar Realtime no browser com anon key:
-- so descomente se aceitar expor as mensagens ao anon key (avaliar LGPD).
-- create policy wa_messages_anon_select on public.wa_messages
--   for select to anon using (true);

-- ─── Colunas auxiliares em inbox_contacts (idempotente) ─────────────────────
alter table public.inbox_contacts add column if not exists last_inbound_at timestamptz;
alter table public.inbox_contacts add column if not exists opted_out boolean not null default false;
alter table public.inbox_contacts add column if not exists opted_out_at timestamptz;

