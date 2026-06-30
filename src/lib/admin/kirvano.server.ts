import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendWelcomeEmail } from "./email.server";
import { sendMetaCapiPurchase } from "./meta-capi.server";

/**
 * Validação HMAC-SHA256 em tempo constante.
 * Compara o hex computado a partir do raw body com a assinatura recebida.
 */
export function verifyKirvanoSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;

  // 1. Tentar HMAC-SHA256 (padrão seguro)
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (received.length === expected.length) {
    try {
      if (timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"))) return true;
    } catch { /* fall through to plain comparison */ }
  }

  // 2. Fallback: comparação direta de token estático (Kirvano pode enviar plain token)
  if (signature.length === secret.length) {
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(secret));
    } catch { return false; }
  }

  return false;
}

type KirvanoPayload = Record<string, unknown> & {
  event?: string;
  type?: string;
  data?: Record<string, unknown>;
};

const APPROVED_EVENTS = new Set([
  "SALE_APPROVED",
  "sale.approved",
  "order.approved",
  "PURCHASE_APPROVED",
  "purchase.approved",
]);

const REVOKE_EVENTS = new Set([
  "SALE_REFUNDED",
  "sale.refunded",
  "SALE_CHARGEBACK",
  "sale.chargeback",
  "SALE_CANCELED",
  "sale.canceled",
  "PURCHASE_REFUNDED",
  "purchase.refunded",
]);

function pick<T = string>(obj: unknown, ...paths: string[]): T | null {
  if (!obj || typeof obj !== "object") return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur != null && cur !== "") return cur as T;
  }
  return null;
}

function extractOfferIds(payload: KirvanoPayload): string[] {
  const ids = new Set<string>();
  const root = (payload.data ?? payload) as Record<string, unknown>;

  const single =
    pick<string>(root, "offer.id", "offer_id", "offer.hash", "offer.code") ??
    pick<string>(payload, "offer.id", "offer_id");
  if (single) ids.add(String(single));

  const products = (root.products ?? root.items ?? []) as unknown;
  if (Array.isArray(products)) {
    for (const p of products) {
      const id = pick<string>(p, "offer_id", "offer.id", "id");
      if (id) ids.add(String(id));
    }
  }
  return Array.from(ids);
}

function extractCustomerEmail(payload: KirvanoPayload): string | null {
  return (
    pick<string>(payload, "data.customer.email", "data.buyer.email", "data.email", "customer.email", "buyer.email", "email") ?? null
  );
}

function extractCustomerName(payload: KirvanoPayload): string | null {
  return (
    pick<string>(payload, "data.customer.name", "data.buyer.name", "customer.name", "buyer.name", "data.customer.full_name") ?? null
  );
}

function extractTransactionId(payload: KirvanoPayload): string | null {
  return (
    pick<string>(payload, "data.id", "data.transaction_id", "data.transaction.id", "data.sale_id", "sale_id", "id", "transaction_id") ?? null
  );
}

/**
 * Valor REALMENTE pago no webhook, em centavos. Cada oferta one-click (principal,
 * upsell, downsell) dispara seu próprio webhook, então `total_price` == o preço daquela
 * oferta. Corrige o analytics que antes gravava o preço de catálogo do produto (ex.:
 * downsell da Chave da Gratidão gravava R$67 em vez dos R$37 pagos). Retorna null se
 * ausente/ilegível para o chamador cair no fallback de catálogo.
 */
function extractPaidTotalCents(payload: KirvanoPayload): number | null {
  const raw = pick<unknown>(payload, "total_price", "data.total_price", "data.total", "total");
  let reais: number | undefined;
  if (typeof raw === "number") reais = isNaN(raw) ? undefined : raw;
  else if (typeof raw === "string") {
    const stripped = raw.replace(/[^\d,.-]/g, "");
    const normalized = stripped.includes(",")
      ? stripped.replace(/\./g, "").replace(",", ".")
      : stripped;
    const n = parseFloat(normalized);
    reais = isNaN(n) ? undefined : n;
  }
  if (reais == null || reais <= 0) return null;
  return Math.round(reais * 100);
}

/**
 * Garante que existe um usuário em auth.users para o email do comprador.
 * Retorna o user_id. Se o usuário já existe, retorna o existente.
 */
async function ensureUserForEmail(email: string, name: string | null): Promise<string> {
  // 1) Tenta achar via profile (cobre quase todos os casos).
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (profile?.user_id) return profile.user_id;

  // 2) Lista pela API admin (filtro por email é suportado em versões recentes).
  // Como fallback robusto, criamos o usuário; se já existir, o erro 422 trará o id.
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: name ?? email.split("@")[0], source: "kirvano" },
  });

  if (created.error) {
    // Se já existe, recuperar via RPC direta (sem limite de paginação)
    const { data: userId } = await (supabaseAdmin as any).rpc("get_user_id_by_email", { p_email: email });
    if (userId) return userId as string;
    throw new Error(`Não foi possível obter/criar usuário para ${email}: ${created.error.message}`);
  }

  return created.data.user!.id;
}

export type KirvanoProcessResult = {
  matched: boolean;
  granted: string[];
  revoked: string[];
  userId?: string;
  note?: string;
  capiStatus?: string;
  capiError?: string | null;
};

function inferProductType(label: string | null): string {
  if (!label) return "principal";
  const l = label.toLowerCase();
  if (l.includes("upsell") || l.includes("upgrade")) return "upsell";
  if (l.includes("downsell")) return "downsell";
  if (l.includes("bump")) return "order_bump";
  return "principal";
}

/**
 * Processa o payload já validado e cria/revoga entitlements.
 * Não relança — chamador decide o status do webhook_log.
 */
export async function processKirvanoPayload(payload: KirvanoPayload, _webhookLogId?: string | null): Promise<KirvanoProcessResult> {
  const eventName = String(payload.event ?? payload.type ?? "").trim();
  const isApproved = APPROVED_EVENTS.has(eventName);
  const isRevoke = REVOKE_EVENTS.has(eventName);

  if (!isApproved && !isRevoke) {
    return { matched: false, granted: [], revoked: [], note: `Evento ignorado: ${eventName || "(vazio)"}` };
  }

  const offerIds = extractOfferIds(payload);
  const email = extractCustomerEmail(payload);
  const txId = extractTransactionId(payload);
  const name = extractCustomerName(payload);

  if (offerIds.length === 0) return { matched: false, granted: [], revoked: [], note: "Sem offer_id no payload." };
  if (!email) return { matched: false, granted: [], revoked: [], note: "Sem email do comprador." };

  // Resolve produto(s) a partir das ofertas
  const { data: offers, error: offersErr } = await supabaseAdmin
    .from("product_kirvano_offers")
    .select("product_id, kirvano_offer_id")
    .in("kirvano_offer_id", offerIds);
  if (offersErr) throw new Error(`Falha ao buscar offers: ${offersErr.message}`);

  const productIds = Array.from(new Set((offers ?? []).map((o) => o.product_id)));
  if (productIds.length === 0) {
    return { matched: false, granted: [], revoked: [], note: `Nenhum produto vinculado às offers ${offerIds.join(", ")}` };
  }

  const userId = await ensureUserForEmail(email, name);

  if (isApproved) {
    // Verificar entitlements existentes para não re-ativar refunded
    const { data: existing } = await supabaseAdmin
      .from("entitlements")
      .select("product_id, status")
      .eq("user_id", userId)
      .in("product_id", productIds);
    const refundedSet = new Set(
      (existing ?? []).filter((e) => e.status === "refunded").map((e) => e.product_id),
    );

    const activatable = productIds.filter((pid) => !refundedSet.has(pid));
    if (refundedSet.size > 0) {
      console.warn(`[kirvano] Skipping re-activation of ${refundedSet.size} refunded entitlement(s) for ${email}: ${[...refundedSet].join(", ")}`);
    }

    if (activatable.length > 0) {
      const rows = activatable.map((product_id) => ({
        user_id: userId,
        product_id,
        source: "kirvano" as const,
        status: "active" as const,
        kirvano_transaction_id: txId,
        kirvano_offer_id: offerIds[0],
        buyer_email: email,
        granted_at: new Date().toISOString(),
        revoked_at: null,
        metadata: { event: eventName, raw_offer_ids: offerIds },
      }));
      const { error } = await supabaseAdmin
        .from("entitlements")
        .upsert(rows, { onConflict: "user_id,product_id" });
      if (error) throw new Error(`Falha ao gravar entitlements: ${error.message}`);
    }

    // Boas-vindas (não bloqueia o webhook se falhar, mas ERRO VISÍVEL)
    try {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("name")
        .in("id", productIds);
      const productNames = (prods ?? []).map((p) => p.name);
      const result = await sendWelcomeEmail({ email, name, productNames });
      if (!result.sent) {
        // ERROR (não warn) — comprador pagou mas pode não ter recebido acesso por email
        console.error(`[kirvano] WELCOME EMAIL FALHOU para ${email}: ${result.error}. Comprador pode precisar usar "Esqueci a senha" para acessar.`);
      }
    } catch (e) {
      console.error(`[kirvano] WELCOME EMAIL ERRO para ${email}:`, e);
    }

    // Analytics: registrar purchase (isolado — nunca derruba fulfillment)
    try {
      // Valor real pago neste webhook. Só usamos como gross_value quando há um único
      // produto (one-click de oferta única); em pedidos multi-produto cairíamos em
      // double-count, então preferimos o preço de catálogo por produto.
      const paidCents = extractPaidTotalCents(payload);
      const useRealPaid = productIds.length === 1 && paidCents != null;

      // Resolve lead_id pelo external_id (qs_*) — uma vez antes do loop
      // try/catch próprio: falha aqui NÃO pode derrubar o purchase upsert
      const utmSrc = ((payload as any).utm as Record<string, string> | undefined)?.src ?? null;
      let resolvedLeadId: string | null = null;
      if (utmSrc) {
        try {
          const { data: leadRow } = await (supabaseAdmin as any)
            .from("leads")
            .select("id")
            .eq("external_id", utmSrc)
            .maybeSingle();
          resolvedLeadId = (leadRow as any)?.id ?? null;
        } catch {
          // lead_id é secundário — segue com NULL
        }
      }

      // is_test: marca compra de teste pela denylist (checkout_config.test_emails) — fonte única.
      // Sem isto a compra entra is_test=false e cai em vendas_reais (sujaria a métrica). (G4)
      let isTest = false;
      try {
        const { data: cfg } = await (supabaseAdmin as any)
          .from("checkout_config")
          .select("value")
          .eq("key", "test_emails")
          .maybeSingle();
        const testEmails = String((cfg as any)?.value ?? "")
          .split(",")
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean);
        isTest = !!email && testEmails.includes(email.toLowerCase());
      } catch {
        // config indisponível → mantém isTest=false (não bloqueia fulfillment)
      }

      for (const product_id of productIds) {
        const { data: prod } = await supabaseAdmin
          .from("products")
          .select("name, price_cents")
          .eq("id", product_id)
          .single();
        if (!prod) continue;

        const offerMatch = (offers ?? []).find((o) => o.product_id === product_id);
        let offerLabel: string | null = null;
        if (offerMatch) {
          const { data: offerRow } = await supabaseAdmin
            .from("product_kirvano_offers")
            .select("label")
            .eq("kirvano_offer_id", offerMatch.kirvano_offer_id)
            .single();
          offerLabel = offerRow?.label ?? null;
        }

        const utm = (payload as any).utm as Record<string, string> | undefined;
        await (supabaseAdmin as any).from("purchases").upsert({
          transaction_id: txId ? `${txId}_${product_id.slice(0, 8)}` : null,
          user_id: userId,
          product_name: prod.name,
          product_type: inferProductType(offerLabel),
          gross_value: useRealPaid ? paidCents : prod.price_cents,
          status: "confirmed",
          is_test: isTest,
          kirvano_offer_id: offerIds[0],
          buyer_email: email,
          // external_id (qs_*) do quiz → chave de join lead↔purchase para atribuição
          src: utm?.src ?? null,
          lead_id: resolvedLeadId,
          utm_source: utm?.utm_source ?? null,
          utm_campaign: utm?.utm_campaign ?? null,
          utm_medium: utm?.utm_medium ?? null,
          utm_content: utm?.utm_content ?? null,
          utm_term: utm?.utm_term ?? null,
          metadata: { event: eventName, raw_offer_ids: offerIds },
        }, { onConflict: "transaction_id" });
      }
    } catch (err) {
      console.error("[analytics] falha ao registrar purchase (não-bloqueante):", err);
    }

    // Meta CAPI Purchase — 1 tentativa rápida (8s timeout).
    // Se falha, marca capiStatus='failed' → cron async reprocessa.
    // Seguro: event_id = sale_id → Meta deduplica nossos próprios reenvios.
    let capiStatus: string | undefined;
    let capiError: string | null = null;
    try {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("name")
        .in("id", productIds);
      const productNames = (prods ?? []).map((p) => p.name);
      const capi = await sendMetaCapiPurchase(payload, { transactionId: txId, productNames, productIds });
      if (capi.sent) {
        capiStatus = "sent";
      } else if (capi.error === "missing_credentials") {
        capiStatus = "skipped";
      } else {
        capiStatus = "failed";
        capiError = capi.error ?? "unknown";
        console.error(`[meta-capi] Purchase NÃO enviado (sale ${txId}): ${capi.error}`);
      }
    } catch (err) {
      capiStatus = "failed";
      capiError = err instanceof Error ? err.message : String(err);
      console.error("[meta-capi] erro inesperado (não-bloqueante):", err);
    }

    return { matched: true, granted: productIds, revoked: [], userId, capiStatus, capiError };
  }

  // REVOKE
  const { error } = await supabaseAdmin
    .from("entitlements")
    .update({ status: "refunded", revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("product_id", productIds);
  if (error) throw new Error(`Falha ao revogar entitlements: ${error.message}`);

  // Analytics: marcar purchases como refunded — escopado por produto
  try {
    const { data: prods } = await supabaseAdmin
      .from("products")
      .select("name")
      .in("id", productIds);
    const prodNames = (prods ?? []).map((p) => p.name);
    if (prodNames.length > 0) {
      await (supabaseAdmin as any)
        .from("purchases")
        .update({ status: "refunded" })
        .eq("buyer_email", email)
        .eq("status", "confirmed")
        .in("product_name", prodNames);
    }
  } catch (err) {
    console.error("[analytics] falha ao marcar refund em purchases (não-bloqueante):", err);
  }

  return { matched: true, granted: [], revoked: productIds, userId };
}