-- Migration: Schema changes durante hardening (idempotente)

-- leads.updated_at: necessário para trigger trg_leads_updated / set_updated_at()
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ebooks.description: copy persuasiva para modal de oferta
ALTER TABLE public.ebooks ADD COLUMN IF NOT EXISTS description text;
