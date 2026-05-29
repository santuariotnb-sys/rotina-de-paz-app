-- ============================================================
-- SUPPORT SYSTEM — Tickets + Messages
-- ============================================================

-- 1. TICKETS
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('duvida', 'dificuldade', 'erro', 'reembolso')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own tickets" ON public.support_tickets;
CREATE POLICY "users read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users create own tickets" ON public.support_tickets;
CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own tickets" ON public.support_tickets;
CREATE POLICY "users update own tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins manage tickets" ON public.support_tickets;
CREATE POLICY "admins manage tickets" ON public.support_tickets
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tickets_user ON public.support_tickets (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets (status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_tickets_updated ON public.support_tickets;
CREATE TRIGGER trg_tickets_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. MESSAGES
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own ticket messages" ON public.support_messages;
CREATE POLICY "users read own ticket messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "users create messages on own tickets" ON public.support_messages;
CREATE POLICY "users create messages on own tickets" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (sender_type = 'user' AND sender_id = auth.uid()
     AND ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON public.support_messages (ticket_id, created_at);
