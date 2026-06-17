import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Send,
  Users,
  Mail,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import {
  getCrmSegments,
  sendCrmTestEmail,
  sendCrmCampaign,
  type CrmSegment,
} from "@/lib/admin/crm.functions";

export const Route = createFileRoute("/admin/crm")({
  component: AdminCrmPage,
});

const ARCHETYPE_LABELS: Record<string, string> = {
  sobrecarga: "Sobrecarga",
  antecipatoria: "Antecipatória",
  culposa: "Culposa",
  vigilante: "Vigilante",
};

function AdminCrmPage() {
  const queryClient = useQueryClient();
  const fetchSegments = useServerFn(getCrmSegments);
  const doSendTest = useServerFn(sendCrmTestEmail);
  const doSendCampaign = useServerFn(sendCrmCampaign);

  const { data: segments, isLoading } = useQuery({
    queryKey: ["admin", "crm-segments"],
    queryFn: () => fetchSegments(),
    refetchInterval: 60_000,
  });

  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  // Enviar teste
  const testMutation = useMutation({
    mutationFn: () =>
      doSendTest({ data: { to: testEmail, subject, html } }),
  });

  // Enviar campanha
  const campaignMutation = useMutation({
    mutationFn: () =>
      doSendCampaign({
        data: {
          segmentKey: selectedSegment!,
          channel: "email",
          campaignId,
          subject,
          html,
        },
      }),
    onSuccess: () => {
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "crm-segments"] });
    },
  });

  const selected = segments?.find((s) => s.segment_key === selectedSegment);

  // KPIs
  const totalLeads = segments?.find((s) => s.segment_key === "lead_sem_compra");
  const totalAlcancavel = segments?.reduce((sum, s) => {
    if (s.segment_key === "lead_sem_compra") return sum + s.alcancavel;
    if (s.segment_key === "comprou_sem_upsell") return sum + s.alcancavel;
    return sum;
  }, 0) ?? 0;
  const totalWhatsapp = segments?.reduce((sum, s) => {
    if (s.segment_key.startsWith("arquetipo_")) return sum;
    return sum + s.com_whatsapp;
  }, 0) ?? 0;
  const totalEmail = segments?.reduce((sum, s) => {
    if (s.segment_key.startsWith("arquetipo_")) return sum;
    return sum + s.com_email;
  }, 0) ?? 0;

  return (
    <div className="adm-fade-up space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">
          Remarketing
        </h1>
        <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">
          Segmente leads e dispare email/WhatsApp com safe-send.
        </p>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Leads sem compra"
          value={isLoading ? "..." : String(totalLeads?.total ?? 0)}
        />
        <KpiCard
          icon={<Send className="h-5 w-5" />}
          label="Alcançáveis"
          value={isLoading ? "..." : String(totalAlcancavel)}
        />
        <KpiCard
          icon={<Mail className="h-5 w-5" />}
          label="Com email"
          value={isLoading ? "..." : String(totalEmail)}
        />
        <KpiCard
          icon={<MessageCircle className="h-5 w-5" />}
          label="Com WhatsApp"
          value={isLoading ? "..." : String(totalWhatsapp)}
          hint="Pluggable"
        />
      </div>

      {/* Segmentos */}
      <GlassCard>
        <h2 className="mb-4 text-[15px] font-semibold text-[var(--adm-navy-deep)]">
          Segmentos
        </h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--adm-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-2">
            {segments?.map((seg) => (
              <button
                key={seg.segment_key}
                onClick={() => setSelectedSegment(seg.segment_key)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedSegment === seg.segment_key
                    ? "border-[var(--adm-accent)] bg-[var(--adm-accent)]/5"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--adm-navy-deep)]">
                    {seg.segment_label}
                  </span>
                  <span className="text-xs text-[var(--adm-text-muted)]">
                    {seg.alcancavel} alcançáveis
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-[var(--adm-text-muted)]">
                  <span>Total: {seg.total}</span>
                  <span>Email: {seg.com_email}</span>
                  <span>WA: {seg.com_whatsapp}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Compositor */}
      {selectedSegment && (
        <GlassCard>
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--adm-navy-deep)]">
            Compor mensagem — {selected?.segment_label}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--adm-text-muted)]">
                ID da campanha (slug único)
              </label>
              <input
                type="text"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="ex: remarketing-jun-2026"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--adm-navy-deep)] placeholder:text-[var(--adm-text-muted)]/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--adm-text-muted)]">
                Assunto do email
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="ex: {nome}, a paz que você busca está aqui"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--adm-navy-deep)] placeholder:text-[var(--adm-text-muted)]/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--adm-text-muted)]">
                HTML do email (use {"{nome}"} para personalizar)
              </label>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={8}
                placeholder="<h1>Olá {nome}</h1><p>Sua jornada de paz...</p>"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[var(--adm-navy-deep)] placeholder:text-[var(--adm-text-muted)]/50"
              />
            </div>

            {/* Safe-send: teste primeiro */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Safe-send: envie um teste antes
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={!testEmail || !subject || !html || testMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Teste
                </button>
              </div>
              {testMutation.data && (
                <p
                  className={`mt-2 text-xs ${testMutation.data.sent ? "text-green-600" : "text-red-500"}`}
                >
                  {testMutation.data.sent
                    ? "✓ Email de teste enviado — confira a caixa de entrada"
                    : `✗ ${testMutation.data.error}`}
                </p>
              )}
            </div>

            {/* Enviar pro segmento */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[var(--adm-text-muted)]">
                {selected?.alcancavel ?? 0} contatos serão alcançados por email
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={
                  !campaignId ||
                  !subject ||
                  !html ||
                  !selected?.alcancavel ||
                  campaignMutation.isPending
                }
                className="flex items-center gap-1.5 rounded-lg bg-[var(--adm-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Enviar pro segmento
              </button>
            </div>

            {/* Modal de confirmação */}
            {showConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Confirmar envio
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Vai enviar email para{" "}
                    <strong>{selected?.alcancavel ?? 0} contatos</strong> do
                    segmento "<strong>{selected?.segment_label}</strong>" na
                    campanha "<strong>{campaignId}</strong>".
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Rate-limit: {Math.ceil((selected?.alcancavel ?? 0) / 50)}{" "}
                    batches de até 50. Contatos com opt-out ou que já receberam
                    esta campanha serão ignorados.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => campaignMutation.mutate()}
                      disabled={campaignMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {campaignMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Confirmar envio
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Resultado do envio */}
            {campaignMutation.data && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Resultado do envio
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-lg font-bold text-green-700">
                      {campaignMutation.data.sent}
                    </p>
                    <p className="text-green-600">Enviados</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-500">
                      {campaignMutation.data.skipped}
                    </p>
                    <p className="text-gray-400">Ignorados</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-500">
                      {campaignMutation.data.failed}
                    </p>
                    <p className="text-red-400">Falhas</p>
                  </div>
                </div>
                {campaignMutation.data.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {campaignMutation.data.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500">
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* WhatsApp status */}
      <GlassCard>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">
              WhatsApp Cloud API
            </h2>
            <p className="text-xs text-[var(--adm-text-muted)]">
              Pluggable — configure WHATSAPP_API_TOKEN no Vercel pra ativar
            </p>
          </div>
          <span className="ml-auto rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
            Pendente
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
