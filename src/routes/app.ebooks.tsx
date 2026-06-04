import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ShoppingCart, Download, ChevronRight } from "lucide-react";
import { type Ebook } from "@/data/ebooks";
import { supabase } from "@/integrations/supabase/client";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";
import { checkoutFor, useProductCheckouts } from "@/hooks/useProductCheckouts";

export const Route = createFileRoute("/app/ebooks")({
  component: EbooksPage,
});

const FALLBACK_COVER = "linear-gradient(135deg,#D4A5B5 0%,#C9A876 100%)";

type EbookExt = Ebook & {
  requiredProductId: string | null;
  fileUrl: string | null;
  description: string | null;
};

function EbooksPage() {
  const { data: ebooks = [], isLoading } = useQuery<EbookExt[]>({
    queryKey: ["app", "ebooks"],
    queryFn: async (): Promise<EbookExt[]> => {
      const { data, error } = await supabase
        .from("ebooks")
        .select("id, title, subtitle, category, price_cents, badge, cover_url, sort_order, required_product_id, file_url, description")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle ?? "",
        category: (r.category ?? "bonus") as Ebook["category"],
        price: r.price_cents > 0 ? `R$ ${(r.price_cents / 100).toFixed(2).replace(".", ",")}` : undefined,
        badge: r.badge ?? undefined,
        cover: r.cover_url ? `url(${r.cover_url}) center/cover` : FALLBACK_COVER,
        requiredProductId: r.required_product_id ?? null,
        fileUrl: r.file_url ?? null,
        description: r.description ?? null,
      }));
    },
  });

  const { data: owned } = useEntitlements();
  const { data: checkouts } = useProductCheckouts();

  const colecao = ebooks.filter((e) => e.category === "colecao");
  const bonus = ebooks.filter((e) => e.category === "bonus");
  const embreve = ebooks.filter((e) => e.category === "embreve");

  return (
    <>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Biblioteca</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">E-books</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Bonus inclusos e colecao Rotina de Paz</p>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Carregando biblioteca...</p>
      )}

      {!isLoading && ebooks.length === 0 && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Nenhum e-book disponivel ainda.</p>
      )}

      <Shelf title="Bonus inclusos" items={bonus} owned={owned} checkouts={checkouts} />
      <Shelf title="Colecao Rotina de Paz" items={colecao} owned={owned} checkouts={checkouts} />
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
    <section className="mt-8 rdp-fade-up">
      <h3 className="mb-3 font-display text-xl text-[color:var(--deep-purple)]">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((e) => (
          <EbookCard key={e.id} ebook={e} owned={owned} checkouts={checkouts} />
        ))}
      </div>
    </section>
  );
}

function EbookCard({
  ebook: e, owned, checkouts,
}: {
  ebook: EbookExt;
  owned: Set<string> | undefined;
  checkouts: Map<string, string> | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const unlocked = isUnlocked(owned, e.requiredProductId);
  const buyUrl = !unlocked ? checkoutFor(checkouts, e.requiredProductId) : null;

  function handleTap() {
    if (unlocked && e.fileUrl) {
      window.open(e.fileUrl, "_blank", "noopener");
    } else if (!unlocked) {
      setExpanded((v) => !v);
    }
  }

  function handleDownload(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!e.fileUrl) return;
    const a = document.createElement("a");
    a.href = e.fileUrl;
    a.download = `${e.title}.pdf`;
    a.click();
  }

  return (
    <div className={expanded ? "col-span-3" : ""}>
      {/* Expanded: horizontal layout */}
      {expanded ? (
        <div className="overflow-hidden rounded-2xl rdp-light-card shadow-[0_12px_30px_-15px_rgba(117,97,127,0.45)]">
          <div className="grid grid-cols-[120px,1fr]">
            <button type="button" onClick={handleTap} className="relative aspect-[2/3]">
              <div className="absolute inset-0" style={{ background: e.cover }} />
              {e.price && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[color:var(--gold-warm)] px-2.5 py-1 text-[10px] font-bold text-white shadow">
                  {e.price}
                </span>
              )}
            </button>
            <div className="flex flex-col justify-center p-4">
              <p className="font-display text-lg leading-tight text-[color:var(--deep-purple)]">{e.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--amethyst)]">
                {e.description || e.subtitle}
              </p>
              {buyUrl && (
                <a
                  href={buyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-4 py-2 text-[12px] font-semibold text-[#2C1F0B] shadow-[0_4px_14px_-6px_rgba(201,168,118,0.55)] hover:brightness-110"
                >
                  Garantir meu e-book <ChevronRight className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="mt-2 self-start text-[11px] text-[color:var(--amethyst)] underline underline-offset-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed: thumbnail card */
        <button
          type="button"
          onClick={handleTap}
          className="group block w-full text-left"
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl shadow-[0_12px_30px_-15px_rgba(117,97,127,0.45)] transition group-hover:-translate-y-1">
            <div className="absolute inset-0" style={{ background: e.cover }} />

            {/* Locked: price badge — NO blur, cover stays visible */}
            {!unlocked && e.price && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent pb-3 pt-8">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[color:var(--deep-purple)] shadow">
                  <ShoppingCart className="h-3 w-3 text-[color:var(--gold-warm)]" /> {e.price}
                </span>
              </div>
            )}

            {/* Unlocked: Ler + download */}
            {unlocked && e.fileUrl && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                  <BookOpen className="h-3.5 w-3.5" /> Ler
                </span>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white hover:bg-white/40"
                  title="Baixar PDF"
                >
                  <Download className="h-3 w-3" />
                </button>
              </div>
            )}

            {e.badge && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[color:var(--gold-warm)]">{e.badge}</span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] font-medium leading-tight text-[color:var(--deep-purple)]">{e.title}</p>
          {unlocked && <p className="text-[10px] font-semibold text-emerald-600">Liberado</p>}
        </button>
      )}
    </div>
  );
}
