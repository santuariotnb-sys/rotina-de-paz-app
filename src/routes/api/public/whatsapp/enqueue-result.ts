import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Enfileira o disparo do resultado no WhatsApp. Chamado pelo quiz (fire-and-forget)
// logo apos capturar o contato. NAO envia aqui — grava send_after = now()+35s e o
// cron whatsapp-dispatch envia. Idempotente por (lead_id, template).

const TEMPLATE = process.env.WHATSAPP_TEMPLATE_RESULT ?? "quiz_resultado";
const DELAY_SECONDS = 35;

export const Route = createFileRoute("/api/public/whatsapp/enqueue-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. secret gate (segredo de baixo valor: so enfileira, idempotente)
        const url = new URL(request.url);
        const secret = process.env.WHATSAPP_ENDPOINT_SECRET;
        if (!secret || url.searchParams.get("k") !== secret) {
          return new Response("forbidden", { status: 403 });
        }

        // 2. body
        let leadId: string | undefined;
        try {
          const raw = await request.text();
          if (raw.length > 4096) return new Response("too large", { status: 413 });
          leadId = (JSON.parse(raw) as { lead_id?: string })?.lead_id;
        } catch {
          return new Response("bad json", { status: 400 });
        }
        if (!leadId || typeof leadId !== "string") {
          return new Response("missing lead_id", { status: 400 });
        }

        const db = supabaseAdmin as any;

        // 3. lead precisa existir, ter whatsapp e nao ser teste
        const { data: lead } = await db
          .from("leads")
          .select("id, whatsapp, is_test, quiz_id")
          .eq("id", leadId)
          .maybeSingle();
        if (!lead?.whatsapp) return Response.json({ ok: true, skipped: "no_whatsapp" });
        if (lead.is_test) return Response.json({ ok: true, skipped: "is_test" });

        // 4. enfileira idempotente: send_after = agora + 35s
        const sendAfter = new Date(Date.now() + DELAY_SECONDS * 1000).toISOString();
        const { error } = await db.from("whatsapp_sends").upsert(
          {
            lead_id: leadId,
            template: TEMPLATE,
            status: "pending",
            send_after: sendAfter,
            quiz_id: lead.quiz_id ?? null,
          },
          { onConflict: "lead_id,template", ignoreDuplicates: true },
        );
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true, enqueued: true });
      },
    },
  },
});
