import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplate } from "@/lib/whatsapp/whatsapp-cloud.server";
import { generateResultVariables } from "@/lib/whatsapp/whatsapp-copy.server";

// Cron: pega envios vencidos (send_after <= now) e pendentes, gera as variaveis
// com o Claude e envia via WhatsApp Cloud API. Vercel envia GET, protegido por
// CRON_SECRET. Roda a cada minuto (granularidade minima da Vercel).

const LANG = process.env.WHATSAPP_LANG ?? "pt_BR";
// Se o template tem header de IMAGEM, hospede a imagem (link publico) e ponha
// aqui. Vazio = template so-texto (comportamento antigo, sem header).
const HEADER_IMAGE_URL = process.env.WHATSAPP_RESULT_IMAGE_URL || undefined;
const MAX_PER_RUN = 15;
const MAX_ATTEMPTS = 3;

export const Route = createFileRoute("/api/cron/whatsapp-dispatch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          console.error("[whatsapp-dispatch] CRITICAL: CRON_SECRET ausente — bloqueado");
          return new Response("Cron secret not configured", { status: 503 });
        }
        if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
          return new Response("unauthorized", { status: 401 });
        }

        const db = supabaseAdmin as any;
        const nowISO = new Date().toISOString();

        const { data: due, error } = await db
          .from("whatsapp_sends")
          .select("id, lead_id, template, attempts")
          .eq("status", "pending")
          .lte("send_after", nowISO)
          .lt("attempts", MAX_ATTEMPTS)
          .order("send_after", { ascending: true })
          .limit(MAX_PER_RUN);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;

        for (const row of due ?? []) {
          const { data: lead } = await db
            .from("leads")
            .select("id, name, whatsapp, is_test, archetype, desire, situation")
            .eq("id", row.lead_id)
            .maybeSingle();

          if (!lead?.whatsapp || lead.is_test) {
            await db
              .from("whatsapp_sends")
              .update({ status: "skipped", error: !lead?.whatsapp ? "no_whatsapp" : "is_test" })
              .eq("id", row.id);
            skipped++;
            continue;
          }

          const attempts = row.attempts + 1;
          try {
            const vars = await generateResultVariables({
              name: lead.name,
              archetype: lead.archetype,
              desire: lead.desire,
              situation: lead.situation,
            });
            const res = await sendTemplate({
              to: lead.whatsapp, // ja vem "55..." do save_lead_contact
              template: row.template,
              lang: LANG,
              variables: [vars.nome, vars.frase_arquetipo],
              headerImageUrl: HEADER_IMAGE_URL,
            });

            if (res.ok) {
              await db
                .from("whatsapp_sends")
                .update({
                  status: "sent",
                  wa_message_id: res.id,
                  variables: vars,
                  sent_at: new Date().toISOString(),
                  attempts,
                  error: null,
                })
                .eq("id", row.id);
              sent++;
            } else {
              await db
                .from("whatsapp_sends")
                .update({
                  status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
                  error: res.error,
                  attempts,
                })
                .eq("id", row.id);
              failed++;
            }
          } catch (e) {
            await db
              .from("whatsapp_sends")
              .update({
                status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
                error: e instanceof Error ? e.message : String(e),
                attempts,
              })
              .eq("id", row.id);
            failed++;
          }
        }

        return Response.json({ ok: true, sent, failed, skipped });
      },
    },
  },
});
