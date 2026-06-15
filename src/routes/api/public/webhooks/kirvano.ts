import { createFileRoute } from "@tanstack/react-router";
import { ipAddress } from "@vercel/functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { timingSafeEqual } from "node:crypto";
import {
  processKirvanoPayload,
  verifyKirvanoSignature,
} from "@/lib/admin/kirvano.server";

// Headers candidatos onde a Kirvano pode enviar a assinatura/token.
const SIGNATURE_HEADERS = [
  "x-kirvano-signature",
  "x-signature",
  "x-hub-signature-256",
  "x-webhook-signature",
  "authorization",
  "token",
  "x-token",
  "x-webhook-token",
  "x-api-key",
];

function readSignature(request: Request): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const v = request.headers.get(h);
    if (v) return v.startsWith("Bearer ") ? v.slice(7) : v;
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
}): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from("webhook_logs").insert({
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
    }).select("id").single();
    return data?.id ?? null;
  } catch (e) {
    console.error("[kirvano-webhook] falha ao gravar webhook_logs", e);
    return null;
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

        // 0. Secret na URL (?k=) — autenticação que a Kirvano NÃO envia via header/body.
        //    Setup-safe: só valida se KIRVANO_URL_SECRET estiver configurado (não quebra durante o setup).
        //    Com o env setado + a URL do webhook na Kirvano contendo ?k=<secret>, impede webhook forjado
        //    por quem apenas descobriu a URL. Comparação constant-time.
        const urlSecret = process.env.KIRVANO_URL_SECRET;
        if (urlSecret) {
          const provided = Buffer.from(new URL(request.url).searchParams.get("k") ?? "");
          const expected = Buffer.from(urlSecret);
          if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

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

        // 3. Validar assinatura (se presente). Kirvano não envia headers de auth —
        //    quando nenhuma assinatura é encontrada, processar mesmo assim.
        //    Proteção: endpoint é URL não-adivinhável + rate limit em falhas com sig inválida.
        const valid = verifyKirvanoSignature(rawBody, signature, secret);

        if (valid || !signature) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            await logEvent({ rawBody, payload: null, signature, signatureValid: valid, eventType: null, processed: false, error: "JSON inválido", requestIp });
            return new Response("Invalid JSON", { status: 400 });
          }

          const eventType = (parsed.event as string | undefined) ?? (parsed.type as string | undefined) ?? null;

          // Inserir log ANTES de processar → pegar id para vincular capi_status
          const logId = await logEvent({ rawBody, payload: parsed, signature, signatureValid: valid, eventType, processed: false, error: null, requestIp });

          try {
            const result = await processKirvanoPayload(parsed, logId);
            // Atualizar log com resultado do processamento + capi_status
            if (logId) {
              await supabaseAdmin.from("webhook_logs").update({
                processed: result.matched,
                processed_at: result.matched ? new Date().toISOString() : null,
                error: result.matched ? null : (result.note ?? "Não processado"),
                capi_status: result.capiStatus ?? null,
                capi_error: result.capiError ?? null,
                capi_retries: result.capiStatus ? 1 : 0,
                capi_last_attempt: result.capiStatus ? new Date().toISOString() : null,
              } as any).eq("id", logId);
            }
            return Response.json({ ok: true, result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (logId) {
              await supabaseAdmin.from("webhook_logs").update({
                processed: false,
                error: msg,
              } as any).eq("id", logId);
            }
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
