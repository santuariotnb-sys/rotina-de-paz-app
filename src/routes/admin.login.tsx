import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Mail } from "lucide-react";
import primordiaIcon from "@/assets/primordia-icon.webp";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Acesso · Primordia" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Se já tiver sessão admin, vai direto pro painel.
  useEffect(() => {
    (async () => {
      const admin = await getCurrentAdmin();
      if (admin) navigate({ to: "/admin", replace: true });
    })();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.includes("@") || pass.length < 6) {
      setErr("Informe um e-mail válido e senha de 6+ caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      const admin = await getCurrentAdmin();
      if (!admin) {
        await supabase.auth.signOut();
        setErr("Esta conta não tem acesso ao painel administrativo.");
        setLoading(false);
        return;
      }
      await logAdminAction("admin.login", { metadata: { email } });
      navigate({ to: "/admin", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao entrar.";
      setErr(/invalid login/i.test(msg) ? "E-mail ou senha incorretos." : msg);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={primordiaIcon} alt="Primordia" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-semibold text-[var(--adm-navy-deep)]">Primordia</h1>
          <p className="text-[13px] text-[var(--adm-text-muted)]">
            Acesso restrito. Somente administradores autorizados.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="adm-glass space-y-4 p-6">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
              E-mail
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@dominio.com"
                className="flex-1 bg-transparent text-[14px] text-[var(--adm-navy-deep)] outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
              Senha
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5">
              <Lock className="h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-[14px] text-[var(--adm-navy-deep)] outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          {err && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{err}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#2745D8] px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Verificando…" : "Entrar no painel"}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-[var(--adm-text-muted)]">
          Tentativas de acesso são registradas para fins de auditoria.
        </p>
      </div>
    </div>
  );
}