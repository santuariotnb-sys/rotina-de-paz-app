import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ExternalLink, Lock, Play, Shield, ShoppingCart, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";
import { checkoutFor, useProductCheckouts } from "@/hooks/useProductCheckouts";

export const Route = createFileRoute("/app/devocional/$slug")({
  loader: ({ params }) => {
    if (!params.slug) throw notFound();
    return { slug: params.slug };
  },
  component: DevocionalPlayerPage,
});

type Lesson = {
  id: string;
  lesson_index: number;
  title: string;
  video_url: string | null;
  is_free_preview: boolean;
  duration_seconds: number;
};

type CourseData = {
  id: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  required_product_id: string | null;
  lessons: Lesson[];
};

function DevocionalPlayerPage() {
  const { slug } = Route.useLoaderData();
  const [activeIndex, setActiveIndex] = useState(1);
  const [showOffer, setShowOffer] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const { data: course, isLoading } = useQuery<CourseData | null>({
    queryKey: ["devocional", slug],
    queryFn: async () => {
      const { data: courses, error: ec } = await supabase
        .from("courses")
        .select("id, title, subtitle, cover_url, required_product_id")
        .eq("slug", slug)
        .eq("status", "active")
        .eq("kind", "devocional")
        .limit(1);
      if (ec) throw ec;
      const c = courses?.[0];
      if (!c) return null;

      const { data: lessons, error: el } = await supabase
        .from("course_lessons")
        .select("id, lesson_index, title, video_url, is_free_preview, duration_seconds")
        .eq("course_id", c.id)
        .order("module_index")
        .order("lesson_index");
      if (el) throw el;

      return {
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        cover_url: c.cover_url,
        required_product_id: c.required_product_id,
        lessons: (lessons ?? []).map((l: any) => ({
          id: l.id,
          lesson_index: l.lesson_index,
          title: l.title,
          video_url: l.video_url ?? null,
          is_free_preview: l.is_free_preview ?? false,
          duration_seconds: l.duration_seconds ?? 0,
        })),
      };
    },
  });

  const { data: owned } = useEntitlements();
  const { data: checkouts } = useProductCheckouts();

  const courseUnlocked = isUnlocked(owned, course?.required_product_id);
  const checkoutUrl = checkoutFor(checkouts, course?.required_product_id);

  // Fecha modal + oferta quando desbloqueia
  const prevUnlocked = useRef(courseUnlocked);
  useEffect(() => {
    if (courseUnlocked && !prevUnlocked.current) {
      setShowCheckout(false);
      setShowOffer(false);
      toast.success("Acesso liberado 🎉");
    }
    prevUnlocked.current = courseUnlocked;
  }, [courseUnlocked]);

  if (isLoading) {
    return <p className="mt-8 text-center text-[12px] text-[color:var(--amethyst)]">Carregando devocional…</p>;
  }

  if (!course) {
    return (
      <div className="py-10 text-center text-[color:var(--amethyst)]">
        <p>Devocional não encontrado.</p>
        <Link to="/app/devocionais" className="mt-2 inline-block text-[13px] underline">Voltar</Link>
      </div>
    );
  }

  const activeLesson = course.lessons.find((l) => l.lesson_index === activeIndex) ?? course.lessons[0];
  const canWatch = activeLesson?.is_free_preview || courseUnlocked;

  function posterFor(videoUrl: string | null): string | undefined {
    if (!videoUrl) return undefined;
    return videoUrl.replace(/dia-(\d+)\.mp4$/, "covers/dia-$1.jpg");
  }

  return (
    <>
      <div className="mt-4">
        <Link to="/app/devocionais" className="inline-flex items-center gap-1 text-[12px] text-[color:var(--amethyst)] hover:text-[color:var(--deep-purple)]">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="mt-3 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Devocional</p>
        <h1 className="mt-2 font-display text-4xl rdp-title-gradient">{course.title}</h1>
        {course.subtitle && (
          <p className="mt-1 text-[13px] text-[color:var(--amethyst)] italic">{course.subtitle}</p>
        )}
      </div>

      {/* Player */}
      <div className="mt-6 rdp-light-card rounded-3xl overflow-hidden rdp-fade-up">
        {canWatch && activeLesson?.video_url ? (
          <video
            key={activeLesson.video_url}
            controls
            preload="metadata"
            poster={posterFor(activeLesson.video_url)}
            className="w-full aspect-video bg-black"
          >
            <source src={activeLesson.video_url} type="video/mp4" />
          </video>
        ) : (
          <button
            onClick={() => setShowOffer((v) => !v)}
            className="relative w-full aspect-video bg-gradient-to-br from-[#443A52] to-[#2C1F0B] grid place-items-center cursor-pointer"
          >
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/95 text-[color:var(--gold-warm)] shadow-lg">
                <Lock className="h-6 w-6" />
              </div>
              <p className="mt-3 text-[13px] font-semibold text-white">Aula bloqueada</p>
              <p className="mt-1 text-[11px] text-white/70">Toque para ver como liberar</p>
            </div>
          </button>
        )}

        <div className="p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">
            Aula {activeLesson?.lesson_index}
            {activeLesson?.is_free_preview && " · Prévia grátis"}
          </p>
          <h2 className="mt-1 font-display text-xl text-[color:var(--deep-purple)]">{activeLesson?.title}</h2>
        </div>
      </div>

      {/* Seção de oferta expansível */}
      {!courseUnlocked && (
        <>
          <button
            onClick={() => setShowOffer((v) => !v)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--gold-warm)]/40 bg-white/70 px-4 py-2.5 text-[13px] font-semibold text-[color:var(--deep-purple)] hover:bg-white/90 transition"
          >
            {showOffer ? "Recolher" : "Liberar acesso"}
            <motion.span animate={{ rotate: showOffer ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>

          <AnimatePresence>
            {showOffer && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <OfferSection
                  checkoutUrl={checkoutUrl}
                  onCheckout={() => setShowCheckout(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Lista de aulas */}
      <div className="mt-5 rdp-light-card rounded-3xl p-5 rdp-fade-up">
        <h3 className="font-display text-lg text-[color:var(--deep-purple)]">Aulas</h3>
        <ol className="mt-3 space-y-2">
          {course.lessons.map((l, i) => {
            const available = l.is_free_preview || courseUnlocked;
            const isActive = l.lesson_index === activeIndex;
            return (
              <li key={l.id}>
                <button
                  onClick={() => {
                    if (available) {
                      setActiveIndex(l.lesson_index);
                    } else {
                      setShowOffer(true);
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
                    isActive
                      ? "bg-[color:var(--gold-warm)]/10 border border-[color:var(--gold-warm)]/40"
                      : available
                        ? "rdp-light-card-hover hover:bg-white/60"
                        : "opacity-60"
                  }`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
                    isActive
                      ? "border-[color:var(--gold-warm)]/60 bg-[color:var(--gold-warm)]/15 text-[color:var(--gold-warm)]"
                      : available
                        ? "border-[color:var(--amethyst)]/20 bg-white/50 text-[color:var(--amethyst)]"
                        : "border-[color:var(--amethyst)]/10 bg-white/30 text-[color:var(--amethyst)]/40"
                  }`}>
                    {available ? <Play className="h-4 w-4 fill-current" /> : <Lock className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">Dia {l.lesson_index}</p>
                      {l.is_free_preview && (
                        <span className="rounded-full border border-[color:var(--gold-warm)]/40 bg-[color:var(--gold-warm)]/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-[color:var(--gold-warm)]">Grátis</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] font-medium text-[color:var(--deep-purple)] truncate">{l.title}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Modal de checkout */}
      <AnimatePresence>
        {showCheckout && (
          <CheckoutModal
            checkoutUrl={checkoutUrl}
            productId={course.required_product_id}
            onClose={() => setShowCheckout(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Seção de Oferta ─── */

function OfferSection({ checkoutUrl, onCheckout }: { checkoutUrl: string | null; onCheckout: () => void }) {
  const lessons = [
    "Gratidão no Vale · agradecer quando nada faz sentido",
    "Gratidão em Meio à Ansiedade · o que agradecer quando o peito aperta",
    "Gratidão na Escassez · enxergar o que há, não só o que falta",
    "Gratidão por Quem Te Feriu · o perdão que liberta você",
    "Gratidão pelo Corpo e pela Vida · voltar pro presente",
    "Gratidão em Silêncio · ouvir Deus na quietude",
    "Gratidão como Arma Espiritual · a gratidão que sustenta a fé",
  ];

  return (
    <div className="mt-4 rdp-light-card rounded-3xl p-5 space-y-5">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">A Chave da Gratidão · 7 dias</p>
        <h3 className="mt-2 font-display text-2xl text-[color:var(--deep-purple)] leading-snug">
          E se a gratidão fosse a chave que falta pra sua paz?
        </h3>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)] leading-relaxed">
          Não a de fingir que está tudo bem. A gratidão que se aprende — e que reescreve o jeito como você atravessa os dias difíceis.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--gold-warm)]/30 bg-white/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">O que é</p>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)] leading-relaxed">
          Um devocional em 7 videoaulas. Em cada uma, você é conduzida por um tema — do vale à escassez, da mágoa ao silêncio — pra descobrir, na prática e na Palavra, como a gratidão acalma a mente, fortalece a fé e muda o que você sente.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--gold-warm)]/30 bg-white/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--gold-warm)]">O que você recebe</p>
        <ol className="mt-3 space-y-2">
          {lessons.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] text-[color:var(--deep-purple)]">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color:var(--gold-warm)]/40 bg-white/70 text-[10px] font-semibold text-[color:var(--gold-warm)]">{i + 1}</span>
              <span className="leading-relaxed">Dia {i + 1} — {l}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-[color:var(--rose-dust)]/40 bg-[color:var(--rose-soft)]/20 p-4 text-center">
        <p className="text-[13px] text-[color:var(--amethyst)] leading-relaxed">
          Pra você que ama a Deus, mas anda mais cansada que grata. Que quer sentir paz sem fingir que está tudo bem.
        </p>
      </div>

      <div className="text-center space-y-3">
        <div>
          <p className="font-display text-3xl text-[color:var(--deep-purple)]">R$67</p>
          <p className="text-[11px] text-[color:var(--amethyst)]">pagamento único · acesso vitalício</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[color:var(--amethyst)]">
          <Shield className="h-3.5 w-3.5" />
          <span>Garantia de 7 dias — se não fizer sentido, devolvemos.</span>
        </div>

        {checkoutUrl ? (
          <button
            onClick={onCheckout}
            className="w-full rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3.5 text-[14px] font-semibold text-[#2C1F0B] shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)] hover:brightness-110 transition"
          >
            Quero a Chave da Gratidão
          </button>
        ) : (
          <button
            disabled
            className="w-full rounded-full border border-[color:var(--amethyst)]/20 bg-white/50 px-5 py-3.5 text-[14px] font-semibold text-[color:var(--amethyst)]/50 cursor-not-allowed"
          >
            Checkout em breve
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Modal de Checkout ─── */

function CheckoutModal({ checkoutUrl, productId, onClose }: {
  checkoutUrl: string | null;
  productId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [iframeFailed, setIframeFailed] = useState(false);
  const iframeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling: invalida entitlements a cada 3s enquanto modal aberto
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["entitlements", "me"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Fechar com Esc
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Timeout para detecção de bloqueio de iframe
  const handleIframeLoad = useCallback(() => {
    if (iframeTimerRef.current) {
      clearTimeout(iframeTimerRef.current);
      iframeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (checkoutUrl && !iframeFailed) {
      iframeTimerRef.current = setTimeout(() => {
        setIframeFailed(true);
      }, 4000);
    }
    return () => {
      if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);
    };
  }, [checkoutUrl, iframeFailed]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--deep-purple)]/30 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative max-h-[95vh] w-full max-w-xl overflow-hidden rounded-t-3xl rdp-light-card sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--rose-dust)]/20 px-5 py-3">
          <p className="text-[12px] font-semibold text-[color:var(--deep-purple)]">Finalizar compra</p>
          <button onClick={onClose} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--rose-dust)]/40 text-[color:var(--amethyst)] hover:bg-[color:var(--rose-soft)]/30">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="h-[75vh] sm:h-[70vh]">
          {!checkoutUrl ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <p className="text-[14px] font-semibold text-[color:var(--deep-purple)]">Checkout em breve</p>
                <p className="mt-1 text-[12px] text-[color:var(--amethyst)]">O link de pagamento será liberado em breve.</p>
              </div>
            </div>
          ) : iframeFailed ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <p className="text-[14px] font-semibold text-[color:var(--deep-purple)]">Checkout externo</p>
                <p className="mt-2 text-[12px] text-[color:var(--amethyst)] leading-relaxed">
                  O checkout será aberto em uma nova aba.<br />
                  Após o pagamento, volte aqui — o acesso será liberado automaticamente.
                </p>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-3 text-[13px] font-semibold text-[#2C1F0B] shadow-lg hover:brightness-110 transition"
                >
                  <ExternalLink className="h-4 w-4" /> Abrir checkout em nova aba
                </a>
              </div>
            </div>
          ) : (
            <iframe
              src={checkoutUrl}
              className="h-full w-full border-0"
              title="Checkout"
              onLoad={handleIframeLoad}
              onError={() => setIframeFailed(true)}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
