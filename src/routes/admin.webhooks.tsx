import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, XCircle, RefreshCcw, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { replayWebhookLog } from "@/lib/admin/replay.functions";

export const Route = createFileRoute("/admin/webhooks")({
  component: WebhookLogsPage,
});

type LogRow = {
  id: string;
  source: string;
  event_type: string | null;
  signature_valid: boolean;
  processed: boolean;
  error: string | null;
  created_at: string;
  payload: unknown;
  capi_status: "sent" | "failed" | "skipped" | null;
  capi_error: string | null;
  capi_retries: number;
  capi_last_attempt: string | null;
};

function WebhookLogsPage() {
  const qc = useQueryClient();
  const replayFn = useServerFn(replayWebhookLog);
  const [open, setOpen] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin", "webhook-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      // Cast via unknown: os tipos gerados do Supabase estão defasados (sem colunas capi_*,
      // adicionadas em 20260616_capi_retry). select("*") retorna esses campos em runtime.
      return (data ?? []) as unknown as LogRow[];
    },
  });

  const replay = useMutation({
    mutationFn: (logId: string) => replayFn({ data: { logId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "webhook-logs"] }),
  });

  // Cobertura CAPI: entre os webhooks que tentaram enviar ao Meta (capi_status != null),
  // quantos foram 'sent'. NULL = evento sem CAPI (não-venda), fora da conta.
  const capiAttempts = logs.filter((l) => l.capi_status != null);
  const capiSent = capiAttempts.filter((l) => l.capi_status === "sent").length;
  const capiPct = capiAttempts.length ? Math.round((capiSent / capiAttempts.length) * 100) : null;

  return (
    <div className="adm-fade-up space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
          Fase 2
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">Webhook Logs</h1>
        <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">
          Todo evento recebido da Kirvano fica registrado aqui — válido ou não, processado ou não.
          Você pode reprocessar manualmente.
        </p>
        {capiPct !== null && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px]">
            <span className="font-semibold text-[var(--adm-navy-deep)]">
              Vendas no Meta (CAPI):
            </span>
            <span
              className={
                capiPct === 100
                  ? "font-semibold text-emerald-600"
                  : capiPct >= 80
                    ? "font-semibold text-amber-600"
                    : "font-semibold text-rose-600"
              }
            >
              {capiPct}%
            </span>
            <span className="text-[var(--adm-text-muted)]">
              ({capiSent}/{capiAttempts.length} enviadas)
            </span>
          </div>
        )}
      </header>

      <GlassCard className="p-0">
        {isLoading ? (
          <p className="px-4 py-12 text-center text-[13px] text-[var(--adm-text-muted)]">
            Carregando…
          </p>
        ) : logs.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Inbox className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-[14px] font-semibold text-[var(--adm-navy-deep)]">
              Nenhum evento recebido
            </p>
            <p className="mt-1 text-[12px] text-[var(--adm-text-muted)]">
              Configure a URL do webhook na Kirvano e os eventos aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {l.signature_valid ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      )}
                      <span className="font-mono text-[12px] text-[var(--adm-navy-deep)]">
                        {l.event_type || "(sem evento)"}
                      </span>
                      {l.processed && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          processado
                        </span>
                      )}
                      {!l.processed && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          pendente
                        </span>
                      )}
                      {l.capi_status === "sent" && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Meta ✓
                        </span>
                      )}
                      {l.capi_status === "failed" && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          Meta ✗{l.capi_retries > 1 ? ` (${l.capi_retries}×)` : ""}
                        </span>
                      )}
                      {l.capi_status === "skipped" && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Meta —
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </p>
                    {l.error && <p className="mt-1 text-[12px] text-rose-600">{l.error}</p>}
                    {l.capi_status === "failed" && l.capi_error && (
                      <p className="mt-0.5 text-[11px] text-rose-500">CAPI: {l.capi_error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setOpen(open === l.id ? null : l.id)}
                      className="rounded-md px-2 py-1 text-[12px] text-[var(--adm-navy-deep)] hover:bg-slate-100"
                    >
                      {open === l.id ? "Ocultar" : "Ver payload"}
                    </button>
                    {l.signature_valid && (
                      <button
                        onClick={() => replay.mutate(l.id)}
                        disabled={replay.isPending}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--adm-navy-deep)] px-2 py-1 text-[12px] text-white hover:brightness-110 disabled:opacity-60"
                      >
                        <RefreshCcw className="h-3 w-3" />
                        Replay
                      </button>
                    )}
                  </div>
                </div>
                {open === l.id && (
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-200">
                    {JSON.stringify(l.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
