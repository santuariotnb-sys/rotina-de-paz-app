import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ipAddress } from "@vercel/functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGAL_VERSIONS } from "./versions";

// Type assertion: legal_acceptances table not in generated types yet
const db = supabaseAdmin as any;

export const getLegalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ needsAcceptance: boolean }> => {
    const { data } = await db
      .from("legal_acceptances")
      .select("terms_version, privacy_version, responsibility_version")
      .eq("user_id", context.userId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return { needsAcceptance: true };

    const needsAcceptance =
      data.terms_version !== LEGAL_VERSIONS.terms ||
      data.privacy_version !== LEGAL_VERSIONS.privacy ||
      data.responsibility_version !== LEGAL_VERSIONS.responsibility;

    return { needsAcceptance };
  });

export const recordLegalAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    const ip = request ? (ipAddress(request) ?? null) : null;
    const userAgent = request?.headers?.get("user-agent") ?? null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await db
      .from("legal_acceptances")
      .insert({
        user_id: context.userId,
        email: profile?.email ?? null,
        terms_version: LEGAL_VERSIONS.terms,
        privacy_version: LEGAL_VERSIONS.privacy,
        responsibility_version: LEGAL_VERSIONS.responsibility,
        ip,
        user_agent: userAgent,
      });

    if (error) throw new Error(`Falha ao registrar aceite: ${error.message}`);
    return { ok: true };
  });
