import { createFileRoute } from "@tanstack/react-router";
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

function ipFrom(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
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
    // Logger nunca pode quebrar o handler.
    console.error("[kirvano-webhook] falha ao gravar webhook_logs", e);
  }
}

export const Route = createFileRoute("/api/public/webhooks/kirvano")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.KIRVANO_WEBHOOK_SECRET;
        const rawBody = await request.text();
        const signature = readSignature(request);
        const requestIp = ipFrom(request);

        // Sem secret configurado: registra mas não processa.
        if (!secret) {
          await logEvent({
            rawBody,
            payload: null,
            signature,
            signatureValid: false,
            eventType: null,
            processed: false,
            error: "KIRVANO_WEBHOOK_SECRET não configurado",
            requestIp,
          });
          return new Response("Webhook secret not configured", { status: 503 });
        }

        const valid = verifyKirvanoSignature(rawBody, signature, secret);

        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          // payload inválido — registra e responde 400
          await logEvent({
            rawBody,
            payload: null,
            signature,
            signatureValid: valid,
            eventType: null,
            processed: false,
            error: "JSON inválido",
            requestIp,
          });
          return new Response("Invalid JSON", { status: 400 });
        }

        const eventType =
          (parsed.event as string | undefined) ?? (parsed.type as string | undefined) ?? null;

        if (!valid) {
          await logEvent({
            rawBody,
            payload: parsed,
            signature,
            signatureValid: false,
            eventType,
            processed: false,
            error: "Assinatura inválida",
            requestIp,
          });
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          const result = await processKirvanoPayload(parsed);
          await logEvent({
            rawBody,
            payload: parsed,
            signature,
            signatureValid: true,
            eventType,
            processed: true,
            error: result.matched ? null : (result.note ?? "Não processado"),
            requestIp,
          });
          return Response.json({ ok: true, result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await logEvent({
            rawBody,
            payload: parsed,
            signature,
            signatureValid: true,
            eventType,
            processed: false,
            error: msg,
            requestIp,
          });
          // 200 para evitar tempestade de retry; o erro fica no log para replay.
          return Response.json({ ok: false, error: msg }, { status: 200 });
        }
      },
      GET: async () =>
        new Response("Kirvano webhook endpoint. Use POST.", {
          status: 405,
          headers: { allow: "POST" },
        }),
    },
  },
});