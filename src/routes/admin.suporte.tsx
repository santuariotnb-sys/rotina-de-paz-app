import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Headphones,
  MessageSquare,
  AlertTriangle,
  X,
  Mail,
  Send,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import { logAdminAction } from "@/lib/admin/audit";
import {
  notifyAdminReply,
  notifyTicketClosed,
} from "@/lib/api/send-email.functions";
import {
  type SupportTicket,
  type SupportMessage,
  type SupportProfile,
  CATEGORY_LABELS,
  ADMIN_CATEGORY_COLORS as CATEGORY_COLORS,
  ADMIN_STATUS_BADGES as STATUS_BADGES,
} from "@/lib/support/types";

export const Route = createFileRoute("/admin/suporte")({
  component: AdminSuportePage,
});

/* ── Constants ──────────────────────────────────────── */

const STATUS_FILTERS = [
  { label: "Todos", value: "all" },
  { label: "Abertos", value: "open" },
  { label: "Respondidos", value: "answered" },
  { label: "Fechados", value: "closed" },
] as const;

/* ── Page ───────────────────────────────────────────── */

function AdminSuportePage() {
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>(STATUS_FILTERS[0]);
  const [selected, setSelected] = useState<
    (SupportTicket & { profile: SupportProfile }) | null
  >(null);

  /* Tickets */
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["adm-suporte-tickets"],
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as SupportTicket[];
    },
  });

  /* Profiles for ticket users */
  const userIds = useMemo(
    () => [...new Set(tickets.map((t) => t.user_id))],
    [tickets],
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ["adm-suporte-profiles", userIds],
    queryFn: async (): Promise<SupportProfile[]> => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, email, archetype")
        .in("user_id", userIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as SupportProfile[];
    },
    enabled: userIds.length > 0,
  });

  const profileByUserId = useMemo(() => {
    const m: Record<string, SupportProfile> = {};
    for (const p of profiles) m[p.user_id] = p;
    return m;
  }, [profiles]);

  /* KPIs */
  const kpis = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let open = 0;
    let answeredToday = 0;
    let refundOpen = 0;
    for (const t of tickets) {
      if (t.status === "open") {
        open++;
        if (t.category === "reembolso") refundOpen++;
      }
      if (
        t.status === "answered" &&
        t.updated_at.slice(0, 10) === todayStr
      ) {
        answeredToday++;
      }
    }
    return { open, answeredToday, refundOpen };
  }, [tickets]);

  /* Filter */
  const filtered = useMemo(() => {
    if (statusFilter.value === "all") return tickets;
    return tickets.filter((t) => t.status === statusFilter.value);
  }, [tickets, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Suporte</h1>
          <p className="text-sm text-white/60">
            Tickets, respostas e histórico de atendimento.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Tickets abertos"
          value={kpis.open}
          icon={<Headphones className="h-5 w-5 text-white/70" />}
          accent="blue"
          loading={isLoading}
        />
        <KpiCard
          label="Respondidos hoje"
          value={kpis.answeredToday}
          icon={<MessageSquare className="h-5 w-5 text-white/70" />}
          accent="green"
          loading={isLoading}
        />
        <KpiCard
          label="Reembolsos pendentes"
          value={kpis.refundOpen}
          icon={<AlertTriangle className="h-5 w-5 text-white/70" />}
          accent="rose"
          loading={isLoading}
        />
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                statusFilter.value === f.value
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-white/30">
          {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden p-0" lift={false}>
        {isLoading ? (
          <div className="p-6 text-sm text-white/60">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-white/50">
            Nenhum ticket encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Aluna</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Assunto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((t) => {
                const prof = profileByUserId[t.user_id];
                const statusBadge = STATUS_BADGES[t.status] ?? {
                  label: t.status,
                  className: "bg-white/5 text-white/40",
                };
                const catColor =
                  CATEGORY_COLORS[t.category] ??
                  "bg-white/5 text-white/60";
                const catLabel =
                  CATEGORY_LABELS[t.category] ?? t.category;
                return (
                  <tr
                    key={t.id}
                    onClick={() =>
                      setSelected({
                        ...t,
                        profile: prof ?? {
                          user_id: t.user_id,
                          name: null,
                          email: null,
                          archetype: null,
                        },
                      })
                    }
                    className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {prof?.name ?? "—"}
                      </div>
                      <div className="text-xs text-white/50">
                        {prof?.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${catColor}`}
                      >
                        {catLabel}
                      </span>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-white/70">
                      {t.subject}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/50">
                      {new Date(t.updated_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      {/* Drawer */}
      {selected && (
        <TicketDrawer
          ticket={selected}
          profile={selected.profile}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ── Drawer ─────────────────────────────────────────── */

function TicketDrawer({
  ticket,
  profile,
  onClose,
}: {
  ticket: SupportTicket;
  profile: SupportProfile;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);

  /* Messages */
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["adm-suporte-messages", ticket.id],
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as SupportMessage[];
    },
  });

  /* Reply mutation */
  const replyMut = useMutation({
    mutationFn: async () => {
      const body = reply.trim();
      if (!body) throw new Error("Digite uma resposta.");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");

      const { error: msgErr } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticket.id,
          sender_type: "admin",
          sender_id: user.id,
          body,
        });
      if (msgErr) throw new Error(msgErr.message);

      const { error: tickErr } = await supabase
        .from("support_tickets")
        .update({ status: "answered", updated_at: new Date().toISOString() })
        .eq("id", ticket.id);
      if (tickErr) throw new Error(tickErr.message);

      if (profile.email) {
        await notifyAdminReply({
          data: {
            userEmail: profile.email,
            subject: ticket.subject,
            message: body,
          },
        });
      }

      await logAdminAction("ticket.reply", {
        resourceType: "support_ticket",
        resourceId: ticket.id,
        metadata: {
          userEmail: profile.email,
          subject: ticket.subject,
        },
      });
    },
    onSuccess: () => {
      setReply("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["adm-suporte-messages", ticket.id] });
      qc.invalidateQueries({ queryKey: ["adm-suporte-tickets"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  /* Close ticket mutation */
  const closeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", ticket.id);
      if (error) throw new Error(error.message);

      if (profile.email) {
        await notifyTicketClosed({
          data: {
            userEmail: profile.email,
            subject: ticket.subject,
          },
        });
      }

      await logAdminAction("ticket.close", {
        resourceType: "support_ticket",
        resourceId: ticket.id,
        metadata: {
          userEmail: profile.email,
          subject: ticket.subject,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adm-suporte-tickets"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const statusBadge = STATUS_BADGES[ticket.status] ?? {
    label: ticket.status,
    className: "bg-white/5 text-white/40",
  };
  const catLabel = CATEGORY_LABELS[ticket.category] ?? ticket.category;
  const catColor =
    CATEGORY_COLORS[ticket.category] ?? "bg-white/5 text-white/60";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="adm-glass-dark relative h-full w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">
            {profile.name ?? "Sem nome"}
          </h2>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {profile.email ?? "—"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {profile.archetype && (
              <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs capitalize text-white/70">
                {profile.archetype}
              </span>
            )}
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${catColor}`}
            >
              {catLabel}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* Subject */}
        <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Assunto
          </p>
          <p className="mt-1 text-sm text-white">{ticket.subject}</p>
        </div>

        {/* Thread */}
        <section className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-white">Mensagens</h3>
          {loadingMsgs ? (
            <p className="text-xs text-white/40">Carregando...</p>
          ) : messages.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-xs text-white/40">
              Nenhuma mensagem registrada.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => {
                const isAdmin = m.sender_type === "admin";
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3 ${
                      isAdmin
                        ? "border-blue-500/20 bg-blue-500/[0.05]"
                        : "border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider ${
                          isAdmin ? "text-blue-300" : "text-white/50"
                        }`}
                      >
                        {isAdmin ? "Admin" : "Aluna"}
                      </span>
                      <span className="text-[10px] text-white/30">
                        {new Date(m.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-white/80">
                      {m.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Reply form — only show if ticket is not closed */}
        {ticket.status !== "closed" && (
          <section className="space-y-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Digite sua resposta..."
              rows={4}
              className="adm-input w-full resize-none text-sm"
            />

            {err && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                disabled={closeMut.isPending}
                onClick={() => closeMut.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/5 disabled:opacity-40"
              >
                <XCircle className="h-3.5 w-3.5" />{" "}
                {closeMut.isPending ? "Fechando..." : "Fechar ticket"}
              </button>
              <button
                disabled={replyMut.isPending || !reply.trim()}
                onClick={() => replyMut.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />{" "}
                {replyMut.isPending ? "Enviando..." : "Responder"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
