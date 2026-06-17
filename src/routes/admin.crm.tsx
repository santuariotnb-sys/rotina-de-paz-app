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
  ShoppingBag,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import {
  ARCHETYPE_COLORS,
  ARCHETYPE_LABELS,
} from "@/lib/admin/constants";
import {
  getCrmSegments,
  sendCrmTestEmail,
  sendCrmCampaign,
  type CrmSegment,
} from "@/lib/admin/crm.functions";

export const Route = createFileRoute("/admin/crm")({
  component: AdminCrmPage,
});

// ── Helpers ─────────────────────────────────────────────────

function segmentIcon(key: string) {
  if (key === "comprou_sem_upsell") return ShoppingBag;
  if (key === "lead_sem_compra") return Users;
  return Sparkles;
}

function segmentColor(key: string): string {
  const arch = key.replace("arquetipo_", "");
  return ARCHETYPE_COLORS[arch] ?? "#6B7280";
}

function SegmentBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-white/[0.08]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: "currentColor", opacity: 0.6 }}
      />
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────

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

  const testMutation = useMutation({
    mutationFn: () => doSendTest({ data: { to: testEmail, subject, html } }),
  });

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

  // Separate segments
  const leadSegments = (segments ?? []).filter(
    (s) => s.segment_key === "lead_sem_compra" || s.segment_key.startsWith("arquetipo_"),
  );
  const buyerSegments = (segments ?? []).filter(
    (s) => s.segment_key === "comprou_sem_upsell",
  );

  const totalLeads = segments?.find((s) => s.segment_key === "lead_sem_compra");
  const maxAlcancavel = Math.max(...(segments ?? []).map((s) => s.alcancavel), 1);

  // KPIs (non-overlapping)
  const totalAlcancavel =
    (totalLeads?.alcancavel ?? 0) +
    (buyerSegments[0]?.alcancavel ?? 0);
  const totalEmail =
    (totalLeads?.com_email ?? 0) +
    (buyerSegments[0]?.com_email ?? 0);
  const totalWhatsapp = totalLeads?.com_whatsapp ?? 0;

  return (
    <div className="adm-fade-up space-y-6">
      {/* Header */}
      <header>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B7355]"
          style={{ fontFamily: '"Cormorant Garamond", serif' }}
        >
          Primordia · CRM
        </p>
        <h1
          className="mt-1 text-3xl font-semibold text-[#1A1D26]"
          style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: "0.01em" }}
        >
          Remarketing
        </h1>
        <p className="mt-2 text-[13px] text-[#4B5060]">
          Segmente leads e compradores, dispare email com safe-send.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Leads sem compra"
          value={isLoading ? "..." : (totalLeads?.total ?? 0)}
          loading={isLoading}
          accent="blue"
          hint={`${totalLeads?.total ?? 0} no total`}
        />
        <KpiCard
          icon={<Send className="h-5 w-5" />}
          label="Alcançáveis"
          value={isLoading ? "..." : totalAlcancavel}
          loading={isLoading}
          accent="green"
          hint="Email + WhatsApp"
        />
        <KpiCard
          icon={<Mail className="h-5 w-5" />}
          label="Com email"
          value={isLoading ? "..." : totalEmail}
          loading={isLoading}
          accent="amber"
        />
        <KpiCard
          icon={<MessageCircle className="h-5 w-5" />}
          label="Com WhatsApp"
          value={isLoading ? "..." : totalWhatsapp}
          loading={isLoading}
          accent="rose"
          hint="Pluggable — pendente"
        />
      </section>

      {/* ── Segmentos: Leads ────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/10">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">
                Leads sem compra
              </h2>
              <p className="text-[11px] text-white/50">
                Fizeram o quiz mas não compraram
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando segmentos...
            </div>
          ) : (
            <div className="space-y-1.5">
              {leadSegments.map((seg) => {
                const isArch = seg.segment_key.startsWith("arquetipo_");
                const archKey = seg.segment_key.replace("arquetipo_", "");
                const color = isArch ? segmentColor(seg.segment_key) : "#3B82F6";
                const label = isArch
                  ? ARCHETYPE_LABELS[archKey] ?? archKey
                  : "Todos os leads";
                const isSelected = selectedSegment === seg.segment_key;

                return (
                  <button
                    key={seg.segment_key}
                    onClick={() => setSelectedSegment(seg.segment_key)}
                    className={`group w-full rounded-xl px-3.5 py-3 text-left transition-all ${
                      isSelected
                        ? "bg-white/[0.12] ring-1 ring-white/20"
                        : "hover:bg-white/[0.06]"
                    } ${isArch ? "pl-7" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {isArch && (
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        )}
                        <span className="text-[13px] font-medium text-white/90">
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-[13px] font-semibold text-white">
                          {seg.alcancavel}
                        </span>
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition ${
                            isSelected ? "text-white/60" : "text-white/20 group-hover:text-white/40"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="mt-1.5" style={{ color }}>
                      <SegmentBar value={seg.alcancavel} max={maxAlcancavel} />
                    </div>
                    <div className="mt-1.5 flex gap-3 text-[11px] text-white/40">
                      <span>Total {seg.total}</span>
                      <span>Email {seg.com_email}</span>
                      <span>WA {seg.com_whatsapp}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* ── Segmentos: Compradores ────────────────────── */}
        <div className="space-y-6">
          <GlassCard>
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10">
                <ShoppingBag className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-white">
                  Compradores
                </h2>
                <p className="text-[11px] text-white/50">
                  Já compraram — remarketing de upsell
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : buyerSegments.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/30">
                Nenhum segmento de comprador disponível
              </p>
            ) : (
              <div className="space-y-1.5">
                {buyerSegments.map((seg) => {
                  const isSelected = selectedSegment === seg.segment_key;
                  return (
                    <button
                      key={seg.segment_key}
                      onClick={() => setSelectedSegment(seg.segment_key)}
                      className={`group w-full rounded-xl px-3.5 py-3 text-left transition-all ${
                        isSelected
                          ? "bg-white/[0.12] ring-1 ring-white/20"
                          : "hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                          <span className="text-[13px] font-medium text-white/90">
                            Comprou sem upsell
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums text-[13px] font-semibold text-white">
                            {seg.alcancavel}
                          </span>
                          <ChevronRight
                            className={`h-3.5 w-3.5 transition ${
                              isSelected ? "text-white/60" : "text-white/20 group-hover:text-white/40"
                            }`}
                          />
                        </div>
                      </div>
                      <div className="mt-1.5 text-amber-400">
                        <SegmentBar value={seg.alcancavel} max={maxAlcancavel} />
                      </div>
                      <div className="mt-1.5 flex gap-3 text-[11px] text-white/40">
                        <span>Total {seg.total}</span>
                        <span>Email {seg.com_email}</span>
                        <span>Apenas email (Kirvano)</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* WhatsApp status */}
          <GlassCard lift={false}>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20">
                <MessageCircle className="h-4.5 w-4.5 text-green-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-white/80">
                  WhatsApp Cloud API
                </h3>
                <p className="text-[11px] text-white/40">
                  Configure WHATSAPP_API_TOKEN no Vercel
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Pendente
              </span>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ── Compositor ──────────────────────────────────── */}
      {selectedSegment && (
        <GlassCard>
          <div className="mb-5 flex items-center gap-3 border-b border-white/[0.06] pb-4">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{
                background: `${segmentColor(selectedSegment)}20`,
              }}
            >
              <Mail className="h-4 w-4" style={{ color: segmentColor(selectedSegment) }} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">
                Compor mensagem
              </h2>
              <p className="text-[12px] text-white/50">
                {selected?.segment_label} — {selected?.alcancavel ?? 0} alcançáveis
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: Form */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  ID da campanha
                </label>
                <input
                  type="text"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  placeholder="ex: remarketing-jun-2026"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  Assunto
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="{nome}, a paz que você busca está aqui"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  HTML do email <span className="normal-case text-white/25">({"{nome}"} = primeiro nome)</span>
                </label>
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={7}
                  placeholder="<h1>Olá {nome}</h1><p>Sua jornada de paz...</p>"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 font-mono text-xs leading-relaxed text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
                />
              </div>
            </div>

            {/* Right: Safe-send + action */}
            <div className="flex flex-col gap-4">
              {/* Safe-send */}
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-[12px] font-semibold text-amber-300">
                    Safe-send — teste antes de enviar
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none"
                  />
                  <button
                    onClick={() => testMutation.mutate()}
                    disabled={!testEmail || !subject || !html || testMutation.isPending}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/20 px-3.5 py-2 text-[12px] font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-40"
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    Enviar teste
                  </button>
                </div>
                {testMutation.data && (
                  <p
                    className={`mt-2 text-[11px] ${
                      testMutation.data.sent ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {testMutation.data.sent
                      ? "Enviado — confira a caixa de entrada"
                      : testMutation.data.error}
                  </p>
                )}
              </div>

              {/* Result */}
              {campaignMutation.data && (
                <div className="rounded-xl border border-green-500/15 bg-green-500/[0.04] p-4">
                  <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Resultado
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xl font-bold tabular-nums text-green-400">
                        {campaignMutation.data.sent}
                      </p>
                      <p className="text-[10px] text-white/40">Enviados</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold tabular-nums text-white/30">
                        {campaignMutation.data.skipped}
                      </p>
                      <p className="text-[10px] text-white/40">Ignorados</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold tabular-nums text-red-400">
                        {campaignMutation.data.failed}
                      </p>
                      <p className="text-[10px] text-white/40">Falhas</p>
                    </div>
                  </div>
                  {campaignMutation.data.errors.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {campaignMutation.data.errors.map((e, i) => (
                        <p key={i} className="text-[10px] text-red-400/80">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Send action */}
              <div className="mt-auto flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
                <p className="text-[12px] text-white/40">
                  <span className="tabular-nums font-semibold text-white/70">
                    {selected?.alcancavel ?? 0}
                  </span>{" "}
                  contatos por email
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
                  className="flex items-center gap-1.5 rounded-lg bg-white/[0.12] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-white/[0.18] disabled:opacity-30"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar pro segmento
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Modal de confirmação ───────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0D0F14] shadow-2xl">
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h3 className="text-lg font-semibold text-white">
                Confirmar envio
              </h3>
            </div>
            <div className="space-y-3 px-6 py-4">
              <p className="text-sm text-white/70">
                Enviar email para{" "}
                <span className="font-semibold text-white">
                  {selected?.alcancavel ?? 0} contatos
                </span>{" "}
                do segmento{" "}
                <span className="font-semibold text-white">
                  {selected?.segment_label}
                </span>
              </p>
              <p className="text-[11px] text-white/40">
                Campanha: <span className="font-mono text-white/60">{campaignId}</span>
                {" · "}
                {Math.ceil((selected?.alcancavel ?? 0) / 50)} batches de até 50
                {" · "}Opt-outs e dedup aplicados no servidor
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/[0.06] px-6 py-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/70"
              >
                Cancelar
              </button>
              <button
                onClick={() => campaignMutation.mutate()}
                disabled={campaignMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
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
    </div>
  );
}
