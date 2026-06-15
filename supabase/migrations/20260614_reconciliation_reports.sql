-- ═══════════════════════════════════════════════════════════════════════════
-- Tabela de relatórios de reconciliação (tracking health)
-- Data: 2026-06-14
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reconciliation_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  total_sales   integer NOT NULL DEFAULT 0,
  with_utm      integer NOT NULL DEFAULT 0,
  with_tracking integer NOT NULL DEFAULT 0,
  with_fbc      integer NOT NULL DEFAULT 0,
  with_fbp      integer NOT NULL DEFAULT 0,
  purchase_match integer NOT NULL DEFAULT 0,
  divergences   jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Só service_role acessa (admin)
ALTER TABLE public.reconciliation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reconciliation_reports FROM public, anon, authenticated;
GRANT ALL ON public.reconciliation_reports TO service_role;
