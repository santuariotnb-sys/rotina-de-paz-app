import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Lock, Play, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ARCHETYPES } from "@/data/quiz";
import { getPlan, type PlanDay } from "@/data/plan";
import { SessionModal, type SessionAudio, type AudioState } from "@/components/app/SessionModal";
import { loadProgress, loadStudent, saveProgress, type Progress, type Student } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { isUnlocked, useEntitlements } from "@/hooks/useEntitlements";

type Turno = "manha" | "noite";

export const Route = createFileRoute("/app/volume/$turno")({
  loader: ({ params }) => {
    if (params.turno !== "manha" && params.turno !== "noite") throw notFound();
    return { turno: params.turno as Turno };
  },
  component: VolumePage,
});

function VolumePage() {
  const { turno } = Route.useLoaderData();
  const time = turno === "manha" ? "morning" : "night";
  const isMorning = time === "morning";

  const [student, setStudent] = useState<Student | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [openDay, setOpenDay] = useState<number | null>(null);

  useEffect(() => {
    setStudent(loadStudent());
    setProgress(loadProgress());
  }, []);

  const { data: methodAudio, isLoading: audioLoading, isError: audioError, refetch: refetchAudio } = useQuery({
    queryKey: ["method-audio", time],
    queryFn: async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, checkout_url")
        .eq("status", "active")
        .eq("kind", "method")
        .order("name")
        .limit(1);
      const product = prods?.[0];
      if (!product) return { byDay: new Map<number, SessionAudio>(), checkoutUrl: null as string | null, productId: null as string | null };
      const kind = time === "morning" ? "despertar" : "aquietar";
      const { data: tracks } = await supabase
        .from("audio_tracks")
        .select("day, title, subtitle, audio_url, duration_seconds")
        .eq("product_id", product.id)
        .eq("kind", kind)
        .order("day");
      const byDay = new Map<number, SessionAudio>();
      for (const t of tracks ?? []) {
        if (!byDay.has(t.day)) byDay.set(t.day, {
          title: t.title,
          subtitle: t.subtitle ?? null,
          audio_url: t.audio_url ?? null,
          duration_seconds: t.duration_seconds ?? 0,
        });
      }
      return { byDay, checkoutUrl: product.checkout_url ?? null, productId: product.id };
    },
  });

  const { data: owned } = useEntitlements();

  // Decide o que mostrar no áudio da sessão. Fail-open: loading/erro/entitlement
  // desconhecido NUNCA mostram "comprar" — só quando o banco confirma que não possui.
  const audioStateFor = (day: number): AudioState => {
    if (audioLoading) return { kind: "loading" };
    if (audioError) return { kind: "error" };
    const track = methodAudio?.byDay.get(day) ?? null;
    if (track?.audio_url) return { kind: "ready", audio: track };
    const pid = methodAudio?.productId ?? null;
    const checkoutUrl = methodAudio?.checkoutUrl ?? null;
    if (pid && owned && !isUnlocked(owned, pid) && checkoutUrl) {
      return { kind: "locked", checkoutUrl };
    }
    return { kind: "comingSoon" };
  };

  if (!student) {
    return (
      <div className="py-10 text-center text-[color:var(--amethyst)]">
        <p>Defina seu padrão na <Link to="/app" className="underline">tela principal</Link>.</p>
      </div>
    );
  }

  const arche = ARCHETYPES[student.archetype];
  const plan = getPlan(student.archetype);
  const done = plan.filter((d) => progress[`${d.day}-${time}`]).length;
  const pct = Math.round((done / 7) * 100);
  const nextDay = plan.find((d) => !progress[`${d.day}-${time}`]) ?? plan[plan.length - 1];

  const toggle = (day: number) => {
    const k = `${day}-${time}`;
    const next = { ...progress, [k]: !progress[k] };
    setProgress(next); saveProgress(next);
  };

  const activeSession = openDay ? (isMorning ? plan[openDay - 1].morning : plan[openDay - 1].night) : null;

  return (
    <>
      <div className="mt-4">
        <Link to="/app" className="inline-flex items-center gap-1 text-[12px] text-[color:var(--amethyst)] hover:text-[color:var(--deep-purple)]">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="mt-3 text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-ink)]">
          {isMorning ? "Volume I · Ativação Matinal" : "Volume II · Selagem Noturna"}
        </p>
        <h1 className="mt-2 font-display text-4xl rdp-title-gradient">
          {isMorning ? "Despertar" : "Repouso"}
        </h1>
        <p className="mt-1 text-[13px] text-[color:var(--amethyst)] italic">{arche.tagline}</p>
      </div>

      {/* Próximo */}
      <div className="mt-6 rdp-light-card rounded-3xl p-4 sm:p-5 rdp-fade-up">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 text-[color:var(--gold-ink)]">
              {isMorning ? <Sun className="h-5 w-5 sm:h-6 sm:w-6" /> : <Moon className="h-5 w-5 sm:h-6 sm:w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-ink)]">Próximo passo</p>
              <p className="mt-0.5 truncate font-display text-base sm:text-lg text-[color:var(--deep-purple)]">
                Dia {nextDay.day} — {nextDay.theme}
              </p>
              <p className="mt-0.5 text-[12px] text-[color:var(--amethyst)]">{nextDay.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => setOpenDay(nextDay.day)}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-4 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] hover:brightness-110"
          >
            {isMorning ? "Iniciar Ativação" : "Iniciar Selagem"}
          </button>
        </div>
      </div>

      {/* Progresso */}
      <div className="mt-5 rdp-light-card rounded-3xl p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-2xl text-[color:var(--deep-purple)]">Mapa da Jornada</h2>
            <p className="text-[12px] text-[color:var(--amethyst)]">{isMorning ? "Renovação Neural · Romanos 12:2" : "Selagem Profunda · Salmo 4:8"}</p>
          </div>
          <div className="rounded-xl border border-[color:var(--gold-warm)]/40 bg-white/70 px-3 py-1.5 text-right">
            <p className="font-display text-lg leading-none rdp-title-gradient">{done}/7</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--amethyst)]/70">dias</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--rose-soft)]/40">
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
            className="h-full bg-gradient-to-r from-[#D4A5B5] to-[#C9A876]" />
        </div>
      </div>

      {/* Lista dos 7 dias */}
      <ol className="mt-6 space-y-3">
        {plan.map((d, i) => <DayRow key={d.day} day={d} time={time} done={!!progress[`${d.day}-${time}`]} isNext={d.day === nextDay.day} onOpen={() => setOpenDay(d.day)} delay={i * 40} />)}
      </ol>

      <AnimatePresence>
        {activeSession && openDay && (
          <SessionModal
            session={activeSession}
            dayTheme={plan[openDay - 1].theme}
            done={!!progress[`${openDay}-${time}`]}
            onClose={() => setOpenDay(null)}
            onToggle={() => toggle(openDay)}
            audioState={audioStateFor(openDay)}
            onRetry={() => refetchAudio()}
            onAudioEnded={() => { if (!progress[`${openDay}-${time}`]) toggle(openDay); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function DayRow({ day: d, time, done, isNext, onOpen, delay }: {
  day: PlanDay; time: "morning" | "night"; done: boolean; isNext: boolean; onOpen: () => void; delay: number;
}) {
  const session = time === "morning" ? d.morning : d.night;
  return (
    <li className="rdp-light-card rdp-light-card-hover rdp-fade-up rounded-2xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <button onClick={onOpen} className="flex w-full items-center gap-4 text-left">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${
          done
            ? "border-[color:var(--gold-warm)]/60 bg-[color:var(--gold-warm)]/15 text-[color:var(--gold-ink)]"
            : isNext
              ? "border-[color:var(--rose-dust)]/60 bg-[color:var(--rose-dust)]/15 text-[color:var(--rose-dust)] rdp-pulse-gold"
              : "border-[color:var(--amethyst)]/20 bg-white/50 text-[color:var(--amethyst)]/50"
        }`}>
          {done ? <Check className="h-5 w-5" /> : isNext ? <Play className="h-4 w-4 fill-current" /> : <Lock className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--gold-ink)]">Dia {d.day}</p>
            {done && <span className="rounded-full border border-[color:var(--gold-warm)]/40 bg-[color:var(--gold-warm)]/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-[color:var(--gold-ink)]">Concluído</span>}
          </div>
          <h3 className="mt-0.5 font-display text-lg text-[color:var(--deep-purple)] truncate">{d.theme}</h3>
          <p className="text-[12px] text-[color:var(--amethyst)] truncate">{session.focus}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-[color:var(--gold-ink)]" />
      </button>
    </li>
  );
}