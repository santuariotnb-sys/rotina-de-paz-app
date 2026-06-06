import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordLegalAcceptance } from "@/lib/legal/legal.functions";
import { TERMS_CONTENT } from "@/lib/legal/content/terms";
import { PRIVACY_CONTENT } from "@/lib/legal/content/privacy";
import { RESPONSIBILITY_CONTENT } from "@/lib/legal/content/responsibility";

export const Route = createFileRoute("/aceite")({
  component: AcceptancePage,
});

const DOCS = [RESPONSIBILITY_CONTENT, TERMS_CONTENT, PRIVACY_CONTENT];

function AcceptancePage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || scrolledToEnd) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) {
      setScrolledToEnd(true);
    }
  }

  async function handleAccept() {
    if (!checked || !scrolledToEnd || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await recordLegalAcceptance();
      navigate({ to: "/app" });
    } catch (e) {
      console.error("[aceite] recordLegalAcceptance falhou:", e);
      setErr("Não foi possível registrar o aceite. Verifique sua conexão e tente de novo.");
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <main className="rdp-app-bg min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Circulo da Paz</p>
          <h1 className="mt-1 font-display text-3xl rdp-title-gradient">Antes de comecar</h1>
          <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">
            Para acessar o conteudo, leia e aceite os termos abaixo.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl rdp-light-card">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[50vh] overflow-y-auto px-5 py-4 text-[12px] leading-relaxed text-[color:var(--amethyst)] scrollbar-thin"
          >
            {DOCS.map((doc, di) => (
              <div key={di} className={di > 0 ? "mt-6 pt-6 border-t border-[color:var(--rose-dust)]/20" : ""}>
                <h2 className="font-display text-lg text-[color:var(--deep-purple)]">{doc.title}</h2>
                <p className="mt-1 text-[10px] text-[color:var(--amethyst)]">Versao {doc.version}</p>
                {doc.sections.map((s, si) => (
                  <div key={si} className="mt-3">
                    <h3 className="text-[12px] font-semibold text-[color:var(--deep-purple)]">{s.heading}</h3>
                    <p className="mt-1">{s.body}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {!scrolledToEnd && (
            <p className="text-center text-[11px] text-[color:var(--amethyst)]">
              Role ate o final do documento para habilitar o aceite.
            </p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!scrolledToEnd}
              className="mt-0.5 h-5 w-5 rounded border-2 border-[color:var(--gold-warm)] text-[color:var(--gold-warm)] accent-[color:var(--gold-warm)] disabled:opacity-40"
            />
            <span className={"text-[13px] leading-relaxed " + (scrolledToEnd ? "text-[color:var(--deep-purple)]" : "text-[color:var(--amethyst)] opacity-60")}>
              Li e aceito os <strong>Termos de Uso</strong>, a <strong>Politica de Privacidade</strong> e o <strong>Termo de Ciencia e Responsabilidade</strong>.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked || !scrolledToEnd || saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-6 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" />
            {saving ? "Registrando..." : "Aceitar e continuar"}
          </button>

          {err && (
            <p className="text-center text-[12px] font-medium text-rose-600">{err}</p>
          )}

          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--rose-dust)]/40 px-6 py-2.5 text-[13px] text-[color:var(--amethyst)] hover:bg-white/50"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>

        <p className="mt-6 text-center text-[10px] text-[color:var(--amethyst)]">
          <a href="/termos-de-uso" target="_blank" className="underline">Termos de Uso</a>
          {" · "}
          <a href="/politica-de-privacidade" target="_blank" className="underline">Privacidade</a>
          {" · "}
          <a href="/termo-de-ciencia" target="_blank" className="underline">Ciencia</a>
        </p>
      </div>
    </main>
  );
}
