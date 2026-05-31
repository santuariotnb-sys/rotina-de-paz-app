import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifyUserReply } from "@/lib/api/send-email.functions";
import {
  type SupportTicket,
  type SupportMessage,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/support/types";

export const Route = createFileRoute("/app/suporte/$ticketId")({
  component: TicketDetailPage,
});

const CATEGORY_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([k, label]) => [k, { label, color: CATEGORY_COLORS[k] }]),
);

const STATUS_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([k, label]) => [k, { label, color: STATUS_COLORS[k] }]),
);

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: ticket, isLoading: loadingTicket } = useQuery<SupportTicket>({
    queryKey: ["app", "support-ticket", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<SupportMessage[]>({
    queryKey: ["app", "support-messages", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const replyMutation = useMutation({
    mutationFn: async (body: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Get profile for name
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", user.id)
        .single();

      const userName = profile?.name ?? user.email?.split("@")[0] ?? "Aluna";
      const userEmail = user.email ?? "";

      // Insert message
      const { error: msgErr } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticketId,
          sender_type: "user",
          sender_id: user.id,
          body: body.trim(),
        });
      if (msgErr) throw msgErr;

      // If ticket was answered, set back to open
      if (ticket?.status === "answered") {
        await supabase
          .from("support_tickets")
          .update({ status: "open" })
          .eq("id", ticketId);
      }

      // Update ticket timestamp
      await supabase
        .from("support_tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      // Notify via email (fire-and-forget)
      notifyUserReply({
        data: {
          userName,
          userEmail,
          subject: ticket?.subject ?? "",
          message: body.trim(),
        },
      }).catch(() => {});
    },
    onSuccess: () => {
      if (textareaRef.current) textareaRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["app", "support-messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["app", "support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["app", "support-tickets"] });
    },
  });

  const handleSubmit = () => {
    const val = textareaRef.current?.value?.trim();
    if (!val || val.length < 2) return;
    replyMutation.mutate(val);
  };

  const isLoading = loadingTicket || loadingMessages;
  const isClosed = ticket?.status === "closed";
  const cat = CATEGORY_MAP[ticket?.category ?? ""] ?? { label: ticket?.category ?? "", color: "bg-gray-100 text-gray-600" };
  const st = STATUS_MAP[ticket?.status ?? ""] ?? { label: ticket?.status ?? "", color: "bg-gray-100 text-gray-500" };

  return (
    <>
      {/* Header */}
      <div className="mt-4 rdp-fade-up">
        <Link
          to="/app/suporte"
          className="inline-flex items-center gap-1 text-[13px] text-[color:var(--amethyst)] hover:text-[color:var(--gold-warm)] transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao suporte
        </Link>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">
          Carregando...
        </p>
      )}

      {!isLoading && ticket && (
        <>
          {/* Ticket info */}
          <div className="mt-4 rdp-light-card rounded-3xl p-5 rdp-fade-up">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.color}`}>
                {cat.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>
                {st.label}
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl text-[color:var(--deep-purple)]">
              {ticket.subject}
            </h1>
            <p className="mt-1 text-[11px] text-[color:var(--amethyst)]">
              Criado em {formatTimestamp(ticket.created_at)}
            </p>
          </div>

          {/* Messages thread */}
          <div className="mt-4 space-y-3">
            {messages.map((msg, i) => {
              const isUser = msg.sender_type === "user";
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? "bg-gradient-to-br from-[#F5ECD8] to-[#EDE0C8] text-[#3D2E12]"
                        : "bg-gradient-to-br from-[#F0E8F5] to-[#E8DFF0] text-[color:var(--deep-purple)]"
                    }`}
                  >
                    <p className="text-[11px] font-semibold mb-1 opacity-60">
                      {isUser ? "Você" : "Equipe Rotina de Paz"}
                    </p>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                      {msg.body}
                    </p>
                    <p className={`mt-2 text-[10px] text-right ${isUser ? "text-[#8B7A58]" : "text-[color:var(--amethyst)]"}`}>
                      {formatTimestamp(msg.created_at)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply form or closed notice */}
          {isClosed ? (
            <div className="mt-6 rdp-light-card rounded-2xl p-5 text-center rdp-fade-up">
              <Lock className="mx-auto h-5 w-5 text-[color:var(--rose-dust)]/60" />
              <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">
                Este ticket foi encerrado. Se precisar de mais ajuda, abra um novo ticket.
              </p>
            </div>
          ) : (
            <div className="mt-6 rdp-light-card rounded-2xl p-4 rdp-fade-up">
              <textarea
                ref={textareaRef}
                rows={3}
                maxLength={2000}
                placeholder="Escreva sua resposta..."
                className="w-full resize-none rounded-xl border border-[color:var(--rose-dust)]/25 bg-white/70 px-4 py-2.5 text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50 focus:border-[color:var(--gold-warm)] focus:outline-none focus:ring-1 focus:ring-[color:var(--gold-warm)]/30"
              />
              {replyMutation.isError && (
                <p className="mt-1 text-[12px] text-rose-600">
                  Erro ao enviar. Tente novamente.
                </p>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={replyMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] transition hover:brightness-110 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {replyMutation.isPending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
