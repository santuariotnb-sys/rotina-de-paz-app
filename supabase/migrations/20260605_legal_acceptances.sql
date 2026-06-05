-- Migration: legal_acceptances table for consent tracking
-- Records user acceptance of Terms of Use, Privacy Policy, and Responsibility Disclaimer

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  responsibility_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user
  ON public.legal_acceptances(user_id, accepted_at DESC);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- SELECT: user reads own acceptances; admin reads all
CREATE POLICY "legal_select_own" ON public.legal_acceptances
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies for client roles.
-- Writes go through supabaseAdmin (service_role) in the server function.
