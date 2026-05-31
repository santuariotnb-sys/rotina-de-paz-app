/* ── Support System — shared types & constants ────────── */

export type TicketCategory = "duvida" | "dificuldade" | "erro" | "reembolso";
export type TicketStatus = "open" | "answered" | "closed";
export type SenderType = "user" | "admin";

export type SupportTicket = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type SupportProfile = {
  user_id: string;
  email: string | null;
  name: string | null;
  archetype: string | null;
};

/* ── Labels ───────────────────────────────────────────── */

export const CATEGORY_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  dificuldade: "Dificuldade",
  erro: "Erro",
  reembolso: "Reembolso",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  answered: "Respondido",
  closed: "Fechado",
};

/* ── Colors (app / user-facing) ───────────────────────── */

export const CATEGORY_COLORS: Record<string, string> = {
  duvida: "bg-blue-100 text-blue-700",
  dificuldade: "bg-amber-100 text-amber-700",
  erro: "bg-rose-100 text-rose-700",
  reembolso: "bg-purple-100 text-purple-700",
};

export const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  answered: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};

/* ── Colors (admin / dark theme) ──────────────────────── */

export const ADMIN_CATEGORY_COLORS: Record<string, string> = {
  duvida: "bg-blue-500/15 text-blue-300",
  dificuldade: "bg-amber-500/15 text-amber-300",
  erro: "bg-rose-500/15 text-rose-300",
  reembolso: "bg-purple-500/15 text-purple-300",
};

export const ADMIN_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: "Aberto", className: "bg-amber-500/15 text-amber-300" },
  answered: { label: "Respondido", className: "bg-emerald-500/15 text-emerald-300" },
  closed: { label: "Fechado", className: "bg-white/5 text-white/30" },
};
