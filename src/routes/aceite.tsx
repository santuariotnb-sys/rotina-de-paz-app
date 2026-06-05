import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Check, LogOut, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordLegalAcceptance } from "@/lib/legal/legal.functions";
import { TERMS_CONTENT } from "@/lib/legal/content/terms";
import { PRIVACY_CONTENT } from "@/lib/legal/content/privacy";
import { RESPONSIBILITY_CONTENT } from "@/lib/legal/content/responsibility";

export const Route = createFileRoute("/aceite")({
  component: AcceptancePage,
});

const DOCS = [
  { key: "responsibility", content: RESPONSIBILITY_CONTENT },
  { key: "terms", content: TERMS_CONTENT },
  { key: "privacy", content: PRIVACY_CONTENT },
] as const;

function AcceptancePage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrolledDocs, setScrolledDocs] = useState<Set<string>>(new Set());
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const allScrolled = DOCS.every((d) => scrolledDocs.has(d.key));

  function handleScroll(key: string) {
    const el = scrollRefs.current[key];
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (atBottom && !scrolledDocs.has(key)) {
      setScrolledDocs((s) => new Set(s).add(key));
    }
  }

  async function handleAccept() {
    if (!checked || !allScrolled || saving) return;
    setSaving(true);
    try {
      await recordLegalAcceptance();
      navigate({ to: "/app" });
    } catch {
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

        <div className="mt-6 space-y-4">
          {DOCS.map((doc) => {
            const done = scrolledDocs.has(doc.key);
            return (
              <div key={doc.key} className="overflow-hidden rounded-2xl rdp-light-card">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--rose-dust)]/20">
                  <h2 className="font-display text-base text-[color:var(--deep-purple)]">{doc.content.title}</h2>
                  {done ? (
                    <span className="text-[10px] font-semibold text-emerald-600">Lido</span>
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[color:var(--amethyst)] animate-bounce" />
                  )}
                </div>
                <div
                  ref={(el) => { scrollRefs.current[doc.key] = el; }}
                  onScroll={() => handleScroll(doc.key)}
                  className="max-h-48 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed text-[color:var(--amethyst)] scrollbar-thin"
                >
                  {doc.content.sections.map((s, i) => (
                    <div key={i} className="mb-3">
                      <p className="font-semibold text-[color:var(--deep-purple)]">{s.heading}</p>
                      <p className="mt-1">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!allScrolled}
              className="mt-0.5 h-5 w-5 rounded border-2 border-[color:var(--gold-warm)] text-[color:var(--gold-warm)] accent-[color:var(--gold-warm)] disabled:opacity-40"
            />
            <span className={"text-[13px] leading-relaxed " + (allScrolled ? "text-[color:var(--deep-purple)]" : "text-[color:var(--amethyst)] opacity-60")}>
              Li e aceito os <strong>Termos de Uso</strong>, a <strong>Politica de Privacidade</strong> e o <strong>Termo de Ciencia e Responsabilidade</strong>.
            </span>
          </label>

          {!allScrolled && (
            <p className="text-[11px] text-[color:var(--amethyst)]">
              Role ate o final de cada documento para habilitar o aceite.
            </p>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || !allScrolled || saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-6 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" />
            {saving ? "Registrando..." : "Aceitar e continuar"}
          </button>

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
