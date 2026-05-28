-- Required product gating on content tables
ALTER TABLE public.ebooks  ADD COLUMN IF NOT EXISTS required_product_id uuid;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS required_product_id uuid;

CREATE INDEX IF NOT EXISTS idx_ebooks_required_product  ON public.ebooks(required_product_id);
CREATE INDEX IF NOT EXISTS idx_courses_required_product ON public.courses(required_product_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user_status ON public.entitlements(user_id, status);

-- Security-definer: check active entitlement for current user (admins bypass)
CREATE OR REPLACE FUNCTION public.has_entitlement(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _product_id IS NULL
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = auth.uid()
        AND e.product_id = _product_id
        AND e.status = 'active'
    );
$$;

-- Admin helper: manually grant entitlement to a user by email
CREATE OR REPLACE FUNCTION public.grant_entitlement_manual(_email text, _product_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_ent_id  uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found:%', _email;
  END IF;

  INSERT INTO public.entitlements (user_id, product_id, source, status, buyer_email, granted_at, metadata)
  VALUES (v_user_id, _product_id, 'manual', 'active', _email, now(), jsonb_build_object('granted_by', auth.uid()))
  RETURNING id INTO v_ent_id;

  RETURN v_ent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_entitlement_manual(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid) TO authenticated;