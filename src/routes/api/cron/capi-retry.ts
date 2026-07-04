import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMetaCapiPurchase } from "@/lib/admin/meta-capi.server";

/**
 * Cron: reprocessa CAPI Purchase para webhook_logs com capi_status='failed'.
 *
 * Seguro: event_id = sale_id → Meta deduplica nossos próprios reenvios.
 * Executa a cada hora. Máximo 10 por execução para não estourar o timeout.
 *
 * Vercel cron envia GET. Protegido por CRON_SECRET.
 */

const MAX_RETRIES_PER_RUN = 10;
const MAX_CAPI_ATTEMPTS = 5;

function extractTransactionId(payload: Record<string, unknown>): string | null {
  for (const path of [
    "data.id",
    "data.transaction_id",
    "data.sale_id",
    "sale_id",
    "id",
    "transaction_id",
  ]) {
    const parts = path.split(".");
    let cur: unknown = payload;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur != null && cur !== "") return String(cur);
  }
  return null;
}

export const Route = createFileRoute("/api/cron/capi-retry")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Proteger contra chamadas externas — fail-closed: sem secret configurado,
        // o endpoint NÃO responde (evita cron público se CRON_SECRET for removido).
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[capi-retry] CRITICAL: CRON_SECRET ausente — endpoint bloqueado");
          return new Response("Cron secret not configured", { status: 503 });
        }
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Buscar failed com menos de MAX_CAPI_ATTEMPTS tentativas
        const { data: logs, error } = await (supabaseAdmin as any)
          .from("webhook_logs")
          .select("id, payload, capi_retries")
          .eq("capi_status", "failed")
          .lt("capi_retries", MAX_CAPI_ATTEMPTS)
          .order("created_at", { ascending: true })
          .limit(MAX_RETRIES_PER_RUN);

        if (error) {
          console.error("[capi-retry] falha ao buscar logs:", error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        if (!logs || logs.length === 0) {
          return Response.json({ ok: true, retried: 0, message: "Nenhum CAPI failed pendente" });
        }

        let sent = 0;
        let failed = 0;

        for (const log of logs) {
          const payload = log.payload as Record<string, unknown>;
          const txId = extractTransactionId(payload);
          const retries = (log.capi_retries ?? 0) + 1;

          if (!txId) {
            // Sem transaction_id → não tem como enviar CAPI (sem event_id)
            await (supabaseAdmin as any)
              .from("webhook_logs")
              .update({
                capi_status: "skipped",
                capi_error: "missing_transaction_id",
                capi_retries: retries,
                capi_last_attempt: new Date().toISOString(),
              })
              .eq("id", log.id);
            continue;
          }

          // Recuperar nomes dos produtos para o CAPI
          const root = (payload.data ?? payload) as Record<string, unknown>;
          const products = (root.products ?? root.items ?? []) as unknown[];
          const productNames = Array.isArray(products)
            ? products
                .map((p: any) => p?.name ?? p?.product_name ?? "Rotina de Paz")
                .filter(Boolean)
            : ["Rotina de Paz"];

          try {
            const capi = await sendMetaCapiPurchase(payload, {
              transactionId: txId,
              productNames,
            });

            await (supabaseAdmin as any)
              .from("webhook_logs")
              .update({
                capi_status: capi.sent ? "sent" : "failed",
                capi_error: capi.sent ? null : (capi.error ?? "unknown"),
                capi_retries: retries,
                capi_last_attempt: new Date().toISOString(),
              })
              .eq("id", log.id);

            if (capi.sent) {
              sent++;
              console.log(`[capi-retry] ✓ sale ${txId} enviado (tentativa ${retries})`);
            } else {
              failed++;
              console.error(
                `[capi-retry] ✗ sale ${txId} falhou (tentativa ${retries}): ${capi.error}`,
              );
            }
          } catch (err) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            await (supabaseAdmin as any)
              .from("webhook_logs")
              .update({
                capi_status: "failed",
                capi_error: msg,
                capi_retries: retries,
                capi_last_attempt: new Date().toISOString(),
              })
              .eq("id", log.id);
            console.error(`[capi-retry] ✗ sale ${txId} erro (tentativa ${retries}):`, msg);
          }
        }

        return Response.json({
          ok: true,
          retried: logs.length,
          sent,
          failed,
          remaining_failed: failed,
        });
      },
    },
  },
});
