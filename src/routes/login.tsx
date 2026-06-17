import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Mail, Lock, User, RefreshCw } from "lucide-react";
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

// ── Helper: erro cru → mensagem humana ──────────────────────
function friendlyAuthError(e: unknown): string {
  const msg = (e as any)?.message ?? (e as any)?.error_description ?? "";
  const s = typeof msg === "string" ? msg : String(msg);

  if (/invalid login/i.test(s)) return "E-mail ou senha incorretos.";
  if (/already registered|already exists/i.test(s))
    return "Esse e-mail já tem conta. Toque em Entrar.";
  if (/email not confirmed/i.test(s))
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
  if (/rate limit|too many requests|429/i.test(s))
    return "Muitas tentativas. Aguarde 1 minuto e tente de novo.";
  if (/for security purposes|you can only request this after|after \d+ seconds|email rate limit|over_email_send/i.test(s))
    return "Aguarde alguns segundos antes de tentar de novo.";
  if (
    /failed to fetch|load failed|network|timeout|aborted/i.test(s) ||
    e instanceof TypeError
  )
    return "Não conseguimos conectar. Confira sua internet e toque em Tentar de novo.";
  if (/weak password|at least/i.test(s))
    return "Senha muito fraca — use pelo menos 6 caracteres.";
  if (/invalid email/i.test(s)) return "E-mail inválido. Confira e tente de novo.";

  return "Algo não saiu como esperado. Tente de novo — se persistir, fale com o suporte.";
}

// ── Timeout wrapper (15s) ───────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

type UiState =
  | "idle"
  | "submitting"
  | "needs_confirm"
  | "already_exists"
  | "error";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ui, setUi] = useState<UiState>("idle");
  const [info, setInfo] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resending, setResending] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);

  const loading = ui === "submitting";

  // Se já estiver logada, vai direto pro app. Dedup pra getSession + onAuthStateChange
  useEffect(() => {
    let active = true;
    let navigated = false;
    const go = () => {
      if (!active || navigated) return;
      navigated = true;
      navigate({ to: "/app" });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) return;
      syncStudentWithProfile(session.user.id, session.user.email ?? null).catch(
        () => {},
      );
      go();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Foco no bloco de erro quando aparece (a11y)
  useEffect(() => {
    if (err) errRef.current?.focus();
  }, [err]);

  const clearFeedback = () => {
    setErr(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!email.includes("@") || pass.length < 6) {
      setErr("E-mail válido e senha de 6+ caracteres.");
      setUi("error");
      return;
    }
    setUi("submitting");
    try {
      if (mode === "signup") {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password: pass,
            options: {
              emailRedirectTo: `${window.location.origin}/app`,
              data: { name: name || email.split("@")[0] },
            },
          }),
        );
        if (error) throw error;

        // Email já cadastrado → Supabase retorna identities: []
        if (data.user?.identities?.length === 0) {
          setUi("already_exists");
          return;
        }

        // Confirm email ON → session é null, email enviado
        if (!data.session) {
          setUi("needs_confirm");
          return;
        }

        // Confirm email OFF → sessão já veio, onAuthStateChange redireciona
        setUi("idle");
      } else {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password: pass }),
        );
        if (error) throw error;
        // onAuthStateChange cuida do redirect
        setUi("idle");
      }
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
      setUi("error");
    }
  };

  const signInGoogle = async () => {
    clearFeedback();
    setUi("submitting");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) throw error;
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
      setUi("error");
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    const target = forgotEmail || email;
    if (!target.includes("@")) {
      setErr("Informe um e-mail válido.");
      return;
    }
    setUi("submitting");
    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(target, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      );
      if (error) throw error;
      setInfo(
        "Enviamos o link de recuperação. Confira seu e-mail (e a caixa de spam).",
      );
      setForgotOpen(false);
      setUi("idle");
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
      setUi("error");
    }
  };

  const resendConfirmation = async () => {
    setResending(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resend({ type: "signup", email }),
      );
      if (error) throw error;
      setInfo("E-mail reenviado! Confira sua caixa de entrada e o spam.");
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
    } finally {
      setResending(false);
    }
  };

  const switchToLogin = () => {
    clearFeedback();
    setMode("login");
    setUi("idle");
  };

  // ── Telas especiais ──────────────────────────────────────

  if (ui === "needs_confirm") {
    return (
      <main className="rdp-app-bg grid min-h-dvh place-items-center px-5 py-10">
        <div className="w-full max-w-md text-center">
          <img src={logoSrc} alt="Rotina de Paz" width={96} height={96} className="mx-auto h-24 w-24" />
          <h1 className="mt-6 font-display text-2xl text-[color:var(--deep-purple)]">
            📧 Quase lá!
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--amethyst)] leading-relaxed">
            Enviamos um link de confirmação para{" "}
            <strong className="text-[color:var(--deep-purple)]">{email}</strong>.
            <br />
            Abra seu e-mail e clique no link para entrar.
          </p>
          <p className="mt-2 text-[12px] text-[color:var(--amethyst)]/70">
            Não encontrou? Confira a caixa de spam.
          </p>

          {info && (
            <p className="mt-3 text-[12px] text-emerald-700" role="status">
              {info}
            </p>
          )}
          {err && (
            <p className="mt-3 text-[12px] text-red-600" role="alert">
              {err}
            </p>
          )}

          <button
            onClick={resendConfirmation}
            disabled={resending}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-6 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
            {resending ? "Reenviando…" : "Reenviar e-mail"}
          </button>

          <button
            onClick={() => { clearFeedback(); setUi("idle"); }}
            className="mt-3 block w-full text-[12px] font-medium text-[color:var(--amethyst)] underline"
          >
            Voltar
          </button>
        </div>
      </main>
    );
  }

  if (ui === "already_exists") {
    return (
      <main className="rdp-app-bg grid min-h-dvh place-items-center px-5 py-10">
        <div className="w-full max-w-md text-center">
          <img src={logoSrc} alt="Rotina de Paz" width={96} height={96} className="mx-auto h-24 w-24" />
          <h1 className="mt-6 font-display text-2xl text-[color:var(--deep-purple)]">
            Você já tem conta!
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--amethyst)] leading-relaxed">
            O e-mail{" "}
            <strong className="text-[color:var(--deep-purple)]">{email}</strong>{" "}
            já está cadastrado (provavelmente criado na sua compra).
          </p>
          <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">
            Toque em <strong>Entrar</strong> ou use{" "}
            <strong>Esqueci a senha</strong> pra criar sua senha.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={switchToLogin}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)]"
            >
              Entrar com minha conta <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                switchToLogin();
                setForgotEmail(email);
                setForgotOpen(true);
              }}
              className="text-[13px] font-medium text-[color:var(--amethyst)] underline"
            >
              Esqueci minha senha
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Formulário principal ──────────────────────────────────

  return (
    <main className="rdp-app-bg min-h-dvh w-full overflow-x-hidden grid place-items-center px-5 py-10">
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
            <button type="button" onClick={() => { setMode("login"); clearFeedback(); setUi("idle"); }}
              className={`rounded-full py-2 text-[12px] font-semibold transition ${mode === "login" ? "bg-white text-[color:var(--deep-purple)] shadow-sm" : "text-[color:var(--amethyst)]"}`}>
              Entrar
            </button>
            <button type="button" onClick={() => { setMode("signup"); clearFeedback(); setUi("idle"); }}
              className={`rounded-full py-2 text-[12px] font-semibold transition ${mode === "signup" ? "bg-white text-[color:var(--deep-purple)] shadow-sm" : "text-[color:var(--amethyst)]"}`}>
              Criar conta
            </button>
          </div>

          {/* Microcopy — guia do comprador */}
          {mode === "login" && (
            <p className="mb-4 rounded-xl bg-[color:var(--rose-dust)]/15 px-4 py-2.5 text-[12px] text-[color:var(--amethyst)] leading-relaxed">
              Comprou? Use o e-mail da compra. Primeiro acesso? Toque em{" "}
              <button type="button" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                className="font-semibold text-[color:var(--gold-warm)] underline">
                Esqueci a senha
              </button>{" "}
              pra criar a sua.
            </p>
          )}

          {mode === "signup" && (
            <label className="mb-4 block">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Nome</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
                <User className="h-4 w-4 text-[color:var(--amethyst)]" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
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
                autoComplete="email"
                placeholder="voce@email.com"
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Senha</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--rose-dust)]/40 bg-white/80 px-3 py-2.5">
              <Lock className="h-4 w-4 text-[color:var(--amethyst)]" />
              <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "••••••••"}
                className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
            </div>
          </label>

          {/* Bloco de feedback — aria-live para a11y */}
          <div ref={errRef} tabIndex={-1} aria-live="polite" className="outline-none">
            {err && (
              <p className="mt-3 text-[12px] text-red-600" role="alert">{err}</p>
            )}
            {info && (
              <p className="mt-3 text-[12px] text-emerald-700" role="status">{info}</p>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)] hover:brightness-110 disabled:opacity-60">
            {loading
              ? mode === "login" ? "Entrando…" : "Criando conta…"
              : mode === "login" ? "Entrar" : "Criar conta"}{" "}
            <ChevronRight className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
          </button>

          {mode === "login" && !loading && (
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
                    autoComplete="email"
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/50" />
                </div>
              </label>
              {err && <p className="mt-3 text-[12px] text-red-600" role="alert">{err}</p>}
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
