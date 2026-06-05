import { createFileRoute } from "@tanstack/react-router";
import { RESPONSIBILITY_CONTENT } from "@/lib/legal/content/responsibility";

export const Route = createFileRoute("/termo-de-ciencia")({ component: ResponsibilityPage });

function ResponsibilityPage() {
  return (
    <main className="rdp-app-bg min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl text-[color:var(--deep-purple)]">{RESPONSIBILITY_CONTENT.title}</h1>
        <p className="mt-1 text-[11px] text-[color:var(--amethyst)]">Versao {RESPONSIBILITY_CONTENT.version}</p>
        <div className="mt-6 space-y-4 text-[14px] leading-relaxed text-[color:var(--amethyst)]">
          {RESPONSIBILITY_CONTENT.sections.map((s, i) => (
            <div key={i}>
              <h2 className="font-semibold text-[color:var(--deep-purple)]">{s.heading}</h2>
              <p className="mt-1">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-[11px] text-[color:var(--amethyst)]">Circulo da Paz / TNB</p>
      </div>
    </main>
  );
}
