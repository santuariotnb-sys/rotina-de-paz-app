import { createFileRoute } from "@tanstack/react-router";
import { Quote, Star } from "lucide-react";

export const Route = createFileRoute("/app/depoimentos")({
  component: DepoimentosPage,
});

const ITEMS = [
  { name: "Mariana, 38", text: "Pela primeira vez em meses dormi a noite inteira. O Dia 4 mudou alguma coisa que eu não consigo explicar." },
  { name: "Cláudia, 45", text: "Eu chorava todo dia escondida. Hoje eu choro de gratidão. Obrigada por esse caminho." },
  { name: "Patrícia, 32", text: "A oração voltou a fazer sentido. Senti Deus me ouvindo de novo." },
];

function DepoimentosPage() {
  return (
    <>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Comunidade</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">Depoimentos</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Histórias de mulheres que andaram o caminho</p>
      </div>
      <ol className="mt-8 grid gap-4 md:grid-cols-2">
        {ITEMS.map((t, i) => (
          <li key={i} className="rdp-light-card rounded-3xl p-6 rdp-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <Quote className="h-6 w-6 text-[color:var(--gold-warm)]" />
            <p className="mt-3 font-display italic text-[17px] leading-relaxed text-[color:var(--deep-purple)]">"{t.text}"</p>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-[color:var(--amethyst)]">{t.name}</p>
              <div className="flex gap-0.5 text-[color:var(--gold-warm)]">
                {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-3.5 w-3.5 fill-current" />)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}