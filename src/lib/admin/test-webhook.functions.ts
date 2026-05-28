import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processKirvanoPayload } from "./kirvano.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: apenas admins.");
}

export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      productId: z.string().uuid(),
      offerId: z.string().min(1).optional(),
      eventType: z.enum(["SALE_APPROVED", "SALE_REFUNDED"]).default("SALE_APPROVED"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Resolve product name + offer_id
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name, slug")
      .eq("id", data.productId)
      .maybeSingle();

    let offerId = data.offerId;
    if (!offerId) {
      const { data: offers } = await supabaseAdmin
        .from("product_kirvano_offers")
        .select("kirvano_offer_id")
        .eq("product_id", data.productId)
        .limit(1);
      offerId = offers?.[0]?.kirvano_offer_id ?? "TEST-OFFER-123";
    }

    const txId = `test-${Date.now()}`;
    const payload = {
      event: data.eventType,
      type: data.eventType,
      data: {
        id: txId,
        transaction_id: txId,
        offer: { id: offerId, code: offerId },
        customer: {
          email: data.email,
          name: data.email.split("@")[0],
        },
        products: [{ offer_id: offerId, id: data.productId }],
      },
      timestamp: new Date().toISOString(),
    };

    // Insert into webhook_logs and capture id
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("webhook_logs")
      .insert({
        source: "kirvano",
        event_type: data.eventType,
        payload: payload as never,
        signature: "test-signature",
        signature_valid: true,
        processed: false,
        request_ip: "127.0.0.1",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Process the payload
    const result = await processKirvanoPayload(payload);

    // Mark as processed in log
    await supabaseAdmin
      .from("webhook_logs")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: result.matched ? null : (result.note ?? "Não processado"),
      })
      .eq("id", inserted.id);

    return { ok: true, result, txId, offerId, productName: product?.name ?? null };
  });
