import { createFileRoute } from "@tanstack/react-router";
import { TERMS_CONTENT } from "@/lib/legal/content/terms";

export const Route = createFileRoute("/termos-de-uso")({ component: TermsPage });

function TermsPage() {
  return <LegalPage content={TERMS_CONTENT} />;
}

function LegalPage({ content }: { content: { title: string; version: string; sections: { heading: string; body: string }[] } }) {
  return (
    <main className="rdp-app-bg min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl text-[color:var(--deep-purple)]">{content.title}</h1>
        <p className="mt-1 text-[11px] text-[color:var(--amethyst)]">Versao {content.version}</p>
        <div className="mt-6 space-y-4 text-[14px] leading-relaxed text-[color:var(--amethyst)]">
          {content.sections.map((s, i) => (
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
