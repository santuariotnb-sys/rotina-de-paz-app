-- ============================================================
-- SUPPORT SYSTEM — Complete missing RLS policies + grants
-- ============================================================
-- Adds admin DELETE/UPDATE on support_messages
-- Adds admin DELETE grant on support_tickets (policy exists but grant was missing)

-- 1. support_messages: admin DELETE policy
CREATE POLICY "admins delete messages" ON public.support_messages
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 2. support_messages: admin UPDATE policy
CREATE POLICY "admins update messages" ON public.support_messages
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- 3. support_messages: grant DELETE + UPDATE to authenticated (required for RLS)
GRANT DELETE ON public.support_messages TO authenticated;
GRANT UPDATE ON public.support_messages TO authenticated;

-- 4. support_tickets: grant DELETE to authenticated (admin ALL policy exists but grant was missing)
GRANT DELETE ON public.support_tickets TO authenticated;
