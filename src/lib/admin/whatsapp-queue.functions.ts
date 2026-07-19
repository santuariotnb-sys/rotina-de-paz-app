import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

// Lê `whatsapp_sends` (service-role-only, sem policy p/ authenticated — ver
// 20260714_whatsapp_sends.sql) e devolve contadores + últimos 10 envios com o
// telefone JÁ MASCARADO no servidor (nunca expõe o número completo ao client).

export type WhatsAppQueueStats = {
  totalSent: number;
  totalPending: number;
  totalFailed: number;
  totalSkipped: number;
  recent: Array<{
    id: string;
    createdAt: string;
    phoneMasked: string;
    status: string;
    quizId: string | null;
  }>;
};

/** "(19) *****-1234" — mantém só DDD + últimos 4 dígitos. */
function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  // Remove DDI 55 quando presente junto com DDD+numero (>11 dígitos totais).
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length < 8) return "*".repeat(local.length || 4);
  const ddd = local.slice(0, 2);
  const last4 = local.slice(-4);
  return `(${ddd}) *****-${last4}`;
}

const inputSchema = z.object({ quizId: z.string().nullish() });

export const getWhatsAppQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<WhatsAppQueueStats> => {
    await assertAdmin(context.userId);

    // Tabela `whatsapp_sends` não está no types.ts gerado → cast
    const db = supabaseAdmin as any;

    async function countByStatus(status: string): Promise<number> {
      let q = db
        .from("whatsapp_sends")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (data.quizId) q = q.eq("quiz_id", data.quizId);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    const [totalSent, totalPending, totalFailed, totalSkipped] = await Promise.all([
      countByStatus("sent"),
      countByStatus("pending"),
      countByStatus("failed"),
      countByStatus("skipped"),
    ]);

    let recentQuery = db
      .from("whatsapp_sends")
      .select("id, status, quiz_id, created_at, lead_id, leads(whatsapp)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data.quizId) recentQuery = recentQuery.eq("quiz_id", data.quizId);
    const { data: recentRows, error: recentErr } = await recentQuery;
    if (recentErr) throw new Error(recentErr.message);

    const recent = (recentRows ?? []).map((r: any) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      phoneMasked: maskPhone(r.leads?.whatsapp ?? null),
      status: r.status as string,
      quizId: (r.quiz_id ?? null) as string | null,
    }));

    return { totalSent, totalPending, totalFailed, totalSkipped, recent };
  });
