-- Migration: RPCs SECURITY DEFINER criadas durante hardening
-- Materializa o que já existe em produção (idempotente)

-- ═══ RPC: get_user_id_by_email ═══
-- Usada por kirvano.server.ts como fallback para encontrar user por email
-- (substitui listUsers com limite de 200)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

-- ═══ RPC: persist_lead ═══
-- Quiz insere lead via RPC (anon não precisa INSERT direto na tabela)
CREATE OR REPLACE FUNCTION public.persist_lead(
  p_name text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_scores jsonb DEFAULT NULL,
  p_desire text DEFAULT NULL,
  p_situation text DEFAULT NULL,
  p_risk_flag boolean DEFAULT false,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO leads (
    name, archetype, scores, desire, situation, risk_flag,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) VALUES (
    p_name, p_archetype, p_scores, p_desire, p_situation, p_risk_flag,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_lead FROM public;
GRANT EXECUTE ON FUNCTION public.persist_lead TO anon, authenticated;

-- ═══ RPC: save_lead_email ═══
-- Quiz salva email do lead; protege contra overwrite (email IS NULL)
CREATE OR REPLACE FUNCTION public.save_lead_email(p_lead_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  UPDATE leads SET email = p_email WHERE id = p_lead_id AND email IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.save_lead_email FROM public;
GRANT EXECUTE ON FUNCTION public.save_lead_email TO anon, authenticated;

-- ═══ RPC: persist_quiz_responses ═══
-- Quiz insere respostas em batch via jsonb array
CREATE OR REPLACE FUNCTION public.persist_quiz_responses(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO quiz_responses (lead_id, question_key, answer_value, answer_text, time_to_answer)
  SELECT
    (r->>'lead_id')::uuid,
    r->>'question_key',
    r->>'answer_value',
    r->>'answer_text',
    (r->>'time_to_answer')::int
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_quiz_responses FROM public;
GRANT EXECUTE ON FUNCTION public.persist_quiz_responses TO anon, authenticated;

-- ═══ RPC: upsert_tracking_session ═══
-- Quiz salva tracking session (fbp/fbc) via upsert
CREATE OR REPLACE FUNCTION public.upsert_tracking_session(
  p_external_id text,
  p_fbp text DEFAULT NULL,
  p_fbc text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO tracking_sessions (external_id, fbp, fbc, fbclid, user_agent)
  VALUES (p_external_id, p_fbp, p_fbc, p_fbclid, p_user_agent)
  ON CONFLICT (external_id) DO UPDATE SET
    fbp = COALESCE(EXCLUDED.fbp, tracking_sessions.fbp),
    fbc = COALESCE(EXCLUDED.fbc, tracking_sessions.fbc),
    fbclid = COALESCE(EXCLUDED.fbclid, tracking_sessions.fbclid),
    user_agent = COALESCE(EXCLUDED.user_agent, tracking_sessions.user_agent);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_tracking_session FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_tracking_session TO anon, authenticated;
