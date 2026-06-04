import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, BookOpen, Lock, ShoppingCart } from "lucide-react";
import { type Ebook } from "@/data/ebooks";
import { supabase } from "@/integrations/supabase/client";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";
import { checkoutFor, useProductCheckouts } from "@/hooks/useProductCheckouts";

export const Route = createFileRoute("/app/ebooks")({
  component: EbooksPage,
});

const FALLBACK_COVER = "linear-gradient(135deg,#D4A5B5 0%,#C9A876 100%)";

type EbookExt = Ebook & { requiredProductId: string | null; fileUrl: string | null };

function EbooksPage() {
  const { data: ebooks = [], isLoading } = useQuery<EbookExt[]>({
    queryKey: ["app", "ebooks"],
    queryFn: async (): Promise<EbookExt[]> => {
      const { data, error } = await supabase
        .from("ebooks")
        .select("id, title, subtitle, category, price_cents, badge, cover_url, sort_order, required_product_id, file_url")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle ?? "",
        category: (r.category ?? "bonus") as Ebook["category"],
        price: r.price_cents > 0 ? `R$ ${(r.price_cents / 100).toFixed(0)}` : undefined,
        badge: r.badge ?? undefined,
        cover: r.cover_url ? `url(${r.cover_url}) center/cover` : FALLBACK_COVER,
        requiredProductId: r.required_product_id ?? null,
        fileUrl: r.file_url ?? null,
      }));
    },
  });

  const { data: owned } = useEntitlements();
  const { data: checkouts } = useProductCheckouts();

  const colecao = ebooks.filter((e) => e.category === "colecao");
  const bonus = ebooks.filter((e) => e.category === "bonus");
  const embreve = ebooks.filter((e) => e.category === "embreve");
  const featured = colecao[0] ?? bonus[0] ?? ebooks[0];

  return (
    <>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Biblioteca</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">E-books</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Bônus inclusos e nova coleção Rotina de Paz</p>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Carregando biblioteca…</p>
      )}

      {!isLoading && !featured && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Nenhum e-book disponível ainda.</p>
      )}

      {/* Hero */}
      {featured && (
      <div className="mt-6 overflow-hidden rounded-3xl rdp-light-card rdp-fade-up">
        <div className="grid md:grid-cols-[1fr,1.5fr]">
          <div className="aspect-[3/4] md:aspect-auto md:min-h-[260px]" style={{ background: featured.cover }}>
            <div className="h-full w-full bg-gradient-to-t from-black/30 to-transparent" />
          </div>
          <div className="flex flex-col justify-center p-6">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--gold-warm)]">Em destaque</p>
            <h2 className="mt-1 font-display text-3xl text-[color:var(--deep-purple)]">{featured.title}</h2>
            <p className="mt-2 text-[14px] text-[color:var(--amethyst)]">{featured.subtitle}</p>
            <div className="mt-4 flex items-center gap-3">
              <button className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] hover:brightness-110">
                <BookOpen className="h-4 w-4" /> {featured.price ? `Comprar ${featured.price}` : "Ler agora"}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      <Shelf title="Bônus inclusos" items={bonus} owned={owned} checkouts={checkouts} />
      <Shelf title="Coleção Rotina de Paz" items={colecao} owned={owned} checkouts={checkouts} />
      <Shelf title="Em breve" items={embreve} owned={owned} checkouts={checkouts} />
    </>
  );
}

function Shelf({
  title, items, owned, checkouts,
}: {
  title: string;
  items: EbookExt[];
  owned: Set<string> | undefined;
  checkouts: Map<string, string> | undefined;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-xl text-[color:var(--deep-purple)]">{title}</h3>
        <div className="flex gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--rose-dust)]/40 text-[color:var(--amethyst)] hover:bg-white/70"><ChevronLeft className="h-4 w-4" /></button>
          <button className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--rose-dust)]/40 text-[color:var(--amethyst)] hover:bg-white/70"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {items.map((e) => {
          const unlocked = isUnlocked(owned, e.requiredProductId);
          const buyUrl = !unlocked ? checkoutFor(checkouts, e.requiredProductId) : null;
          return (
          <a
            key={e.id}
            href={buyUrl ?? undefined}
            target={buyUrl ? "_blank" : undefined}
            rel={buyUrl ? "noopener noreferrer" : undefined}
            className="group block w-[180px] shrink-0 snap-start text-left"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl shadow-[0_12px_30px_-15px_rgba(117,97,127,0.45)] transition group-hover:-translate-y-1">
              <div className="absolute inset-0" style={{ background: e.cover }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              {!unlocked && (
                <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">
                  {buyUrl ? (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[#3B5BFD] shadow-lg">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[color:var(--gold-warm)] shadow-lg">
                      <Lock className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )}
              {e.badge && (
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--gold-warm)]">{e.badge}</span>
              )}
              <div className="absolute inset-x-3 bottom-3 text-white">
                <p className="font-display text-base leading-tight">{e.title}</p>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--amethyst)] truncate">{e.subtitle}</p>
            {e.price && !unlocked && (
              <p className={"text-[11px] font-semibold " + (buyUrl ? "text-[#3B5BFD]" : "text-[color:var(--gold-warm)]")}>
                {buyUrl ? `Comprar · ${e.price}` : e.price}
              </p>
            )}
            {unlocked && e.price && <p className="text-[11px] font-semibold text-emerald-600">Liberado</p>}
          </a>
          );
        })}
      </div>
    </section>
  );
}
