import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processKirvanoPayload } from "./kirvano.server";
import { assertAdmin } from "./server-auth";

export const replayWebhookLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ logId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: log, error } = await supabaseAdmin
      .from("webhook_logs")
      .select("id, payload, signature_valid")
      .eq("id", data.logId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!log) throw new Error("Log não encontrado.");
    if (!log.signature_valid) throw new Error("Não é possível reprocessar evento com assinatura inválida.");

    try {
      const result = await processKirvanoPayload(log.payload as Record<string, unknown>);
      await supabaseAdmin
        .from("webhook_logs")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error: result.matched ? null : (result.note ?? "Não processado"),
        })
        .eq("id", log.id);
      return { ok: true, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("webhook_logs")
        .update({ processed: false, error: msg })
        .eq("id", log.id);
      return { ok: false, error: msg };
    }
  });