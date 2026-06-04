import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Lock, ShoppingCart, Download } from "lucide-react";
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
        price: r.price_cents > 0 ? `R$ ${(r.price_cents / 100).toFixed(2).replace(".", ",")}` : undefined,
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

  return (
    <>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Biblioteca</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">E-books</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Bônus inclusos e nova coleção Rotina de Paz</p>
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
    <section className="mt-8">
      <h3 className="mb-3 font-display text-xl text-[color:var(--deep-purple)]">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
  const unlocked = isUnlocked(owned, e.requiredProductId);
  const buyUrl = !unlocked ? checkoutFor(checkouts, e.requiredProductId) : null;

  function handleClick() {
    if (unlocked && e.fileUrl) {
      window.open(e.fileUrl, "_blank", "noopener");
    } else if (buyUrl) {
      window.open(buyUrl, "_blank", "noopener");
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

  const clickable = (unlocked && e.fileUrl) || buyUrl;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!clickable}
      className="group block w-full text-left disabled:cursor-default"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl shadow-[0_12px_30px_-15px_rgba(117,97,127,0.45)] transition group-hover:-translate-y-1 group-disabled:group-hover:translate-y-0">
        <div className="absolute inset-0" style={{ background: e.cover }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Locked overlay */}
        {!unlocked && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">
            {buyUrl ? (
              <div className="flex flex-col items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[#3B5BFD] shadow-lg">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#3B5BFD]">
                  {e.price}
                </span>
              </div>
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[color:var(--gold-warm)] shadow-lg">
                <Lock className="h-4 w-4" />
              </div>
            )}
          </div>
        )}

        {/* Unlocked: read + download buttons */}
        {unlocked && e.fileUrl && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">
              <BookOpen className="h-3.5 w-3.5" /> Ler
            </span>
            <button
              type="button"
              onClick={handleDownload}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/40"
              title="Baixar PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {e.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--gold-warm)]">{e.badge}</span>
        )}
      </div>
      <p className="mt-2 font-display text-[13px] leading-tight text-[color:var(--deep-purple)]">{e.title}</p>
      <p className="text-[11px] text-[color:var(--amethyst)] truncate">{e.subtitle}</p>
      {unlocked && <p className="text-[11px] font-semibold text-emerald-600">Liberado</p>}
    </button>
  );
}
