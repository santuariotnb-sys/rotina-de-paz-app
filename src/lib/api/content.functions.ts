import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Retorna a URL de um ebook SOMENTE se o usuário tem entitlement ativo.
 * Ebooks sem required_product_id (bonus) são liberados para qualquer autenticado.
 */
export const getEbookUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ebookId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    // Busca ebook e entitlements em paralelo para reduzir latência
    const [ebookRes, entRes] = await Promise.all([
      supabaseAdmin
        .from("ebooks")
        .select("id, title, file_url, required_product_id")
        .eq("id", data.ebookId)
        .single(),
      supabaseAdmin
        .from("entitlements")
        .select("product_id")
        .eq("user_id", context.userId)
        .eq("status", "active"),
    ]);

    if (ebookRes.error || !ebookRes.data) {
      throw new Error("E-book não encontrado");
    }

    const ebook = ebookRes.data;

    if (!ebook.file_url) {
      throw new Error("E-book sem arquivo disponível");
    }

    // Bonus (sem required_product_id) — liberado para qualquer autenticado
    if (!ebook.required_product_id) {
      return { url: ebook.file_url };
    }

    // Verificar entitlement ativo
    const owned = new Set((entRes.data ?? []).map((r) => r.product_id));
    if (!owned.has(ebook.required_product_id)) {
      throw new Error("Acesso não autorizado a este e-book");
    }

    return { url: ebook.file_url };
  });
