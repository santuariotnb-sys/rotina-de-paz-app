-- CAPI retry: flag de status no webhook_logs + função de reprocessamento
-- capi_status: NULL (sem CAPI) | 'sent' | 'failed' | 'skipped'
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS capi_status text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS capi_error text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS capi_retries integer NOT NULL DEFAULT 0;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS capi_last_attempt timestamptz;

COMMENT ON COLUMN public.webhook_logs.capi_status IS 'Status do envio CAPI: NULL=sem CAPI, sent=OK, failed=falhou, skipped=sem credentials';
COMMENT ON COLUMN public.webhook_logs.capi_retries IS 'Quantidade de tentativas de envio CAPI (inclui a primeira)';

-- Índice para o cron de retry encontrar failed rapidamente
CREATE INDEX IF NOT EXISTS idx_webhook_logs_capi_failed
  ON public.webhook_logs (capi_status)
  WHERE capi_status = 'failed';
