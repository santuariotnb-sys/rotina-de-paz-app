import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: apenas admins.");
}

export type IntegrationStatus = {
  kirvanoSecretConfigured: boolean;
  recentWebhooks: number;
  recentApproved: number;
  recentFailed: number;
};

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationStatus> => {
    await assertAdmin(context.userId);

    const kirvanoSecretConfigured = !!process.env.KIRVANO_WEBHOOK_SECRET;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [total, approved, failed] = await Promise.all([
      supabaseAdmin
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("processed", true)
        .eq("signature_valid", true),
      supabaseAdmin
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .or("signature_valid.eq.false,processed.eq.false"),
    ]);

    return {
      kirvanoSecretConfigured,
      recentWebhooks: total.count ?? 0,
      recentApproved: approved.count ?? 0,
      recentFailed: failed.count ?? 0,
    };
  });