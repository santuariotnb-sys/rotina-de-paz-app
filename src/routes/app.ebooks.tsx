import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronRight, Loader2, Library, Lock, Check, Sparkles, X } from "lucide-react";
import { type Ebook } from "@/data/ebooks";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";
import { checkoutFor, useProductCheckouts } from "@/hooks/useProductCheckouts";
import { getEbookUrl } from "@/lib/api/content.functions";
import { toast } from "sonner";
import { ebooksQueryOptions } from "@/lib/app-queries";

/** Reescreve cover_url do Supabase Storage para usar o endpoint de image transform. */
function optimizedCoverUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const objectPrefix = "/storage/v1/object/public/";
    if (!u.pathname.startsWith(objectPrefix)) return raw;
    const storagePath = u.pathname.slice(objectPrefix.length);
    u.pathname = `/storage/v1/render/image/public/${storagePath}`;
    u.searchParams.set("width", "500");
    u.searchParams.set("height", "750");
    u.searchParams.set("resize", "cover");
    u.searchParams.set("quality", "80");
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
                className="aspect-[2/3] w-[42vw] max-w-[164px] shrink-0 rounded-2xl bg-[#F5ECD9]"
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

  const [offer, setOffer] = useState<EbookExt | null>(null);

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
            <Library className="h-3.5 w-3.5" /> Sua biblioteca
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] leading-[1.05] text-white">
            Leituras para a alma
          </h1>
          <p className="mt-1.5 text-[13px] text-white/70">
            Seus bônus liberados e joias escolhidas a dedo para a sua jornada.
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

      <Shelf title="Já são seus" hint="Inclusos no seu acesso" items={bonus} owned={owned} onOffer={setOffer} />
      <Shelf title="Continue sua jornada" hint="Escolhidos para este momento" items={colecao} owned={owned} onOffer={setOffer} />
      <Shelf title="Em breve" items={embreve} owned={owned} onOffer={setOffer} />

      <OfferModal
        ebook={offer}
        buyUrl={offer ? checkoutFor(checkouts, offer.requiredProductId) : null}
        onClose={() => setOffer(null)}
      />
    </div>
  );
}

function Shelf({
  title,
  hint,
  items,
  owned,
  onOffer,
}: {
  title: string;
  hint?: string;
  items: EbookExt[];
  owned: Set<string> | undefined;
  onOffer: (e: EbookExt) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-7 rdp-fade-up">
      <div className="mb-3">
        <h3 className="font-display text-[1.4rem] leading-none text-[color:var(--deep-purple)]">
          {title}
        </h3>
        {hint && <p className="mt-1 text-[12px] text-[color:var(--amethyst)]">{hint}</p>}
      </div>
      <div className="relative overflow-x-clip">
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-3 scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {items.map((e) => (
            <EbookCard
              key={e.id}
              ebook={e}
              unlocked={isUnlocked(owned, e.requiredProductId)}
              onOffer={() => onOffer(e)}
            />
          ))}
        </div>
        {items.length > 1 && (
          <div className="pointer-events-none absolute right-0 top-0 flex h-full w-10 items-center justify-center bg-gradient-to-l from-[#F3E3DF]/90 to-transparent">
            <ChevronRight className="h-5 w-5 animate-pulse text-[color:var(--amethyst)]" />
          </div>
        )}
      </div>
    </section>
  );
}

/** Card estilo Netflix: a capa preenche o card inteiro. Sem título/preço embaixo. */
function EbookCard({
  ebook: e,
  unlocked,
  onOffer,
}: {
  ebook: EbookExt;
  unlocked: boolean;
  onOffer: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleRead() {
    if (loading) return;
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

  return (
    <button
      type="button"
      onClick={() => (unlocked ? handleRead() : onOffer())}
      disabled={loading}
      aria-label={unlocked ? `Ler ${e.title}` : `Ver oferta de ${e.title}`}
      className="group relative aspect-[2/3] w-[42vw] max-w-[164px] shrink-0 snap-center overflow-hidden rounded-2xl bg-[#F5ECD9] shadow-[0_16px_34px_-18px_rgba(90,60,90,0.6)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_46px_-18px_rgba(90,60,90,0.65)] active:scale-[0.98]"
    >
      {e.coverUrl ? (
        <img
          src={optimizedCoverUrl(e.coverUrl)!}
          alt={e.title}
          width={500}
          height={750}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876] p-3 text-center">
          <span className="font-display text-lg leading-tight text-white">{e.title}</span>
        </div>
      )}

      {/* lombada sutil */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/20 to-transparent" />

      {/* badge */}
      {e.badge && (
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold-ink)] shadow-sm">
          {e.badge}
        </span>
      )}

      {unlocked ? (
        <>
          {/* selo liberado + ação ler ao hover/tap */}
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent pb-3 pt-10 opacity-0 transition group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2C1F0B] shadow">
              <BookOpen className="h-3.5 w-3.5" /> Ler agora
            </span>
          </div>
        </>
      ) : (
        <>
          {/* cadeado discreto */}
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm">
            <Lock className="h-3.5 w-3.5" />
          </span>
          {/* preço aparece só no gradiente inferior, elegante */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-9">
            <span className="text-[13px] font-bold text-white drop-shadow">{e.price}</span>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#2C1F0B]">
              Ver
            </span>
          </div>
        </>
      )}
    </button>
  );
}

/** Modal de oferta premium — abre ao tocar numa capa bloqueada. */
function OfferModal({
  ebook: e,
  buyUrl,
  onClose,
}: {
  ebook: EbookExt | null;
  buyUrl: string | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {e && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-[#1A1326]/70 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(ev) => ev.stopPropagation()}
            initial={{ y: 40, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative w-full max-w-sm overflow-hidden rounded-t-[2rem] bg-[color:var(--milk)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5)] sm:rounded-[2rem]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>

            {/* capa em destaque */}
            <div className="relative h-56 overflow-hidden">
              {e.coverUrl ? (
                <img
                  src={optimizedCoverUrl(e.coverUrl)!}
                  alt={e.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--milk)] via-[color:var(--milk)]/10 to-transparent" />
            </div>

            <div className="-mt-6 px-6 pb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[color:var(--rose-soft)]/70 to-[color:var(--gold-warm)]/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--gold-ink)]">
                <Sparkles className="h-3.5 w-3.5" /> Um presente para a sua jornada
              </span>
              <h2 className="mt-3 font-display text-[1.8rem] leading-tight text-[color:var(--deep-purple)]">
                {e.title}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--amethyst)]">
                {e.description || e.subtitle}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {["Leitura imediata", "Seu para sempre", "Dentro do app"].map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--deep-purple)] shadow-sm"
                  >
                    <Check className="h-3 w-3 text-[color:var(--gold-ink)]" /> {b}
                  </span>
                ))}
              </div>

              {buyUrl ? (
                <a
                  href={buyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-4 text-[#2C1F0B] shadow-[0_12px_30px_-8px_rgba(201,168,118,0.7)] transition active:scale-[0.98]"
                >
                  <span className="text-[15px] font-semibold">Quero levar comigo</span>
                  <span className="flex items-center gap-1 text-[16px] font-bold">
                    {e.price} <ChevronRight className="h-4 w-4" />
                  </span>
                </a>
              ) : (
                <p className="mt-5 rounded-2xl bg-[color:var(--milk-warm)] px-4 py-3 text-center text-[13px] text-[color:var(--amethyst)]">
                  Em breve disponível para você.
                </p>
              )}
              <button
                onClick={onClose}
                className="mt-2 w-full py-2 text-center text-[12px] text-[color:var(--amethyst)]/80"
              >
                Agora não
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
