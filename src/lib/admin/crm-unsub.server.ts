import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function unsubSecret(): string {
  return process.env.CRM_UNSUB_SECRET ?? process.env.RESEND_API_KEY ?? "fallback-crm-secret";
}

export function signUnsubToken(contact: string, channel: string): string {
  const payload = `${contact}:${channel}`;
  const sig = createHmac("sha256", unsubSecret()).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyUnsubToken(token: string): { contact: string; channel: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const channel = parts.pop()!;
    const contact = parts.join(":");
    if (!contact || !["email", "whatsapp"].includes(channel)) return null;
    const expected = createHmac("sha256", unsubSecret()).update(`${contact}:${channel}`).digest("hex").slice(0, 16);
    if (sig !== expected) return null;
    return { contact, channel };
  } catch {
    return null;
  }
}

export async function processOptOut(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const verified = verifyUnsubToken(token);
    if (!verified) {
      return { success: false, error: "Token inválido" };
    }
    const { contact, channel } = verified;

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .or(`email.eq.${contact},whatsapp.eq.${contact}`)
      .maybeSingle();

    const { error } = await (supabaseAdmin as any).from("crm_opt_outs").upsert(
      {
        lead_id: lead?.id ?? null,
        contact,
        channel,
        reason: "unsubscribe_link",
      },
      { onConflict: "contact,channel" },
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    return { success: false, error: "Erro ao processar opt-out" };
  }
}
