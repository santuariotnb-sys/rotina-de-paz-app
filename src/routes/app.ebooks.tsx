import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { BookOpen, ShoppingCart, ChevronRight, Loader2, Library } from "lucide-react";
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
    <div className="mt-5 animate-pulse">
      <div className="-mx-4 h-36 rounded-b-[2rem] bg-[#1A1326]/90 sm:mx-0 sm:rounded-[2rem]" />
      {[1, 2].map((i) => (
        <div key={i} className="mt-7 space-y-3">
          <div className="h-5 w-40 rounded bg-[color:var(--deep-purple)]/10" />
          <div className="flex gap-3">
            {[1, 2, 3].map((j) => (
              <div
                key={j}
                className="aspect-[2/3] w-[46vw] max-w-[180px] shrink-0 rounded-2xl bg-[#F5ECD9]"
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
      {/* Header imersivo */}
      <section className="rdp-fade-up relative -mx-4 mt-2 overflow-hidden rounded-b-[2rem] bg-[#1A1326] px-6 pb-7 pt-8 sm:mx-0 sm:mt-5 sm:rounded-[2rem] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(201,168,118,0.30),transparent_60%),radial-gradient(80%_60%_at_0%_100%,rgba(212,165,181,0.22),transparent_60%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#E8C9A0] ring-1 ring-white/15">
            <Library className="h-3.5 w-3.5" /> Biblioteca
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] leading-[1.05] text-white">E-books</h1>
          <p className="mt-1.5 text-[13px] text-white/70">
            Bônus inclusos e a coleção Rotina de Paz
          </p>
        </div>
      </section>

      {isLoading && (
        <p className="mt-8 text-center text-[13px] text-[color:var(--amethyst)]">
          Carregando biblioteca…
        </p>
      )}

      {!isLoading && ebooks.length === 0 && (
        <p className="mt-8 text-center text-[13px] text-[color:var(--amethyst)]">
          Nenhum e-book disponível ainda.
        </p>
      )}

      <Shelf title="Bônus inclusos" items={bonus} owned={owned} checkouts={checkouts} />
      <Shelf title="Coleção Rotina de Paz" items={colecao} owned={owned} checkouts={checkouts} />
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
    <section className="mt-7 rdp-fade-up">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-[1.35rem] text-[color:var(--deep-purple)]">{title}</h3>
        <span className="rounded-full bg-[color:var(--rose-soft)]/45 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--gold-ink)]">
          {items.length}
        </span>
      </div>
      <div className="relative overflow-x-clip">
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-3 scrollbar-none"
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
        {items.length > 1 && (
          <div className="pointer-events-none absolute right-0 top-0 flex h-[calc(100%-2rem)] w-10 items-center justify-center bg-gradient-to-l from-[#F3E3DF]/90 to-transparent">
            <ChevronRight className="h-5 w-5 animate-pulse text-[color:var(--amethyst)]" />
          </div>
        )}
      </div>

      {/* Painel de oferta — abaixo do carrossel */}
      {expandedEbook && (
        <div className="mt-2 overflow-hidden rounded-2xl rdp-light-card">
          <div className="p-4">
            <p className="font-display text-xl leading-tight text-[color:var(--deep-purple)]">
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
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_22px_-8px_rgba(201,168,118,0.6)] transition active:scale-[0.98]"
              >
                Adquirir agora · {expandedEbook.price} <ChevronRight className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              className="mt-2 w-full text-center text-[12px] text-[color:var(--amethyst)] underline underline-offset-2"
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
    // Sempre via server function: verificação de entitlement server-side; a URL do
    // arquivo nunca é entregue ao cliente na listagem (defense-in-depth).
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
    if (unlocked) handleReadClick();
    else onToggle();
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={loading}
      className={
        "group block w-[46vw] max-w-[180px] shrink-0 snap-center text-left transition-transform " +
        (isExpanded ? "scale-[0.96] opacity-80" : "")
      }
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#F5ECD9] shadow-[0_16px_34px_-18px_rgba(90,60,90,0.55)] ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_44px_-18px_rgba(90,60,90,0.6)]">
        {e.coverUrl ? (
          <img
            src={optimizedCoverUrl(e.coverUrl)!}
            alt={e.title}
            width={400}
            height={600}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876]" />
        )}

        {/* lombada sutil (cara de livro) */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/25 to-transparent" />

        {/* Bloqueado: preço */}
        {!unlocked && e.price && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/65 to-transparent pb-3 pt-9">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[color:var(--deep-purple)] shadow">
              <ShoppingCart className="h-3 w-3 text-[color:var(--gold-ink)]" /> {e.price}
            </span>
          </div>
        )}

        {/* Liberado: Ler */}
        {unlocked && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent pb-3 pt-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2C1F0B] shadow">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" />
              )}
              {loading ? "Abrindo…" : "Ler agora"}
            </span>
          </div>
        )}

        {e.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold-ink)] shadow-sm">
            {e.badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] font-medium leading-tight text-[color:var(--deep-purple)]">
        {e.title}
      </p>
      {unlocked && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Liberado
        </p>
      )}
    </button>
  );
}
