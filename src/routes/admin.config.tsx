import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Check, Copy, ExternalLink, ShieldCheck, ShieldAlert, Webhook,
  CheckCircle2, AlertTriangle, Activity, KeyRound,
  Play, Mail, Package, Undo2, Zap,
} from "lucide-react";
import { GlassCard } from "@/components/admin/GlassCard";
import { getIntegrationStatus } from "@/lib/admin/config.functions";
import { sendTestWebhook } from "@/lib/admin/test-webhook.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/config")({
  component: AdminConfigPage,
});

function AdminConfigPage() {
  const fetchStatus = useServerFn(getIntegrationStatus);
  const { data: status, isLoading } = useQuery({
    queryKey: ["admin", "integration-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const [webhookUrl, setWebhookUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/public/webhooks/kirvano`);
    }
  }, []);

  return (
    <div className="adm-fade-up space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Fase 10</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">Configurações &amp; Integrações</h1>
        <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">
          Conexão com Kirvano, segredos da Lovable Cloud e saúde do webhook.
        </p>
      </header>

      <GlassCard className="p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#7C3AED] text-white">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Webhook Kirvano</h2>
            <p className="text-[12px] text-[var(--adm-text-muted)]">
              Cole a URL abaixo no painel da Kirvano em <b>Webhooks → Adicionar</b> e selecione os eventos de venda aprovada / reembolso.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">Endpoint</label>
          <div className="mt-1 flex items-stretch gap-2">
            <input
              readOnly
              value={webhookUrl}
              className="adm-input flex-1 font-mono text-[12px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={webhookUrl} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Row label="Eventos de liberação" value="SALE_APPROVED · PURCHASE_APPROVED" />
          <Row label="Eventos de revogação" value="SALE_REFUNDED · SALE_CHARGEBACK · SALE_CANCELED" />
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center gap-3">
          <div className={
            "grid h-10 w-10 place-items-center rounded-xl text-white " +
            (status?.kirvanoSecretConfigured
              ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
              : "bg-gradient-to-br from-rose-400 to-rose-600")
          }>
            {status?.kirvanoSecretConfigured ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Segredo de assinatura</h2>
            <p className="text-[12px] text-[var(--adm-text-muted)]">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">KIRVANO_WEBHOOK_SECRET</code>{" "}
              {isLoading ? "verificando…"
                : status?.kirvanoSecretConfigured
                  ? "está configurado. As assinaturas HMAC-SHA256 estão sendo validadas."
                  : "ainda não foi configurado. O webhook responderá 503 até cadastrar."}
            </p>
          </div>
          <span className={
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold " +
            (status?.kirvanoSecretConfigured
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700")
          }>
            <KeyRound className="h-3 w-3" />
            {status?.kirvanoSecretConfigured ? "Configurado" : "Pendente"}
          </span>
        </div>

        {!status?.kirvanoSecretConfigured && !isLoading && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
            <p className="font-semibold">Como configurar:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Na Kirvano, copie o <b>secret</b> mostrado ao criar o webhook.</li>
              <li>Volte aqui e peça ao Lovable: <i>"adiciona o secret KIRVANO_WEBHOOK_SECRET"</i>.</li>
              <li>Cole o valor — fica armazenado de forma segura na Lovable Cloud.</li>
            </ol>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Activity} label="Eventos (7 dias)" value={status?.recentWebhooks ?? "—"} tint="blue" />
        <StatCard icon={CheckCircle2} label="Processados" value={status?.recentApproved ?? "—"} tint="emerald" />
        <StatCard icon={AlertTriangle} label="Com erro / inválidos" value={status?.recentFailed ?? "—"} tint="rose" />
      </div>

      <TestEventSection />

      <GlassCard className="p-5">
        <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Próximos passos</h2>
        <p className="mt-1 text-[12px] text-[var(--adm-text-muted)]">
          Tudo o que cada produto precisa para ser entregue automaticamente após a compra:
        </p>
        <ul className="mt-3 space-y-2 text-[13px] text-[var(--adm-navy-deep)]">
          <Step to="/admin/produtos">Cadastrar produto e vincular oferta Kirvano</Step>
          <Step to="/admin/produtos">Salvar o link de checkout em cada produto (para os botões "Comprar")</Step>
          <Step to="/admin/ebooks">Marcar e-books / devocionais com "Produto necessário"</Step>
          <Step to="/admin/webhook-logs">Acompanhar entregas e reprocessar eventos com erro</Step>
        </ul>
      </GlassCard>
    </div>
  );
}

function TestEventSection() {
  const sendTest = useServerFn(sendTestWebhook);
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState("");
  const [eventType, setEventType] = useState<"SALE_APPROVED" | "SALE_REFUNDED">("SALE_APPROVED");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["adm-config-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, slug").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string; slug: string }[];
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !productId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await sendTest({ data: { email, productId, eventType } });
      if (res.ok) {
        setResult({ ok: true, message: `Evento ${eventType} processado para ${res.productName ?? productId}. Entitlement ${eventType === "SALE_APPROVED" ? "concedido" : "revogado"}. Ver em /admin/vendas.` });
      } else {
        setResult({ ok: false, message: "Falha ao processar evento de teste." });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 text-white">
          <Play className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Testar evento de compra</h2>
          <p className="text-[12px] text-[var(--adm-text-muted)]">
            Simule uma venda aprovada (ou reembolso) sem depender do secret Kirvano. O evento será processado como se viesse do webhook real.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <label className="block text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">E-mail do comprador</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Mail className="h-4 w-4 text-slate-300" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full bg-transparent text-[13px] text-[var(--adm-navy-deep)] outline-none placeholder:text-slate-300"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">Produto</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Package className="h-4 w-4 text-slate-300" />
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full bg-transparent text-[13px] text-[var(--adm-navy-deep)] outline-none"
            >
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">Evento</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Zap className="h-4 w-4 text-slate-300" />
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as "SALE_APPROVED" | "SALE_REFUNDED")}
              className="w-full bg-transparent text-[13px] text-[var(--adm-navy-deep)] outline-none"
            >
              <option value="SALE_APPROVED">Venda aprovada</option>
              <option value="SALE_REFUNDED">Reembolso</option>
            </select>
          </div>
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            disabled={sending || !email || !productId}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#7C3AED] px-4 py-2 text-[13px] font-semibold text-white shadow-md hover:brightness-110 disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {sending ? "Processando…" : "Enviar evento de teste"}
          </button>
        </div>
      </form>

      {result && (
        <div className={`mt-4 rounded-xl border p-3 text-[13px] ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          <p className="font-semibold">{result.ok ? "Sucesso" : "Erro"}</p>
          <p className="mt-0.5">{result.message}</p>
        </div>
      )}
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--adm-text-muted)]">{label}</p>
      <p className="mt-0.5 font-mono text-[11px] text-[var(--adm-navy-deep)]">{value}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
      }}
      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#2745D8] px-3 py-2 text-[12px] font-semibold text-white shadow-md hover:brightness-110"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function StatCard({
  icon: Icon, label, value, tint,
}: { icon: typeof Activity; label: string; value: number | string; tint: "blue" | "emerald" | "rose" }) {
  const colors = {
    blue: "from-blue-400 to-blue-600",
    emerald: "from-emerald-400 to-emerald-600",
    rose: "from-rose-400 to-rose-600",
  }[tint];
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${colors} text-white`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--adm-text-muted)]">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-[var(--adm-navy-deep)]">{value}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function Step({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2 hover:bg-slate-50">
      <span className="text-[13px]">{children}</span>
      <Link to={to} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--adm-accent)] hover:underline">
        Abrir <ExternalLink className="h-3 w-3" />
      </Link>
    </li>
  );
}