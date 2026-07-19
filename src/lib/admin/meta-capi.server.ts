import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Meta Conversions API (server-side) — fonte de verdade do evento Purchase.
 *
 * Por que server-side: o pixel client só conseguia rastrear a compra do produto
 * principal (a /obrigado) e duplicava em reload (eventID instável). O webhook do
 * Kirvano recebe UM SALE_APPROVED por venda (principal, upsell, order bump…), com
 * sale_id único, valor real e o external_id (utm.src) que cruza com tracking_sessions
 * para recuperar fbp/fbc/ip/user_agent. Isso dá matching de alta qualidade, resiste
 * a iOS/adblock e usa event_id = sale_id para deduplicar caso um dia volte o pixel.
 *
 * Setup-safe: sem META_PIXEL_ID/META_CAPI_TOKEN a função é no-op (loga e retorna).
 */

const PIXEL_ID = process.env.META_PIXEL_ID;
const CAPI_TOKEN = process.env.META_CAPI_TOKEN;
// Opcional: quando setado, os eventos aparecem em "Eventos de teste" com este código.
// Deixe vazio em produção. Útil para validar (ex.: TEST45310).
const TEST_CODE = process.env.META_CAPI_TEST_CODE;
const API_VERSION = "v22.0";
const FETCH_TIMEOUT_MS = 8000;

function sha256(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const norm = value.trim().toLowerCase();
  if (!norm) return undefined;
  return createHash("sha256").update(norm).digest("hex");
}

/** Normaliza cidade/estado ao padrão do Meta: sem acento, sem espaço/pontuação, minúsculo. */
function normLoc(value: string | null): string | null {
  if (!value) return null;
  // NFD decompõe o acento (ã → a + diacrítico); o strip de não-alfanuméricos abaixo
  // remove espaços, pontuação E os diacríticos → "São Paulo" vira "saopaulo".
  const n = value
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return n || null;
}

// Hash fixo do país (funil 100% BR). Constante de módulo: não recomputar por evento.
const HASHED_COUNTRY_BR = createHash("sha256").update("br").digest("hex");

/** "R$ 1.067,00" | "67,00" | "67.00" | 67 → number. Tolera pt-BR e formato com ponto decimal. */
export function parseBRL(value: unknown): number | undefined {
  if (typeof value === "number") return isNaN(value) ? undefined : value;
  if (typeof value !== "string") return undefined;
  const stripped = value.replace(/[^\d,.-]/g, "");
  // Se há vírgula, é pt-BR: ponto = milhar (remove), vírgula = decimal.
  // Sem vírgula, o ponto já é o separador decimal (formato "67.00").
  const normalized = stripped.includes(",")
    ? stripped.replace(/\./g, "").replace(",", ".")
    : stripped;
  const n = parseFloat(normalized);
  return isNaN(n) ? undefined : n;
}

function eventTime(payload: any): number {
  const raw = payload?.created_at;
  if (raw) {
    const t = Date.parse(String(raw));
    if (!isNaN(t)) return Math.floor(t / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

/** Remove o token de uma mensagem antes de logar/retornar (defesa contra vazamento). */
function redact(msg: string): string {
  return CAPI_TOKEN ? msg.split(CAPI_TOKEN).join("[REDACTED]") : msg;
}

export type CapiResult = { sent: boolean; error?: string };

/**
 * Dispara um evento Purchase para o Meta a partir do payload do Kirvano.
 * event_id = transactionId (sale_id) → único por venda, dedup garantido.
 */
export async function sendMetaCapiPurchase(
  payload: any,
  opts: { transactionId: string | null; productNames: string[]; productIds?: string[] },
): Promise<CapiResult> {
  if (!PIXEL_ID || !CAPI_TOKEN) {
    console.warn(
      "[meta-capi] META_PIXEL_ID/META_CAPI_TOKEN ausentes — Purchase NÃO enviado ao Meta",
    );
    return { sent: false, error: "missing_credentials" };
  }

  // O Kirvano envia em DOIS shapes: campos no top-level OU aninhados em `data.*`
  // (os extractors de kirvano.server.ts tentam data.customer primeiro; o test-webhook
  // emite aninhado). Sem esta normalização, payload aninhado zerava todo o user_data.
  const root: any =
    payload?.data && typeof payload.data === "object" ? { ...payload, ...payload.data } : payload;

  // event_id é obrigatório para dedup. Sem ele, não enviamos (evita duplicar em retry).
  const event_id: string | null = opts.transactionId ?? root?.sale_id ?? root?.checkout_id ?? null;
  if (!event_id) {
    console.error("[meta-capi] event_id (sale_id) ausente — Purchase NÃO enviado (risco de dedup)");
    return { sent: false, error: "missing_event_id" };
  }

  try {
    const externalId: string | null = root?.utm?.src ?? root?.src ?? null;
    const cookies = root?.cookies ?? {};

    // Recupera sinais do navegador capturados no quiz (cruza por external_id)
    let ts: {
      fbp: string | null;
      fbc: string | null;
      client_ip: string | null;
      user_agent: string | null;
    } | null = null;
    if (externalId) {
      // tracking_sessions não está nos tipos gerados — mesmo padrão do restante do módulo
      const { data } = await (supabaseAdmin as any)
        .from("tracking_sessions")
        .select("fbp, fbc, client_ip, user_agent")
        .eq("external_id", externalId)
        .maybeSingle();
      ts = data ?? null;
    }

    const email: string | null = root?.customer?.email ?? null;
    const fullName: string | null = root?.customer?.name ?? null;
    const firstName = fullName ? String(fullName).trim().split(/\s+/)[0] : null;
    const lastName = fullName ? String(fullName).trim().split(/\s+/).slice(1).join(" ") : null;
    // phone_number vem do Kirvano em E.164 (ex: "5519987333333"). Normaliza para E.164 canônico.
    const rawPhone: string | null =
      root?.customer?.phone_number ?? root?.customer?.phone ?? root?.customer?.cellphone ?? null;
    let phoneDigits = rawPhone ? rawPhone.replace(/\D/g, "") : null;
    if (phoneDigits) {
      // Remove leading zero (ex: 019987... → 19987...)
      if (phoneDigits.startsWith("0")) phoneDigits = phoneDigits.slice(1);
      // Números BR sem DDI (10-11 dígitos) → prefixar 55
      if (phoneDigits.length >= 10 && phoneDigits.length <= 11) {
        phoneDigits = "55" + phoneDigits;
      }
    }
    // fbp/fbc: tracking_session primeiro; fallback nos cookies do payload Kirvano.
    // O payload traz cookies.fbclid (não cookies.fbc) — construímos fbc no formato Meta:
    // fb.1.{timestamp_ms}.{fbclid}
    const fbp: string | null = ts?.fbp ?? cookies?.fbp ?? null;
    const cookieFbclid: string | null = cookies?.fbclid ?? null;
    // Fix: se cookieFbclid já está em formato fbc (fb.1.xxx.yyy), usar como está.
    // Antes re-empacotava cegamente → fbc double-wrap inválido que o Meta rejeitava.
    const fbcFromCookie: string | null = cookieFbclid
      ? cookieFbclid.startsWith("fb.")
        ? cookieFbclid
        : `fb.1.${Date.now()}.${cookieFbclid}`
      : null;
    const fbc: string | null = ts?.fbc ?? fbcFromCookie ?? cookies?.fbc ?? null;
    const ip: string | null = root?.ip ?? ts?.client_ip ?? null;
    const value = parseBRL(root?.total_price);

    // Endereço + documento do payload Kirvano → EMQ (advanced matching). Só entram quando
    // presentes E com o tipo esperado — String(objeto) viraria "[object Object]" e o hash
    // de lixo degradaria o match em vez de omitir o campo.
    const addr = (root?.customer?.address ?? {}) as Record<string, unknown>;
    const city = typeof addr?.city === "string" ? addr.city : null;
    const state = typeof addr?.state === "string" ? addr.state : null;
    const zipDigits =
      typeof addr?.zipcode === "string" || typeof addr?.zipcode === "number"
        ? String(addr.zipcode).replace(/\D/g, "")
        : null;
    const docDigits =
      root?.customer?.document != null ? String(root.customer.document).replace(/\D/g, "") : null;
    // Só CPF (11 dígitos) entra como identificador — CNPJ/documento malformado ficaria
    // como external_id bogus sem contraparte no pixel client.
    const cpfDigits = docDigits && docDigits.length === 11 ? docDigits : null;

    const user_data: Record<string, unknown> = {};
    const em = sha256(email);
    if (em) user_data.em = [em];
    const ph = sha256(phoneDigits);
    if (ph) user_data.ph = [ph];
    const fn = sha256(firstName);
    if (fn) user_data.fn = [fn];
    const ln = sha256(lastName);
    if (ln) user_data.ln = [ln];
    // Endereço hasheado (só quando presente) + country fixo 'br' (funil BR) → mais sinais de match.
    const ct = sha256(normLoc(city));
    if (ct) user_data.ct = [ct];
    const st = sha256(normLoc(state));
    if (st) user_data.st = [st];
    const zp = sha256(zipDigits);
    if (zp) user_data.zp = [zp];
    user_data.country = [HASHED_COUNTRY_BR];
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (ip) user_data.client_ip_address = ip;
    if (ts?.user_agent) user_data.client_user_agent = ts.user_agent;
    // external_id: qs_* CRU (casa com o pixel client, dedup de pessoa — G1) + CPF hasheado
    // como identificador adicional (Meta aceita array; CPF é PII → sempre hasheado).
    const externalIds: string[] = [];
    if (externalId) externalIds.push(externalId);
    const cpfHash = sha256(cpfDigits);
    if (cpfHash) externalIds.push(cpfHash);
    if (externalIds.length) user_data.external_id = externalIds;

    const custom_data: Record<string, unknown> = {
      currency: "BRL",
      content_type: "product",
      content_name: opts.productNames.join(", ") || "Rotina de Paz",
    };
    if (value !== undefined) custom_data.value = value;
    // content_ids padronizado: slug legível (consistente com client) em vez de UUIDs internos
    custom_data.content_ids = ["rotina-de-paz"];

    const event: Record<string, unknown> = {
      event_name: "Purchase",
      event_time: eventTime(root),
      action_source: "website",
      event_source_url: "https://rotinadepaz.com.br/",
      event_id,
      user_data,
      custom_data,
    };

    const body: Record<string, unknown> = { data: [event] };
    if (TEST_CODE) body.test_event_code = TEST_CODE;

    // Log estruturado: rastreabilidade do que saiu para o Meta (sem dados sensíveis)
    console.log(
      `[meta-capi] Purchase → event_id=${event_id} fbc=${fbc ?? "MISSING"} fbp=${fbp ?? "MISSING"} ph=${phoneDigits ? "YES" : "NO"} ip=${ip ? "YES" : "NO"} ua=${ts?.user_agent ? "YES" : "NO"} externalId=${externalId ?? "NONE"} ts_match=${ts ? "YES" : "NO"} fbclid_cookie=${cookieFbclid ? "YES" : "NO"} addr=${zp ? "YES" : "NO"} cpf=${cpfHash ? "YES" : "NO"}`,
    );

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(CAPI_TOKEN)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        sent: false,
        error: redact(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 250)}`),
      };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sent: false, error: redact(msg) };
  }
}
