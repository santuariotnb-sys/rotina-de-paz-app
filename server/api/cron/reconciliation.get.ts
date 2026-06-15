import { defineHandler } from "nitro";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Divergence = { sale_id: string; email: string | null; issues: string[] };

export default defineHandler(async (event) => {
  // Auth: Vercel Cron envia Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = event.request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const sb = getAdmin();
  const hoursBack = 24;
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data: sales, error: salesErr } = await (sb as any)
    .from("webhook_logs")
    .select("payload")
    .eq("source", "kirvano")
    .eq("event_type", "SALE_APPROVED")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (salesErr) throw new Error(`webhook_logs: ${salesErr.message}`);

  const rows = (sales ?? []) as { payload: any }[];
  const divergences: Divergence[] = [];
  let withUtm = 0, withTracking = 0, withFbc = 0, withFbp = 0, purchaseMatch = 0;

  for (const row of rows) {
    const p = row.payload;
    const saleId: string | null = p?.sale_id ?? null;
    const email: string | null = p?.customer?.email ?? null;
    const utm = p?.utm as Record<string, string> | undefined;
    const src: string | null = utm?.src ?? p?.src ?? null;
    const issues: string[] = [];

    if (!saleId) {
      divergences.push({ sale_id: "UNKNOWN", email, issues: ["sale_id ausente"] });
      continue;
    }

    // UTM no payload
    const utmFields = ["utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"];
    const missingUtm = utmFields.filter((f) => !utm?.[f]);
    if (missingUtm.length === 0) withUtm++;
    else issues.push(`UTM incompleta: faltam ${missingUtm.join(", ")}`);

    // Purchase no banco
    const { data: purchases } = await (sb as any)
      .from("purchases")
      .select("transaction_id, utm_source, utm_campaign, utm_medium, utm_content, utm_term")
      .like("transaction_id", `${saleId}_%`);

    if (purchases?.length > 0) {
      purchaseMatch++;
      const px = purchases[0];
      const missingDb = utmFields.filter((f) => !px[f]);
      if (missingDb.length > 0) issues.push(`UTM no banco: faltam ${missingDb.join(", ")}`);
    } else {
      issues.push("Purchase NÃO encontrado no banco");
    }

    // tracking_session (join)
    if (src) {
      const { data: ts } = await (sb as any)
        .from("tracking_sessions")
        .select("fbp, fbc")
        .eq("external_id", src)
        .maybeSingle();

      if (ts) {
        withTracking++;
        if (ts.fbc) withFbc++; else issues.push("sem fbc");
        if (ts.fbp) withFbp++; else issues.push("sem fbp");
      } else {
        issues.push(`tracking_session ausente (src=${src})`);
      }
    } else {
      issues.push("sem external_id — join impossível");
    }

    // cookies.fbclid fallback
    if (!p?.cookies?.fbclid && !src) {
      issues.push("sem cookies.fbclid E sem src — CAPI sem fbc");
    }

    if (issues.length > 0) divergences.push({ sale_id: saleId, email, issues });
  }

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
      purchase_rate: rows.length ? Math.round((purchaseMatch / rows.length) * 100) : 0,
    },
  };

  await (sb as any).from("reconciliation_reports").insert(report);

  return { ok: true, report };
});
