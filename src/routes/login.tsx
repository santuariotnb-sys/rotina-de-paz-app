import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Mail, Lock, User } from "lucide-react";
import logoSrc from "@/assets/rotina-de-paz-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { syncStudentWithProfile } from "@/lib/student";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar · Rotina de Paz" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // Se já estiver logada, vai direto pro app
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/app" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!session?.user) return;
      try {
        await syncStudentWithProfile(session.user.id, session.user.email ?? null);
      } catch (err) {
        console.error("[login] syncStudentWithProfile failed:", err);
      }
      navigate({ to: "/app" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.includes("@") || pass.length < 6) {
      setErr("E-mail válido e senha de 6+ caracteres.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      }
      // onAuthStateChange cuida do redirect
    } catch (e: any) {
      const msg = e?.message || "Falha ao autenticar.";
      if (/invalid login/i.test(msg)) setErr("E-mail ou senha incorretos.");
      else if (/already registered|already exists/i.test(msg)) setErr("Esse e-mail já tem conta. Tente entrar.");
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) {
        setErr(error.message || "Falha no login com Google.");
        setLoading(false);
      }
    } catch (e: any) {
      setErr(e?.message || "Falha no login com Google.");
      setLoading(false);
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    const target = forgotEmail || email;
    if (!target.includes("@")) return setErr("Informe um e-mail válido.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setInfo("Enviamos o link de recuperação. Confira seu e-mail (e a caixa de spam).");
      setForgotOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Não foi possível enviar o e-mail.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="rdp-app-bg min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="text-center">
          <img src={logoSrc} alt="Rotina de Paz" width={96} height={96} className="mx-auto h-24 w-24" />
          <p className="mt-3 text-[10px] uppercase tracking-[0.32em] rdp-title-gradient">Rotina de Paz</p>
          <h1 className="mt-2 font-display text-3xl text-[color:var(--deep-purple)]">
            {mode === "login" ? "Bem-vinda de volta." : "Crie sua conta."}
          </h1>
          <p className="mt-1 text-[13px] text-[color:var(--amethyst)]">
            {mode === "login" ? "Entre com seu e-mail de compra." : "Acesso imediato após o cadastro."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 rdp-light-card rounded-3xl p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-[color:var(--rose-dust)]/30 p-1">
            <button type="button" onClick={() => setMode("login")}
              className={`rounded-full py-2 text-[12px] font-semibold transition ${mode === "login" ? "bg-white text-[color:var(--deep-purple)] shadow-sm" : "text-[color:var(--amethyst)]"}`}>
              Entrar
            </button>
            <button type="button" onClick={() => setMode("signup")}
              className={`rounded-full py-2 text-[12px] font-semibold transition ${mode === "signup" ? "bg-white text-[color:var(--deep-purple)] shadow-sm" : "text-[color:var(--amethyst)]"}`}>
              Criar conta
            </button>
          </div>

          {mode === "signup" && (
            <label className="mb-4 block">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Nome</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
                <User className="h-4 w-4 text-[color:var(--amethyst)]" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Como podemos te chamar?"
                  className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
              </div>
            </label>
          )}

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">E-mail</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
              <Mail className="h-4 w-4 text-[color:var(--amethyst)]" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Senha</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
              <Lock className="h-4 w-4 text-[color:var(--amethyst)]" />
              <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)}
                placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "••••••••"}
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          {err && <p className="mt-3 text-[12px] text-red-600">{err}</p>}
          {info && <p className="mt-3 text-[12px] text-emerald-700">{info}</p>}

          <button type="submit" disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)] hover:brightness-110 disabled:opacity-60">
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"} <ChevronRight className="h-4 w-4" />
          </button>

          {mode === "login" && (
            <div className="mt-3 text-center">
              <button type="button" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                className="text-[12px] font-medium text-[color:var(--amethyst)] hover:text-[color:var(--gold-warm)] underline">
                Esqueci minha senha
              </button>
            </div>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[color:var(--rose-dust)]/40" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--amethyst)]">ou</span>
            <span className="h-px flex-1 bg-[color:var(--rose-dust)]/40" />
          </div>

          <button type="button" onClick={signInGoogle} disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-[color:var(--rose-dust)]/50 bg-white px-5 py-3 text-[14px] font-semibold text-[color:var(--deep-purple)] shadow-sm hover:bg-white/90 disabled:opacity-60">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8L6.2 32.4C9.5 39.1 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 36 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            Continuar com Google
          </button>

          <p className="mt-5 text-center text-[12px] text-[color:var(--amethyst)]">
            Ainda não fez o quiz? <Link to="/quiz-sacra" className="font-semibold text-[color:var(--gold-warm)] underline">Começar agora</Link>
          </p>
        </form>

        {forgotOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5" onClick={() => setForgotOpen(false)}>
            <form onSubmit={sendReset} onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
              <h2 className="font-display text-xl text-[color:var(--deep-purple)]">Recuperar senha</h2>
              <p className="mt-1 text-[12px] text-[color:var(--amethyst)]">
                Enviamos um link para você criar uma nova senha.
              </p>
              <label className="mt-4 block">
                <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">E-mail</span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white px-3 py-2.5">
                  <Mail className="h-4 w-4 text-[color:var(--amethyst)]" />
                  <input type="email" required autoFocus value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
                </div>
              </label>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setForgotOpen(false)}
                  className="flex-1 rounded-full border border-[color:var(--rose-dust)]/50 bg-white px-4 py-2.5 text-[13px] font-semibold text-[color:var(--deep-purple)]">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-4 py-2.5 text-[13px] font-semibold text-[#2C1F0B] disabled:opacity-60">
                  {loading ? "Enviando…" : "Enviar link"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}