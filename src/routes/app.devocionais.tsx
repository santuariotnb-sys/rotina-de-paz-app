import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { type Devocional } from "@/data/devocionais";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/devocionais")({
  component: DevocionaisPage,
});

const FALLBACK_COVER = "linear-gradient(135deg,#C9A876 0%,#443A52 100%)";

type DevExt = Devocional & { slug: string; requiredProductId: string | null };

function DevocionaisPage() {
  const { data: items = [], isLoading } = useQuery<DevExt[]>({
    queryKey: ["app", "devocionais"],
    queryFn: async (): Promise<DevExt[]> => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, subtitle, slug, days, modules, badge, cover_url, sort_order, required_product_id")
        .eq("status", "active")
        .eq("kind", "devocional")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle ?? "",
        slug: r.slug,
        days: r.days ?? 0,
        modules: r.modules ?? 1,
        badge: r.badge ?? "DEVOCIONAL",
        cover: r.cover_url ? `url(${r.cover_url}) center/cover` : FALLBACK_COVER,
        requiredProductId: r.required_product_id ?? null,
      }));
    },
  });

  return (
    <>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Jornada de Transformação</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">Devocionais de Fé</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Jornadas em vídeo para crescimento espiritual</p>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Carregando devocionais…</p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Nenhum devocional disponível ainda.</p>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((d, i) => (
          <Link key={d.id} to="/app/devocional/$slug" params={{ slug: d.slug }} className="mx-auto block w-full max-w-[260px] overflow-hidden rounded-3xl rdp-light-card rdp-light-card-hover rdp-fade-up sm:max-w-none" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="relative aspect-[3/4]" style={{ background: d.cover }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[color:var(--gold-warm)]">{d.badge}</span>
              <div className="absolute inset-x-4 bottom-4 text-white">
                <p className="font-display text-2xl leading-tight">{d.title}</p>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[12px] text-[color:var(--amethyst)]">{d.subtitle}</p>
              <p className="mt-1 text-[11px] text-[color:var(--amethyst)]/70">{d.days} dias · {d.modules} módulo{d.modules > 1 ? "s" : ""}</p>
              <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-4 py-2.5 text-[13px] font-semibold text-[#2C1F0B] hover:brightness-110">
                <Play className="h-4 w-4 fill-current" /> Assistir
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}