import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** TTL da signed URL de e-book (segundos). Curto o bastante para não virar link permanente. */
const EBOOK_URL_TTL = 60 * 60; // 1h

/**
 * Converte a URL pública armazenada (…/object/public/<bucket>/<path>) em uma
 * signed URL com TTL. Funciona tanto com bucket público quanto privado
 * (forward-compatible com a privatização). Se não conseguir parsear, devolve
 * a URL original (fallback seguro, sem quebrar o acesso).
 */
async function toSignedUrl(rawUrl: string): Promise<string> {
  const marker = "/object/public/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) return rawUrl; // não é URL de storage conhecida
  const rest = rawUrl.slice(idx + marker.length); // "<bucket>/<path...>"
  const slash = rest.indexOf("/");
  if (slash === -1) return rawUrl;
  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1));
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, EBOOK_URL_TTL);
  if (error || !data?.signedUrl) {
    console.error("[getEbookUrl] createSignedUrl falhou:", error?.message);
    return rawUrl; // fallback: mantém acesso enquanto bucket ainda é público
  }
  return data.signedUrl;
}

/**
 * Retorna a URL de um ebook SOMENTE se o usuário tem entitlement ativo.
 * Ebooks sem required_product_id (bonus) são liberados para qualquer autenticado.
 * A URL retornada é assinada com TTL curto (não é link permanente compartilhável).
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
      return { url: await toSignedUrl(ebook.file_url) };
    }

    // Verificar entitlement ativo
    const owned = new Set((entRes.data ?? []).map((r) => r.product_id));
    if (!owned.has(ebook.required_product_id)) {
      throw new Error("Acesso não autorizado a este e-book");
    }

    return { url: await toSignedUrl(ebook.file_url) };
  });
