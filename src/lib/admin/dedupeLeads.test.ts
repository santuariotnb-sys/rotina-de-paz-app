// Teste funcional do dedup de leads por sessão.
// Roda sem framework: `node --experimental-strip-types --test src/lib/admin/dedupeLeads.test.ts`
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeBySession, leadScore, countSessionsSince, type Lead } from "./dedupeLeads.ts";

// Fábrica de Lead com defaults; só sobrescreve o que o caso precisa.
let n = 0;
function lead(p: Partial<Lead>): Lead {
  return {
    id: p.id ?? `id-${++n}`,
    name: p.name ?? null,
    email: p.email ?? null,
    whatsapp: p.whatsapp ?? null,
    archetype: p.archetype ?? null,
    desire: p.desire ?? null,
    situation: p.situation ?? null,
    risk_flag: p.risk_flag ?? false,
    utm_source: p.utm_source ?? null,
    utm_campaign: p.utm_campaign ?? null,
    external_id: p.external_id ?? null,
    created_at: p.created_at ?? "2026-07-15T00:00:00Z",
  };
}

test("colapsa múltiplas linhas da mesma sessão em 1 (o caso Rosângela)", () => {
  const rows = [
    lead({ id: "r1", external_id: "qs_rosa", created_at: "2026-07-15T09:55:00Z" }),
    lead({ id: "r2", external_id: "qs_rosa", created_at: "2026-07-14T11:16:00Z" }),
    lead({ id: "r3", external_id: "qs_rosa", created_at: "2026-07-14T12:00:00Z" }),
  ];
  const out = dedupeBySession(rows);
  assert.equal(out.length, 1, "visitas da mesma pessoa = 1 lead");
  assert.equal(out[0].external_id, "qs_rosa");
});

test("mantém a linha MAIS COMPLETA (WhatsApp) mesmo se for mais antiga", () => {
  const rows = [
    lead({ id: "novo", external_id: "qs_a", created_at: "2026-07-15T10:00:00Z" }), // score 0
    lead({ id: "wpp", external_id: "qs_a", created_at: "2026-07-15T09:00:00Z", whatsapp: "5511999" }), // score 4
  ];
  const out = dedupeBySession(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "wpp", "prefere a linha com WhatsApp");
});

test("empate de completude → mais recente vence", () => {
  const rows = [
    lead({ id: "velho", external_id: "qs_b", created_at: "2026-07-15T08:00:00Z", email: "a@b.com" }),
    lead({ id: "novo", external_id: "qs_b", created_at: "2026-07-15T09:00:00Z", email: "a@b.com" }),
  ];
  const out = dedupeBySession(rows);
  assert.equal(out[0].id, "novo");
});

test("linhas sem external_id (legado) NÃO são coladas", () => {
  const rows = [
    lead({ id: "x", external_id: null }),
    lead({ id: "y", external_id: null }),
    lead({ id: "z", external_id: "qs_c" }),
  ];
  const out = dedupeBySession(rows);
  assert.equal(out.length, 3, "2 órfãos + 1 sessão");
});

test("resultado ordenado por created_at desc", () => {
  const rows = [
    lead({ external_id: "qs_1", created_at: "2026-07-10T00:00:00Z" }),
    lead({ external_id: "qs_2", created_at: "2026-07-15T00:00:00Z" }),
    lead({ external_id: "qs_3", created_at: "2026-07-12T00:00:00Z" }),
  ];
  const out = dedupeBySession(rows);
  assert.deepEqual(
    out.map((l) => l.external_id),
    ["qs_2", "qs_3", "qs_1"],
  );
});

test("leadScore prioriza WhatsApp > email > nome; nome em branco não pontua", () => {
  assert.ok(leadScore(lead({ whatsapp: "x" })) > leadScore(lead({ email: "x@y.z" })));
  assert.ok(leadScore(lead({ email: "x@y.z" })) > leadScore(lead({ name: "Ana" })));
  assert.equal(leadScore(lead({ name: "   " })), 0, "nome só com espaços = 0");
  assert.equal(leadScore(lead({})), 0);
});

test("countSessionsSince conta 1× por sessão e não some sessão ativa hoje", () => {
  const since = "2026-07-15T00:00:00Z";
  const rows = [
    // sessão A: linha completa de ONTEM + linha nova de HOJE → conta como ativa hoje (1×)
    lead({ external_id: "qs_A", created_at: "2026-07-14T23:00:00Z", whatsapp: "5511" }),
    lead({ external_id: "qs_A", created_at: "2026-07-15T08:00:00Z" }),
    // sessão B: só ontem → não conta
    lead({ external_id: "qs_B", created_at: "2026-07-14T10:00:00Z" }),
    // órfão de hoje → conta (por id)
    lead({ id: "orf", external_id: null, created_at: "2026-07-15T09:00:00Z" }),
  ];
  assert.equal(countSessionsSince(rows, since), 2, "qs_A + órfão de hoje; qs_B fora");
});
