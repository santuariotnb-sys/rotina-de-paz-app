// Dedup de leads por sessão (external_id).
//
// Contexto: o quiz reaberto gerava 1 linha de lead NOVA por visita (o guard do
// persist_lead era só em-memória). Auditoria do banco (jul/2026): 228 linhas =
// 72 sessões (external_id) = 17 telefones; ex. "Rosângela" = 1 pessoa, 1 sessão,
// 6 linhas. O fix de origem (cache localStorage no quiz) impede novas duplicatas;
// aqui, no admin, colapsamos o histórico em 1 linha por sessão — read-side puro,
// o banco NÃO é tocado.
//
// Módulo puro (sem React) para ser testável isoladamente.

export type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  archetype: string | null;
  desire: string | null;
  situation: string | null;
  risk_flag: boolean;
  utm_source: string | null;
  utm_campaign: string | null;
  external_id: string | null;
  created_at: string;
};

// "Completude" da linha: preferimos a que tem mais dado de contato para representar
// a sessão (WhatsApp > email > nome). Empate de score → desempata por mais recente.
export function leadScore(l: Lead): number {
  return (l.whatsapp ? 4 : 0) + (l.email ? 2 : 0) + (l.name && l.name.trim() ? 1 : 0);
}

// Colapsa as linhas em 1 por external_id, mantendo a mais completa. Linhas sem
// external_id (legado) ficam individuais — não há como saber a sessão. O resultado
// vem ordenado por created_at desc (mais recente primeiro).
export function dedupeBySession(rows: Lead[]): Lead[] {
  const best = new Map<string, Lead>();
  const orphans: Lead[] = [];
  for (const l of rows) {
    if (!l.external_id) {
      orphans.push(l);
      continue;
    }
    const cur = best.get(l.external_id);
    if (!cur) {
      best.set(l.external_id, l);
      continue;
    }
    const sl = leadScore(l);
    const sc = leadScore(cur);
    const better = sl !== sc ? sl > sc : l.created_at > cur.created_at;
    if (better) best.set(l.external_id, l);
  }
  // localeCompare devolve 0 em empate (ordem total estável); desc = b vs a.
  return [...best.values(), ...orphans].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

// Nº de sessões com atividade a partir de `sinceISO` (conta 1× por external_id;
// órfãos por id). Fonte = linhas CRUAS (antes do dedup) para não perder uma
// sessão cuja linha "mais completa" seja de outro dia — evita inflar E evita
// subcontar. Usado no KPI "Leads hoje".
export function countSessionsSince(rows: Lead[], sinceISO: string): number {
  const sessions = new Set<string>();
  for (const l of rows) {
    if (l.created_at >= sinceISO) sessions.add(l.external_id ?? l.id);
  }
  return sessions.size;
}
