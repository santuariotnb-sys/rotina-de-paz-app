import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Play, Cross } from "lucide-react";
import { devocionaisQueryOptions } from "@/lib/app-queries";

export const Route = createFileRoute("/app/devocionais")({
  loader: ({ context }) => {
    const qc = (context as { queryClient: QueryClient }).queryClient;
    void qc.ensureQueryData(devocionaisQueryOptions);
  },
  component: DevocionaisPage,
  pendingComponent: DevocionaisSkeleton,
});

function DevocionaisPage() {
  const { data: items = [], isLoading } = useQuery(devocionaisQueryOptions);
  const firstRef = useRef(true);
  const first = firstRef.current;
  firstRef.current = false;

  return (
    <div className={first ? "" : "rdp-no-anim"}>
      {/* Header imersivo */}
      <section className="rdp-fade-up relative -mx-4 mt-2 overflow-hidden rounded-b-[2rem] bg-[#1A1326] px-6 pb-7 pt-8 sm:mx-0 sm:mt-5 sm:rounded-[2rem] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(201,168,118,0.30),transparent_60%),radial-gradient(80%_60%_at_0%_100%,rgba(212,165,181,0.22),transparent_60%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#E8C9A0] ring-1 ring-white/15">
            <Cross className="h-3.5 w-3.5" /> Jornada de fé
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] leading-[1.05] text-white">
            Devocionais de Fé
          </h1>
          <p className="mt-1.5 text-[13px] text-white/70">
            Jornadas em vídeo para crescimento espiritual
          </p>
        </div>
      </section>

      {isLoading && (
        <p className="mt-8 text-center text-[13px] text-[color:var(--amethyst)]">
          Carregando devocionais…
        </p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="mt-8 text-center text-[13px] text-[color:var(--amethyst)]">
          Nenhum devocional disponível ainda.
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((d, i) => (
          <Link
            key={d.id}
            to="/app/devocional/$slug"
            params={{ slug: d.slug }}
            className="group relative block overflow-hidden rounded-3xl rdp-fade-up shadow-[0_16px_40px_-20px_rgba(90,60,90,0.5)]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="relative aspect-[3/4]" style={{ background: d.cover }}>
              <div className="absolute inset-0 bg-gradient-to-t from-[#241B2E]/92 via-[#241B2E]/25 to-transparent" />
              <span className="absolute left-3.5 top-3.5 rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold-ink)] backdrop-blur">
                {d.badge}
              </span>

              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="font-display text-[1.7rem] leading-none">{d.title}</p>
                <p className="mt-2 text-[12.5px] text-white/75">{d.subtitle}</p>
                <p className="mt-1 text-[11px] text-[#E8C9A0]">
                  {d.days} dias · {d.modules} módulo{d.modules > 1 ? "s" : ""}
                </p>
                <span className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-lg transition group-hover:scale-[1.02]">
                  <Play className="h-4 w-4 translate-x-[1px] fill-current" /> Assistir
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DevocionaisSkeleton() {
  return (
    <div className="mt-5 animate-pulse">
      <div className="-mx-4 h-36 rounded-b-[2rem] bg-[#1A1326]/90 sm:mx-0 sm:rounded-[2rem]" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-[3/4] rounded-3xl bg-[color:var(--rose-dust)]/12" />
        ))}
      </div>
    </div>
  );
}
