import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { BookOpen, ShoppingCart, ChevronRight, Loader2 } from "lucide-react";
import { type Ebook } from "@/data/ebooks";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";
import { checkoutFor, useProductCheckouts } from "@/hooks/useProductCheckouts";
import { getEbookUrl } from "@/lib/api/content.functions";
import { toast } from "sonner";
import { ebooksQueryOptions } from "@/lib/app-queries";

/** Reescreve cover_url do Supabase Storage para usar o endpoint de image transform.
 *  Resultado: ~30-50 KB WebP em vez de 2-3 MB PNG full-res. */
function optimizedCoverUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Só transforma URLs do Supabase Storage (/storage/v1/object/public/...)
    const objectPrefix = "/storage/v1/object/public/";
    if (!u.pathname.startsWith(objectPrefix)) return raw;
    const storagePath = u.pathname.slice(objectPrefix.length);
    u.pathname = `/storage/v1/render/image/public/${storagePath}`;
    u.searchParams.set("width", "400");
    u.searchParams.set("height", "600");
    u.searchParams.set("resize", "contain");
    u.searchParams.set("quality", "75");
    return u.toString();
  } catch {
    return raw;
  }
}

export const Route = createFileRoute("/app/ebooks")({
  loader: ({ context }) => {
    const qc = (context as { queryClient: QueryClient }).queryClient;
    qc.ensureQueryData(ebooksQueryOptions);
  },
  component: EbooksPage,
  pendingComponent: EbooksSkeleton,
});

type EbookExt = Ebook & {
  requiredProductId: string | null;
  description: string | null;
  coverUrl: string | null;
};

function mapEbooks(raw: any[]): EbookExt[] {
  return raw.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? "",
    category: (r.category ?? "bonus") as Ebook["category"],
    price:
      r.price_cents > 0 ? `R$ ${(r.price_cents / 100).toFixed(2).replace(".", ",")}` : undefined,
    badge: r.badge ?? undefined,
    cover: "",
    coverUrl: r.cover_url ?? null,
    requiredProductId: r.required_product_id ?? null,
    description: r.description ?? null,
  }));
}

function EbooksSkeleton() {
  return (
    <div className="mt-6 space-y-8 animate-pulse">
      <div className="text-center">
        <div className="mx-auto h-4 w-20 rounded bg-[color:var(--gold-warm)]/20" />
        <div className="mx-auto mt-2 h-8 w-32 rounded bg-[color:var(--deep-purple)]/10" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-5 w-40 rounded bg-[color:var(--deep-purple)]/10" />
          <div className="flex gap-3">
            {[1, 2, 3].map((j) => (
              <div
                key={j}
                className="aspect-[2/3] w-[55vw] max-w-[200px] shrink-0 rounded-2xl bg-[#F5ECD9]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EbooksPage() {
  const { data: raw = [], isLoading } = useQuery(ebooksQueryOptions);
  const ebooks = mapEbooks(raw);

  const { data: owned } = useEntitlements();
  const { data: checkouts } = useProductCheckouts();

  const colecao = ebooks.filter((e) => e.category === "colecao");
  const bonus = ebooks.filter((e) => e.category === "bonus");
  const embreve = ebooks.filter((e) => e.category === "embreve");
  const firstRef = useRef(true);
  const first = firstRef.current;
  firstRef.current = false;

  return (
    <div className={first ? "" : "rdp-no-anim"}>
      <div className="mt-6 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">
          Biblioteca
        </p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">E-books</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">
          Bonus inclusos e colecao Rotina de Paz
        </p>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">
          Carregando biblioteca...
        </p>
      )}

      {!isLoading && ebooks.length === 0 && (
        <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">
          Nenhum e-book disponivel ainda.
        </p>
      )}

      <Shelf title="Bonus inclusos" items={bonus} owned={owned} checkouts={checkouts} />
      <Shelf title="Colecao Rotina de Paz" items={colecao} owned={owned} checkouts={checkouts} />
      <Shelf title="Em breve" items={embreve} owned={owned} checkouts={checkouts} />
    </div>
  );
}

function Shelf({
  title,
  items,
  owned,
  checkouts,
}: {
  title: string;
  items: EbookExt[];
  owned: Set<string> | undefined;
  checkouts: Map<string, string> | undefined;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedEbook = expandedId ? items.find((e) => e.id === expandedId) : null;
  const expandedBuyUrl = expandedEbook
    ? checkoutFor(checkouts, expandedEbook.requiredProductId)
    : null;

  if (items.length === 0) return null;
  return (
    <section className="mt-8 rdp-fade-up">
      <h3 className="mb-3 font-display text-xl text-[color:var(--deep-purple)]">{title}</h3>
      <div className="relative overflow-x-clip">
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {items.map((e) => {
            const unlocked = isUnlocked(owned, e.requiredProductId);
            const buyUrl = !unlocked ? checkoutFor(checkouts, e.requiredProductId) : null;
            return (
              <EbookCard
                key={e.id}
                ebook={e}
                unlocked={unlocked}
                buyUrl={buyUrl}
                isExpanded={expandedId === e.id}
                onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
              />
            );
          })}
        </div>
        {/* Scroll indicator */}
        {items.length > 1 && (
          <div className="pointer-events-none absolute right-0 top-0 flex h-[calc(100%-2rem)] w-10 items-center justify-center bg-gradient-to-l from-[#F9F5F0]/90 to-transparent">
            <ChevronRight className="h-5 w-5 text-[color:var(--amethyst)] animate-pulse" />
          </div>
        )}
      </div>

      {/* Offer panel — renders BELOW the carousel */}
      {expandedEbook && (
        <div className="mt-3 overflow-hidden rounded-2xl rdp-light-card shadow-[0_8px_24px_-12px_rgba(117,97,127,0.4)]">
          <div className="p-4">
            <p className="font-display text-lg leading-tight text-[color:var(--deep-purple)]">
              {expandedEbook.title}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--amethyst)]">
              {expandedEbook.description || expandedEbook.subtitle}
            </p>
            {expandedBuyUrl && (
              <a
                href={expandedBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] hover:brightness-110"
              >
                Adquirir agora · {expandedEbook.price} <ChevronRight className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              className="mt-2 w-full text-center text-[11px] text-[color:var(--amethyst)] underline underline-offset-2"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function EbookCard({
  ebook: e,
  unlocked,
  buyUrl,
  isExpanded,
  onToggle,
}: {
  ebook: EbookExt;
  unlocked: boolean;
  buyUrl: string | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleReadClick() {
    if (loading) return;

    // Sempre via server function: a verificação de entitlement é server-side e a
    // URL do arquivo nunca é entregue ao cliente na listagem (defense-in-depth).
    setLoading(true);
    toast.loading("Abrindo seu e-book…", { id: "ebook" });
    try {
      const { url } = await getEbookUrl({ data: { ebookId: e.id } });
      if (!url) {
        toast.error("Link do e-book indisponível. Fale com o suporte.", { id: "ebook" });
        return;
      }
      toast.dismiss("ebook");
      const win = window.open(url, "_blank", "noopener");
      if (!win) window.location.assign(url);
    } catch (err) {
      console.error("[ebooks] getEbookUrl falhou:", err);
      toast.error("Não consegui abrir o e-book. Tente de novo.", { id: "ebook" });
    } finally {
      setLoading(false);
    }
  }

  function handleTap() {
    if (unlocked) {
      handleReadClick();
    } else {
      onToggle();
    }
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={loading}
      className={
        "group block w-[55vw] max-w-[200px] shrink-0 snap-center text-left transition-transform " +
        (isExpanded ? "scale-[0.96] opacity-80" : "")
      }
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#F5ECD9] shadow-[0_12px_30px_-15px_rgba(117,97,127,0.45)] transition group-hover:-translate-y-1">
        {e.coverUrl ? (
          <img
            src={optimizedCoverUrl(e.coverUrl)!}
            alt={e.title}
            width={400}
            height={600}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4A5B5] to-[#C9A876]" />
        )}

        {/* Locked: price badge */}
        {!unlocked && e.price && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent pb-3 pt-8">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[color:var(--deep-purple)] shadow">
              <ShoppingCart className="h-3 w-3 text-[color:var(--gold-warm)]" /> {e.price}
            </span>
          </div>
        )}

        {/* Unlocked: Ler indicator */}
        {unlocked && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent pb-3 pt-8">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-[color:var(--deep-purple)] shadow">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BookOpen className="h-3 w-3" />
              )}
              {loading ? "Abrindo..." : "Ler agora"}
            </span>
          </div>
        )}

        {e.badge && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[color:var(--gold-warm)]">
            {e.badge}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-tight text-[color:var(--deep-purple)]">
        {e.title}
      </p>
      {unlocked && <p className="text-[10px] font-semibold text-emerald-600">Liberado</p>}
    </button>
  );
}
