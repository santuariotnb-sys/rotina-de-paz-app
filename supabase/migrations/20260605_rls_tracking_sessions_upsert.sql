-- Migration: allow anon UPSERT on tracking_sessions
-- Problem: Quiz-sacra does sb.from("tracking_sessions").upsert(..., { onConflict: "external_id" })
-- which requires BOTH INSERT and UPDATE policies for anon.
-- INSERT policy existed but UPDATE was missing, causing silent failure on conflict.
-- Rollback: DROP POLICY IF EXISTS "anon_update_tracking_sessions" ON public.tracking_sessions;

CREATE POLICY "anon_update_tracking_sessions" ON public.tracking_sessions
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
