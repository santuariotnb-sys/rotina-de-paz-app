import { createFileRoute } from "@tanstack/react-router";
import { ipAddress } from "@vercel/functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  processKirvanoPayload,
  verifyKirvanoSignature,
} from "@/lib/admin/kirvano.server";

// Headers candidatos onde a Kirvano pode enviar a assinatura.
const SIGNATURE_HEADERS = [
  "x-kirvano-signature",
  "x-signature",
  "x-hub-signature-256",
  "x-webhook-signature",
];

function readSignature(request: Request): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const v = request.headers.get(h);
    if (v) return v;
  }
  return null;
}

async function logEvent(opts: {
  rawBody: string;
  payload: unknown;
  signature: string | null;
  signatureValid: boolean;
  eventType: string | null;
  processed: boolean;
  error?: string | null;
  requestIp: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("webhook_logs").insert({
      source: "kirvano",
      event_type: opts.eventType,
      payload: (() => {
        try {
          return JSON.parse(opts.rawBody);
        } catch {
          return { raw: opts.rawBody };
        }
      })() as never,
      signature: opts.signature,
      signature_valid: opts.signatureValid,
      processed: opts.processed,
      processed_at: opts.processed ? new Date().toISOString() : null,
      error: opts.error ?? null,
      request_ip: opts.requestIp,
    });
  } catch (e) {
    console.error("[kirvano-webhook] falha ao gravar webhook_logs", e);
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_FAILURES = 10;

async function tooManyFailures(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("webhook_logs")
    .select("*", { count: "exact", head: true })
    .eq("request_ip", ip)
    .eq("signature_valid", false)
    .gte("created_at", since);
  if (error) return false;
  return (count ?? 0) >= RATE_LIMIT_MAX_FAILURES;
}

export const Route = createFileRoute("/api/public/webhooks/kirvano")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestIp = ipAddress(request) ?? null;
        const secret = process.env.KIRVANO_WEBHOOK_SECRET;
        const rawBody = await request.text();
        const signature = readSignature(request);

        // 1. Corte barato: body gigante = lixo
        if (rawBody.length > MAX_BODY_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        // 2. Sem secret configurado — console.error + 503, SEM logEvent
        //    (gravar signature_valid=false aqui poluiria o rate limit do IP legítimo da Kirvano)
        if (!secret) {
          console.error("[kirvano-webhook] CRITICAL: KIRVANO_WEBHOOK_SECRET ausente — todos os webhooks vão falhar, confirmações de pagamento serão perdidas");
          return new Response("Webhook secret not configured", { status: 503 });
        }

        // 3. HMAC PRIMEIRO — se válido, processa direto sem rate limit
        const valid = verifyKirvanoSignature(rawBody, signature, secret);

        if (valid) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            await logEvent({ rawBody, payload: null, signature, signatureValid: true, eventType: null, processed: false, error: "JSON inválido (assinatura ok)", requestIp });
            return new Response("Invalid JSON", { status: 400 });
          }

          const eventType = (parsed.event as string | undefined) ?? (parsed.type as string | undefined) ?? null;

          try {
            const result = await processKirvanoPayload(parsed);
            await logEvent({ rawBody, payload: parsed, signature, signatureValid: true, eventType, processed: result.matched, error: result.matched ? null : (result.note ?? "Não processado"), requestIp });
            return Response.json({ ok: true, result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await logEvent({ rawBody, payload: parsed, signature, signatureValid: true, eventType, processed: false, error: msg, requestIp });
            // 500 para Kirvano retentar em erros transientes (Supabase fora, rede).
            // Idempotência do upsert em entitlements(user_id,product_id) protege contra duplicação.
            return Response.json({ ok: false, error: "processing_failed" }, { status: 500 });
          }
        }

        // 4. HMAC inválido — conta falhas ANTES de inserir (evita write amplification)
        if (await tooManyFailures(requestIp)) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) },
          });
        }

        // 5. Abaixo do limite — loga a falha e retorna 401
        let parsed: Record<string, unknown> = {};
        let eventType: string | null = null;
        try {
          parsed = JSON.parse(rawBody);
          eventType = (parsed.event as string | undefined) ?? (parsed.type as string | undefined) ?? null;
        } catch { /* payload lixo, ok */ }

        await logEvent({ rawBody, payload: parsed, signature, signatureValid: false, eventType, processed: false, error: "Assinatura inválida", requestIp });

        return new Response("Invalid signature", { status: 401 });
      },
      GET: async () =>
        new Response("Kirvano webhook endpoint. Use POST.", {
          status: 405,
          headers: { allow: "POST" },
        }),
    },
  },
});
