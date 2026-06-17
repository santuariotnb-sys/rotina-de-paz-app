import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";
import { z } from "zod";
import { createHmac } from "crypto";

// ============================================================
// Types
// ============================================================

export type CrmSegment = {
  segment_key: string;
  segment_label: string;
  total: number;
  com_whatsapp: number;
  com_email: number;
  alcancavel: number;
};

export type CrmContact = {
  lead_id: string | null;
  name: string | null;
  contact: string;
  archetype: string | null;
};

export type CrmSendResult = {
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

// ============================================================
// 1. Listar segmentos com contagens
// ============================================================

export const getCrmSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrmSegment[]> => {
    await assertAdmin(context.userId);

    const { data, error } = await (supabaseAdmin.rpc as any)("crm_segments", {
      p_days: 365,
    });

    if (error) throw new Error(`crm_segments: ${error.message}`);
    return (data ?? []) as CrmSegment[];
  });

// ============================================================
// 2. Listar contatos de um segmento
// ============================================================

const segmentContactsSchema = z.object({
  segmentKey: z.string(),
  channel: z.enum(["email", "whatsapp"]).default("email"),
});

export const getCrmContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => segmentContactsSchema.parse(input))
  .handler(async ({ context, data }): Promise<CrmContact[]> => {
    await assertAdmin(context.userId);

    const { data: rows, error } = await (supabaseAdmin.rpc as any)(
      "crm_segment_contacts",
      { p_segment_key: data.segmentKey, p_channel: data.channel },
    );

    if (error) throw new Error(`crm_segment_contacts: ${error.message}`);
    return (rows ?? []) as CrmContact[];
  });

// ============================================================
// 3. Enviar email de teste via Resend
// ============================================================

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const RESEND_SINGLE_URL = "https://api.resend.com/emails";
const BATCH_SIZE = 50;

function fromAddress(): string {
  return (
    process.env.RESEND_FROM ?? "Rotina de Paz <noreply@rotinadepaz.com.br>"
  );
}

function siteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://rotina-de-paz-app.vercel.app"
  ).replace(/\/$/, "");
}

function unsubSecret(): string {
  return process.env.CRM_UNSUB_SECRET ?? process.env.RESEND_API_KEY ?? "fallback-crm-secret";
}

function signUnsubToken(contact: string, channel: string): string {
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
    const contact = parts.join(":"); // email pode ter ":"? improvável mas safe
    if (!contact || !["email", "whatsapp"].includes(channel)) return null;
    const expected = createHmac("sha256", unsubSecret()).update(`${contact}:${channel}`).digest("hex").slice(0, 16);
    if (sig !== expected) return null;
    return { contact, channel };
  } catch {
    return null;
  }
}

function buildUnsubscribeUrl(contact: string, channel: string): string {
  return `${siteUrl()}/api/crm/unsubscribe?token=${signUnsubToken(contact, channel)}`;
}

const sendTestEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

export const sendCrmTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendTestEmailSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ sent: boolean; error?: string }> => {
    await assertAdmin(context.userId);

    const key = process.env.RESEND_API_KEY;
    if (!key) return { sent: false, error: "RESEND_API_KEY ausente" };

    const unsubUrl = buildUnsubscribeUrl(data.to, "email");

    try {
      const res = await fetch(RESEND_SINGLE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [data.to],
          subject: data.subject,
          html: data.html,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
          },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { sent: false, error: `Resend ${res.status}: ${txt.slice(0, 200)}` };
      }
      return { sent: true };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ============================================================
// 4. Enviar campanha (batch com dedup + opt-out + rate-limit)
// ============================================================

const sendCampaignSchema = z.object({
  segmentKey: z.string(),
  channel: z.enum(["email", "whatsapp"]),
  campaignId: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
});

export const sendCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendCampaignSchema.parse(input))
  .handler(async ({ context, data }): Promise<CrmSendResult> => {
    await assertAdmin(context.userId);

    const result: CrmSendResult = { sent: 0, skipped: 0, failed: 0, errors: [] };

    if (data.channel === "whatsapp") {
      const token = process.env.WHATSAPP_API_TOKEN;
      if (!token) {
        result.errors.push("WhatsApp pendente: WHATSAPP_API_TOKEN não configurado");
        return result;
      }
      result.errors.push("WhatsApp: implementação ativa quando token for configurado");
      return result;
    }

    // Email via Resend
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      result.errors.push("RESEND_API_KEY ausente");
      return result;
    }

    // Buscar contatos do segmento (já exclui opt-outs via RPC)
    const { data: contacts, error: contactsErr } = await (supabaseAdmin.rpc as any)(
      "crm_segment_contacts",
      { p_segment_key: data.segmentKey, p_channel: "email" },
    );

    if (contactsErr) {
      result.errors.push(`Erro ao buscar contatos: ${contactsErr.message}`);
      return result;
    }

    const allContacts = (contacts ?? []) as CrmContact[];
    if (allContacts.length === 0) {
      result.errors.push("Nenhum contato alcançável neste segmento");
      return result;
    }

    // Filtrar dedup: excluir quem já recebeu esta campanha
    const { data: alreadySent } = await (supabaseAdmin as any)
      .from("crm_sends")
      .select("contact")
      .eq("campaign_id", data.campaignId)
      .eq("channel", "email");

    const sentSet = new Set(
      ((alreadySent ?? []) as { contact: string }[]).map((r) => r.contact),
    );
    const toSend = allContacts.filter((c) => c.contact && !sentSet.has(c.contact));
    result.skipped = allContacts.length - toSend.length;

    if (toSend.length === 0) {
      result.errors.push("Todos os contatos já receberam esta campanha");
      return result;
    }

    // Enviar em batches
    for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
      const batch = toSend.slice(i, i + BATCH_SIZE);

      const emails = batch.map((c) => {
        const name = c.name?.split(" ")[0] ?? "";
        const personalizedHtml = data.html.replace(/\{nome\}/g, name || "querida");
        const unsubUrl = buildUnsubscribeUrl(c.contact, "email");

        return {
          from: fromAddress(),
          to: [c.contact],
          subject: data.subject.replace(/\{nome\}/g, name || "querida"),
          html: personalizedHtml,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
          },
        };
      });

      try {
        const res = await fetch(RESEND_BATCH_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emails),
        });

        if (res.ok) {
          result.sent += batch.length;

          const sendRows = batch.map((c) => ({
            lead_id: c.lead_id,
            contact: c.contact,
            channel: "email" as const,
            campaign_id: data.campaignId,
            template: data.subject,
            status: "sent" as const,
          }));

          await (supabaseAdmin as any).from("crm_sends").upsert(sendRows, {
            onConflict: "contact,campaign_id,channel",
          });
        } else {
          const txt = await res.text().catch(() => "");
          result.failed += batch.length;
          result.errors.push(
            `Batch ${i / BATCH_SIZE + 1}: Resend ${res.status} — ${txt.slice(0, 200)}`,
          );
        }
      } catch (e) {
        result.failed += batch.length;
        result.errors.push(
          `Batch ${i / BATCH_SIZE + 1}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // Rate-limit entre batches (1s)
      if (i + BATCH_SIZE < toSend.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return result;
  });

// ============================================================
// 5. Processar opt-out (chamado pela rota /api/crm/unsubscribe)
// ============================================================

export async function processOptOut(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const verified = verifyUnsubToken(token);
    if (!verified) {
      return { success: false, error: "Token inválido" };
    }
    const { contact, channel } = verified;

    // Buscar lead_id pelo contato
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

// ============================================================
// 6. Histórico de envios de uma campanha
// ============================================================

const sendHistorySchema = z.object({
  campaignId: z.string().optional(),
});

export const getCrmSendHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendHistorySchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    let query = (supabaseAdmin as any)
      .from("crm_sends")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(200);

    if (data.campaignId) {
      query = query.eq("campaign_id", data.campaignId);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`crm_sends: ${error.message}`);
    return rows ?? [];
  });
