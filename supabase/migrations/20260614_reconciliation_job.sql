-- ═══════════════════════════════════════════════════════════════════════════
-- Função + pg_cron job de reconciliação diária
-- Compara webhook_logs ↔ purchases ↔ tracking_sessions
-- Grava divergências em reconciliation_reports
-- Data: 2026-06-14
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_reconciliation(p_hours_back integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since timestamptz := now() - (p_hours_back || ' hours')::interval;
  v_total integer := 0;
  v_with_utm integer := 0;
  v_with_tracking integer := 0;
  v_with_fbc integer := 0;
  v_with_fbp integer := 0;
  v_purchase_match integer := 0;
  v_divergences jsonb := '[]'::jsonb;
  v_sale record;
  v_issues text[];
  v_sale_id text;
  v_email text;
  v_src text;
  v_purchase record;
  v_ts record;
  v_report_id uuid;
BEGIN
  FOR v_sale IN
    SELECT payload
    FROM webhook_logs
    WHERE source = 'kirvano'
      AND event_type = 'SALE_APPROVED'
      AND created_at >= v_since
    ORDER BY created_at DESC
  LOOP
    v_total := v_total + 1;
    v_issues := '{}';
    v_sale_id := v_sale.payload->>'sale_id';
    v_email := v_sale.payload->'customer'->>'email';
    v_src := COALESCE(v_sale.payload->'utm'->>'src', v_sale.payload->>'src');

    IF v_sale_id IS NULL THEN
      v_divergences := v_divergences || jsonb_build_object(
        'sale_id', 'UNKNOWN', 'email', v_email, 'issues', ARRAY['sale_id ausente']
      );
      CONTINUE;
    END IF;

    -- UTM no payload
    IF v_sale.payload->'utm'->>'utm_source' IS NOT NULL
       AND v_sale.payload->'utm'->>'utm_campaign' IS NOT NULL
       AND v_sale.payload->'utm'->>'utm_medium' IS NOT NULL
       AND v_sale.payload->'utm'->>'utm_content' IS NOT NULL
       AND v_sale.payload->'utm'->>'utm_term' IS NOT NULL
    THEN
      v_with_utm := v_with_utm + 1;
    ELSE
      v_issues := array_append(v_issues, 'UTM incompleta no webhook');
    END IF;

    -- Purchase no banco
    SELECT utm_source, utm_campaign, utm_medium, utm_content, utm_term
    INTO v_purchase
    FROM purchases
    WHERE transaction_id LIKE v_sale_id || '_%'
    LIMIT 1;

    IF FOUND THEN
      v_purchase_match := v_purchase_match + 1;
      IF v_purchase.utm_source IS NULL OR v_purchase.utm_campaign IS NULL
         OR v_purchase.utm_medium IS NULL OR v_purchase.utm_content IS NULL
         OR v_purchase.utm_term IS NULL
      THEN
        v_issues := array_append(v_issues, 'UTM incompleta no banco');
      END IF;
    ELSE
      v_issues := array_append(v_issues, 'Purchase NÃO encontrado no banco');
    END IF;

    -- tracking_session
    IF v_src IS NOT NULL THEN
      SELECT fbc, fbp INTO v_ts
      FROM tracking_sessions
      WHERE external_id = v_src
      LIMIT 1;

      IF FOUND THEN
        v_with_tracking := v_with_tracking + 1;
        IF v_ts.fbc IS NOT NULL THEN v_with_fbc := v_with_fbc + 1;
        ELSE v_issues := array_append(v_issues, 'sem fbc'); END IF;
        IF v_ts.fbp IS NOT NULL THEN v_with_fbp := v_with_fbp + 1;
        ELSE v_issues := array_append(v_issues, 'sem fbp'); END IF;
      ELSE
        v_issues := array_append(v_issues, 'tracking_session ausente (src=' || v_src || ')');
      END IF;
    ELSE
      v_issues := array_append(v_issues, 'sem external_id — join impossível');
    END IF;

    -- Registrar divergências
    IF array_length(v_issues, 1) > 0 THEN
      v_divergences := v_divergences || jsonb_build_object(
        'sale_id', v_sale_id,
        'email', v_email,
        'issues', to_jsonb(v_issues)
      );
    END IF;
  END LOOP;

  -- Gravar relatório
  INSERT INTO reconciliation_reports (
    period_start, period_end, total_sales,
    with_utm, with_tracking, with_fbc, with_fbp, purchase_match,
    divergences, summary
  ) VALUES (
    v_since, now(), v_total,
    v_with_utm, v_with_tracking, v_with_fbc, v_with_fbp, v_purchase_match,
    v_divergences,
    jsonb_build_object(
      'utm_rate', CASE WHEN v_total > 0 THEN round(v_with_utm::numeric / v_total * 100) ELSE 0 END,
      'tracking_rate', CASE WHEN v_total > 0 THEN round(v_with_tracking::numeric / v_total * 100) ELSE 0 END,
      'fbc_rate', CASE WHEN v_total > 0 THEN round(v_with_fbc::numeric / v_total * 100) ELSE 0 END,
      'purchase_rate', CASE WHEN v_total > 0 THEN round(v_purchase_match::numeric / v_total * 100) ELSE 0 END
    )
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'total_sales', v_total,
    'with_utm', v_with_utm,
    'with_tracking', v_with_tracking,
    'with_fbc', v_with_fbc,
    'purchase_match', v_purchase_match,
    'divergences_count', jsonb_array_length(v_divergences)
  );
END;
$$;

-- Só service_role pode executar
REVOKE ALL ON FUNCTION public.run_reconciliation FROM public, anon, authenticated;

-- Agendar via pg_cron: diariamente às 09:00 UTC
DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-reconciliation') THEN
    PERFORM cron.schedule(
      'daily-reconciliation',
      '0 9 * * *',
      $cron$SELECT public.run_reconciliation(24)$cron$
    );
  END IF;
END;
$outer$;
