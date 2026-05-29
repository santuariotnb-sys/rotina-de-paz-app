import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeadsetIcon,
  Plus,
  X,
  ChevronRight,
  MessageCircle,
  Send,
  HelpCircle,
  AlertTriangle,
  Bug,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifyNewTicket } from "@/lib/api/send-email.functions";

export const Route = createFileRoute("/app/suporte")({
  component: SuportePage,
});

type Ticket = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  { value: "duvida", label: "Dúvida", icon: HelpCircle, color: "bg-blue-100 text-blue-700" },
  { value: "dificuldade", label: "Dificuldade técnica", icon: AlertTriangle, color: "bg-amber-100 text-amber-700" },
  { value: "erro", label: "Erro no app", icon: Bug, color: "bg-rose-100 text-rose-700" },
  { value: "reembolso", label: "Reembolso", icon: RotateCcw, color: "bg-purple-100 text-purple-700" },
] as const;

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  duvida: { label: "Dúvida", color: "bg-blue-100 text-blue-700" },
  dificuldade: { label: "Dificuldade", color: "bg-amber-100 text-amber-700" },
  erro: { label: "Erro", color: "bg-rose-100 text-rose-700" },
  reembolso: { label: "Reembolso", color: "bg-purple-100 text-purple-700" },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "bg-amber-100 text-amber-700" },
  answered: { label: "Respondido", color: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Fechado", color: "bg-gray-100 text-gray-500" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function SuportePage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["app", "support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      {/* Header */}
      <div className="mt-6 text-center rdp-fade-up">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 text-[color:var(--gold-warm)]">
          <HeadsetIcon className="h-6 w-6" />
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">
          Ajuda
        </p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">Suporte</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">
          Tire suas dúvidas e acompanhe seus chamados
        </p>
      </div>

      {/* New ticket button */}
      <div className="mt-6 flex justify-end rdp-fade-up" style={{ animationDelay: "60ms" }}>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] hover:brightness-110 transition"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancelar" : "Novo ticket"}
        </button>
      </div>

      {/* New ticket form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <NewTicketForm
              onSuccess={() => {
                setShowForm(false);
                queryClient.invalidateQueries({ queryKey: ["app", "support-tickets"] });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">
          Carregando tickets...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && tickets.length === 0 && (
        <div className="mt-8 rdp-light-card rounded-3xl p-8 text-center rdp-fade-up">
          <MessageCircle className="mx-auto h-10 w-10 text-[color:var(--rose-dust)]/60" />
          <p className="mt-3 font-display text-lg text-[color:var(--deep-purple)]">
            Nenhum ticket ainda
          </p>
          <p className="mt-1 text-[13px] text-[color:var(--amethyst)]">
            Precisa de ajuda? Abra seu primeiro ticket usando o botão acima.
          </p>
        </div>
      )}

      {/* Ticket list */}
      {!isLoading && tickets.length > 0 && (
        <ol className="mt-4 space-y-2">
          {tickets.map((ticket, i) => {
            const cat = CATEGORY_MAP[ticket.category] ?? { label: ticket.category, color: "bg-gray-100 text-gray-600" };
            const st = STATUS_MAP[ticket.status] ?? { label: ticket.status, color: "bg-gray-100 text-gray-500" };
            return (
              <li key={ticket.id} className="rdp-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                <Link
                  to="/app/suporte/$ticketId"
                  params={{ ticketId: ticket.id }}
                  className="flex items-center gap-3 rounded-2xl border border-[color:var(--rose-dust)]/25 bg-white/70 p-4 transition hover:border-[color:var(--gold-warm)]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(201,168,118,0.3)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.color}`}>
                        {cat.label}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate font-display text-base text-[color:var(--deep-purple)]">
                      {ticket.subject}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[color:var(--amethyst)]">
                      {formatDate(ticket.updated_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--rose-dust)]/50" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/* ── New Ticket Form ────────────────────────────────────── */

function NewTicketForm({ onSuccess }: { onSuccess: () => void }) {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Get profile for name
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();

      const userName = profile?.name ?? user.email?.split("@")[0] ?? "Aluna";
      const userEmail = user.email ?? "";

      // Create ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          category,
          subject: subject.trim(),
          status: "open",
        })
        .select("id")
        .single();
      if (ticketErr) throw ticketErr;

      // Create first message
      const { error: msgErr } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticket.id,
          sender_type: "user",
          sender_id: user.id,
          body: message.trim(),
        });
      if (msgErr) throw msgErr;

      // Notify via email (fire-and-forget)
      notifyNewTicket({
        data: {
          userName,
          userEmail,
          category,
          subject: subject.trim(),
          message: message.trim(),
        },
      }).catch(() => {});
    },
    onSuccess,
  });

  const canSubmit = category && subject.trim().length >= 3 && message.trim().length >= 10 && !mutation.isPending;

  return (
    <div className="mt-4 rdp-light-card rounded-3xl p-6">
      <h3 className="font-display text-lg text-[color:var(--deep-purple)]">Abrir novo ticket</h3>

      {/* Category */}
      <label className="mt-4 block text-[12px] font-semibold text-[color:var(--amethyst)]">
        Categoria
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CATEGORIES.map((cat) => {
          const active = category === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left text-[13px] transition ${
                active
                  ? "border-[color:var(--gold-warm)] bg-gradient-to-r from-white to-[color:var(--rose-soft)]/30 shadow-sm"
                  : "border-[color:var(--rose-dust)]/25 bg-white/50 hover:border-[color:var(--gold-warm)]/40"
              }`}
            >
              <cat.icon className={`h-4 w-4 shrink-0 ${active ? "text-[color:var(--gold-warm)]" : "text-[color:var(--amethyst)]"}`} />
              <span className={active ? "text-[color:var(--deep-purple)] font-medium" : "text-[color:var(--amethyst)]"}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subject */}
      <label className="mt-4 block text-[12px] font-semibold text-[color:var(--amethyst)]">
        Assunto
      </label>
      <input
        type="text"
        maxLength={100}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Resumo da sua dúvida ou problema"
        className="mt-1 w-full rounded-xl border border-[color:var(--rose-dust)]/25 bg-white/70 px-4 py-2.5 text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50 focus:border-[color:var(--gold-warm)] focus:outline-none focus:ring-1 focus:ring-[color:var(--gold-warm)]/30"
      />
      <p className="mt-1 text-right text-[10px] text-[color:var(--amethyst)]">{subject.length}/100</p>

      {/* Message */}
      <label className="mt-2 block text-[12px] font-semibold text-[color:var(--amethyst)]">
        Mensagem
      </label>
      <textarea
        maxLength={2000}
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Descreva com detalhes o que precisa de ajuda..."
        className="mt-1 w-full resize-none rounded-xl border border-[color:var(--rose-dust)]/25 bg-white/70 px-4 py-2.5 text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50 focus:border-[color:var(--gold-warm)] focus:outline-none focus:ring-1 focus:ring-[color:var(--gold-warm)]/30"
      />
      <p className="mt-1 text-right text-[10px] text-[color:var(--amethyst)]">{message.length}/2000</p>

      {/* Error */}
      {mutation.isError && (
        <p className="mt-2 text-[12px] text-rose-600">
          Erro ao enviar. Tente novamente.
        </p>
      )}

      {/* Submit */}
      <button
        onClick={() => mutation.mutate()}
        disabled={!canSubmit}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
      >
        <Send className="h-4 w-4" />
        {mutation.isPending ? "Enviando..." : "Enviar ticket"}
      </button>
    </div>
  );
}
