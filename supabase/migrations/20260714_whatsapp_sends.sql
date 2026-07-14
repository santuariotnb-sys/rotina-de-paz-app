-- Fila de envios de WhatsApp (resultado/conversao + futuro follow-up/CRM).
create table if not exists public.whatsapp_sends (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id),
  template    text not null,
  status      text not null default 'pending',  -- pending | sent | failed | skipped
  send_after  timestamptz not null default now(),
  variables   jsonb,
  wa_message_id text,
  error       text,
  attempts    int not null default 0,
  quiz_id     text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (lead_id, template)  -- idempotencia: 1 resultado por lead
);

-- indice para o cron pegar so as linhas vencidas e pendentes
create index if not exists idx_whatsapp_sends_due
  on public.whatsapp_sends (send_after)
  where status = 'pending';

alter table public.whatsapp_sends enable row level security;
revoke all on public.whatsapp_sends from public, anon;
-- sem policy = so service role (backend) acessa. Conforme padrao do repo.

comment on table public.whatsapp_sends is
  'Fila de envios WhatsApp Cloud API. Escrita/leitura so pelo backend (service role).';
