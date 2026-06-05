-- Migration: pg_cron extension + retention jobs (idempotente)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Guard: só agenda se o job não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-webhook-logs') THEN
    PERFORM cron.schedule(
      'cleanup-webhook-logs',
      '0 3 * * *',
      $$DELETE FROM public.webhook_logs WHERE created_at < now() - interval '90 days'$$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-tracking-sessions') THEN
    PERFORM cron.schedule(
      'cleanup-tracking-sessions',
      '0 3 * * *',
      $$DELETE FROM public.tracking_sessions WHERE created_at < now() - interval '30 days'$$
    );
  END IF;
END;
$$;
