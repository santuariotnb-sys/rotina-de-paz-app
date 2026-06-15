import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Job de reconciliação: compara webhook_logs (Kirvano) ↔ purchases ↔ tracking_sessions.
 * Para cada venda SALE_APPROVED, verifica:
 *   - Purchase existe no banco com UTM completa
 *   - tracking_session existe (join por external_id = utm.src)
 *   - fbc/fbp disponíveis para o CAPI
 * Grava divergências em reconciliation_reports.
 */

type Divergence = {
  sale_id: string;
  email: string | null;
  issues: string[];
};

export async function runReconciliation(opts?: {
  hoursBack?: number;
}): Promise<{
  total_sales: number;
  with_utm: number;
  with_tracking: number;
  with_fbc: number;
  with_fbp: number;
  purchase_match: number;
  divergences: Divergence[];
}> {
  const hoursBack = opts?.hoursBack ?? 24;
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  // 1. Buscar todas as vendas aprovadas no período
  const { data: sales, error: salesErr } = await (supabaseAdmin as any)
    .from("webhook_logs")
    .select("payload")
    .eq("source", "kirvano")
    .eq("event_type", "SALE_APPROVED")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (salesErr) throw new Error(`Erro ao buscar webhook_logs: ${salesErr.message}`);

  const rows = (sales ?? []) as { payload: any }[];
  const divergences: Divergence[] = [];
  let withUtm = 0;
  let withTracking = 0;
  let withFbc = 0;
  let withFbp = 0;
  let purchaseMatch = 0;

  for (const row of rows) {
    const p = row.payload;
    const saleId: string | null = p?.sale_id ?? null;
    const email: string | null = p?.customer?.email ?? null;
    const utm = p?.utm as Record<string, string> | undefined;
    const src: string | null = utm?.src ?? p?.src ?? null;
    const issues: string[] = [];

    if (!saleId) {
      issues.push("sale_id ausente no payload");
      divergences.push({ sale_id: "UNKNOWN", email, issues });
      continue;
    }

    // 2. Verificar UTM no payload
    const utmFields = ["utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"];
    const missingUtm = utmFields.filter((f) => !utm?.[f]);
    if (missingUtm.length === 0) {
      withUtm++;
    } else {
      issues.push(`UTM incompleta no webhook: faltam ${missingUtm.join(", ")}`);
    }

    // 3. Verificar purchase no banco
    const { data: purchases } = await (supabaseAdmin as any)
      .from("purchases")
      .select("transaction_id, utm_source, utm_campaign, utm_medium, utm_content, utm_term")
      .like("transaction_id", `${saleId}_%`);

    if (purchases && purchases.length > 0) {
      purchaseMatch++;
      const px = purchases[0];
      const missingDb = utmFields.filter((f) => !px[f]);
      if (missingDb.length > 0) {
        issues.push(`UTM incompleta no banco: faltam ${missingDb.join(", ")}`);
      }
    } else {
      issues.push("Purchase NÃO encontrado no banco");
    }

    // 4. Verificar tracking_session (join)
    if (src) {
      const { data: ts } = await (supabaseAdmin as any)
        .from("tracking_sessions")
        .select("fbp, fbc, fbclid, user_agent")
        .eq("external_id", src)
        .maybeSingle();

      if (ts) {
        withTracking++;
        if (ts.fbc) withFbc++;
        else issues.push("tracking_session sem fbc");
        if (ts.fbp) withFbp++;
        else issues.push("tracking_session sem fbp");
      } else {
        issues.push(`tracking_session NÃO encontrada (src=${src})`);
      }
    } else {
      issues.push("sem external_id (utm.src) — join impossível");
    }

    // 5. Verificar cookies.fbclid no payload (fallback CAPI)
    const cookieFbclid = p?.cookies?.fbclid;
    if (!cookieFbclid && !src) {
      issues.push("sem cookies.fbclid E sem src — CAPI não terá fbc");
    }

    if (issues.length > 0) {
      divergences.push({ sale_id: saleId, email, issues });
    }
  }

  // 6. Gravar relatório
  const report = {
    period_start: since,
    period_end: new Date().toISOString(),
    total_sales: rows.length,
    with_utm: withUtm,
    with_tracking: withTracking,
    with_fbc: withFbc,
    with_fbp: withFbp,
    purchase_match: purchaseMatch,
    divergences,
    summary: {
      utm_rate: rows.length ? Math.round((withUtm / rows.length) * 100) : 0,
      tracking_rate: rows.length ? Math.round((withTracking / rows.length) * 100) : 0,
      fbc_rate: rows.length ? Math.round((withFbc / rows.length) * 100) : 0,
      fbp_rate: rows.length ? Math.round((withFbp / rows.length) * 100) : 0,
      purchase_rate: rows.length ? Math.round((purchaseMatch / rows.length) * 100) : 0,
    },
  };

  await (supabaseAdmin as any).from("reconciliation_reports").insert(report);

  return report;
}
