import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import logoSrc from "@/assets/rotina-de-paz-logo.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha · Rotina de Paz" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  // Supabase coloca o token no hash da URL (#access_token=...&type=recovery)
  // e o cliente já cria a sessão de recovery automaticamente.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Caso o evento já tenha disparado antes do listener:
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pass.length < 6) return setErr("Senha mínima de 6 caracteres.");
    if (pass !== pass2) return setErr("As senhas não coincidem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      setOk(true);
      setTimeout(() => navigate({ to: "/app" }), 1200);
    } catch (e: any) {
      setErr(e?.message || "Não foi possível redefinir a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="rdp-app-bg min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="text-center">
          <img src={logoSrc} alt="Rotina de Paz" width={88} height={88} className="mx-auto h-22 w-22" />
          <p className="mt-3 text-[10px] uppercase tracking-[0.32em] rdp-title-gradient">Rotina de Paz</p>
          <h1 className="mt-2 font-display text-3xl text-[color:var(--deep-purple)]">Nova senha</h1>
          <p className="mt-1 text-[13px] text-[color:var(--amethyst)]">
            {ready ? "Defina sua nova senha abaixo." : "Validando link de recuperação…"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 rdp-light-card rounded-3xl p-6">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Nova senha</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
              <Lock className="h-4 w-4 text-[color:var(--amethyst)]" />
              <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)}
                placeholder="Mínimo 6 caracteres" disabled={!ready}
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Repetir</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
              <Lock className="h-4 w-4 text-[color:var(--amethyst)]" />
              <input type="password" required value={pass2} onChange={(e) => setPass2(e.target.value)}
                placeholder="Confirme a nova senha" disabled={!ready}
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          {err && <p className="mt-3 text-[12px] text-red-600">{err}</p>}
          {ok && <p className="mt-3 text-[12px] text-emerald-700">Senha atualizada! Entrando…</p>}

          <button type="submit" disabled={!ready || loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)] hover:brightness-110 disabled:opacity-60">
            {loading ? "Salvando…" : "Salvar nova senha"} <ChevronRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}