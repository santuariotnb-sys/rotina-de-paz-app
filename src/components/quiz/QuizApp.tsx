import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { GuideAvatar } from "./Avatar";
import { SpeechBubble } from "./SpeechBubble";
import { EmotionalProgress } from "./EmotionalProgress";
import {
  ARCHETYPES,
  CONFIRMATIONS,
  DESIRE_CTA,
  DESIRE_QUOTE,
  ENCOURAGEMENTS,
  QUESTIONS,
  computeArchetype,
  getTransition,
  type Archetype,
  type ArchetypeData,
} from "@/data/quiz";
import { playDing } from "@/lib/sound";
import { buildKirvanoUrl, captureUtms } from "@/lib/utm";
import { getSupabase } from "@/lib/supabase";

const KIRVANO_URL =
  (import.meta.env.VITE_KIRVANO_URL as string | undefined) ||
  "https://pay.kirvano.com/sua-oferta";

type Stage = "hero" | "questions" | "loading" | "result" | "bridge" | "offer";

export function QuizApp() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("hero");
  const [name, setName] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const startTsRef = useRef<number>(Date.now());

  useEffect(() => {
    captureUtms();
  }, []);

  const result = useMemo(() => {
    if (stage !== "result" && stage !== "bridge" && stage !== "offer") return null;
    return computeArchetype(answers);
  }, [stage, answers]);

  const archetype: Archetype | null = result?.archetype ?? null;
  const arche = archetype ? ARCHETYPES[archetype] : null;
  const situation = answers["situacao"];
  const desire = answers["desejo"];
  const bridge = arche && situation ? arche.bridges[situation] ?? null : null;

  const startQuiz = () => {
    startTsRef.current = Date.now();
    setStage("questions");
  };

  const answer = async (value: string) => {
    const q = QUESTIONS[qIndex];
    const opt = q.options.find((o) => o.value === value);
    if (!opt) return;

    // Filtro de risco — Q2
    if (opt.risk) {
      // Incremento anônimo (opcional) — sem PII
      const sb = getSupabase();
      try {
        await sb?.from("risk_events").insert({ source: "quiz" });
      } catch {}
      navigate({ to: "/quiz/encaminhamento" });
      return;
    }

    playDing();
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    setConfirmation(CONFIRMATIONS[Math.floor(Math.random() * CONFIRMATIONS.length)]);
    window.setTimeout(() => setConfirmation(null), 900);

    const isLast = qIndex === QUESTIONS.length - 1;
    if (isLast) {
      window.setTimeout(() => setStage("loading"), 450);
      return;
    }

    // encorajamento a cada 3 perguntas
    if ((qIndex + 1) % 3 === 0) {
      const msg = ENCOURAGEMENTS[Math.min(Math.floor((qIndex + 1) / 3) - 1, ENCOURAGEMENTS.length - 1)];
      setEncouragement(msg);
      window.setTimeout(() => {
        setEncouragement(null);
        setQIndex((i) => i + 1);
      }, 2500);
    } else {
      window.setTimeout(() => setQIndex((i) => i + 1), 500);
    }
  };

  // Loading -> Result com mensagens em sequência
  const [loadingMsg, setLoadingMsg] = useState(0);
  useEffect(() => {
    if (stage !== "loading") return;
    setLoadingMsg(0);
    const messages = 6;
    const timers: number[] = [];
    for (let i = 1; i < messages; i++) {
      timers.push(window.setTimeout(() => setLoadingMsg(i), 1200 * i));
    }
    timers.push(window.setTimeout(() => setStage("result"), 1200 * messages));
    // persiste lead no Supabase (best effort)
    void persistLead(answers).catch(() => {});
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  async function persistLead(ans: Record<string, string>) {
    const sb = getSupabase();
    if (!sb) return;
    const { scores, archetype } = computeArchetype(ans);
    const utms = captureUtms();
    const { data: lead, error } = await sb
      .from("leads")
      .insert({
        name: name || null,
        email: null,
        archetype,
        scores,
        desire: ans["desejo"] ?? null,
        situation: ans["situacao"] ?? null,
        risk_flag: false,
        ...utms,
      })
      .select("id")
      .single();
    if (error || !lead) return;
    // Persiste arquétipo localmente para o App da Aluna (Parte 2)
    try {
      localStorage.setItem(
        "sacra_student",
        JSON.stringify({
          archetype,
          name: name || null,
          desire: ans["desejo"] ?? null,
          situation: ans["situacao"] ?? null,
          lead_id: lead.id,
          created_at: new Date().toISOString(),
        }),
      );
    } catch {}
    const totalTime = Date.now() - startTsRef.current;
    const rows = QUESTIONS.map((q) => ({
      lead_id: lead.id,
      question_key: q.key,
      answer_value: ans[q.key] ?? "",
      answer_text: q.options.find((o) => o.value === ans[q.key])?.label ?? "",
      time_to_answer: Math.round(totalTime / QUESTIONS.length),
    }));
    await sb.from("quiz_responses").insert(rows);
  }

  async function saveEmail() {
    setEmailSaved(true);
    const sb = getSupabase();
    if (!sb || !email || !archetype) return;
    const utms = captureUtms();
    await sb.from("leads").insert({
      name: name || null,
      email,
      archetype,
      desire: desire ?? null,
      situation: situation ?? null,
      ...utms,
    });
  }

  function goToBridge() {
    setStage("bridge");
  }

  function goToOffer() {
    setStage("offer");
  }

  function checkout() {
    if (!archetype) return;
    const url = buildKirvanoUrl(KIRVANO_URL, { archetype, name, email });
    window.location.href = url;
  }

  // ---------- RENDER ----------

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[color:var(--milk)]">
      <AmbientParticles active={stage === "loading"} />

      <AnimatePresence mode="wait">
        {stage === "hero" && (
          <HeroScreen
            key="hero"
            name={name}
            setName={setName}
            onStart={startQuiz}
          />
        )}

        {stage === "questions" && (
          <QuestionScreen
            key="q"
            qIndex={qIndex}
            total={QUESTIONS.length}
            answer={answer}
            confirmation={confirmation}
            encouragement={encouragement}
            answers={answers}
          />
        )}

        {stage === "loading" && (
          <LoadingScreen key="loading" step={loadingMsg} />
        )}

        {stage === "result" && arche && (
          <ResultScreen
            key="result"
            archetype={arche}
            bridge={bridge}
            name={name}
            desire={desire}
            email={email}
            setEmail={setEmail}
            emailSaved={emailSaved}
            onSaveEmail={saveEmail}
            onContinue={goToBridge}
          />
        )}

        {stage === "bridge" && arche && (
          <BridgeScreen
            key="bridge"
            archetype={arche}
            desire={desire}
            onContinue={goToOffer}
          />
        )}

        {stage === "offer" && arche && (
          <OfferScreen
            key="offer"
            archetype={arche}
            desire={desire}
            onCheckout={checkout}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

/* ============================== HERO ============================== */

function HeroScreen({
  name,
  setName,
  onStart,
}: {
  name: string;
  setName: (s: string) => void;
  onStart: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-16 text-center"
    >
      {/* Avatar + bubble (padrão atual) */}
      <div className="flex w-full items-start justify-center gap-4">
        <GuideAvatar size="corner" />
        <SpeechBubble
          text="Olá. Eu sou sua guia nessa jornada."
          typingDelay={400}
        />
      </div>

      {/* Eyebrow com traços */}
      <div className="mt-14 flex items-center gap-4 text-[color:var(--amethyst)]">
        <span className="h-px w-10 bg-[color:var(--gold)]/60" />
        <p className="text-xs font-medium uppercase tracking-[0.28em]">
          Quiz personalizado · 7 perguntas
        </p>
        <span className="h-px w-10 bg-[color:var(--gold)]/60" />
      </div>

      {/* Título grande com gradiente */}
      <h1 className="rdp-title-gradient mt-8 font-display text-5xl leading-[1.05] tracking-tight sm:text-[64px]">
        Sua ansiedade tem um <em className="italic">tipo</em>.
      </h1>

      {/* Subtítulo serif itálico */}
      <p className="mt-7 font-display text-2xl italic leading-snug text-[color:var(--amethyst)] sm:text-[28px]">
        Descubra qual é o seu —
        <br />
        e o caminho que foi feito para ele.
      </p>

      {/* Body */}
      <p className="mt-10 max-w-xl text-base leading-relaxed text-[color:var(--deep-purple)] sm:text-lg">
        Existem 4 padrões diferentes de ansiedade entre mulheres cristãs.
        Descubra o seu — e por que a oração que funciona pra outras pessoas
        pode estar tendo efeito curto na sua.
      </p>

      {/* Form: name + CTA escuro */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) onStart();
        }}
        className="mt-12 flex w-full max-w-sm flex-col items-center gap-4"
      >
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como posso te chamar?"
          className="w-full rounded-full border border-[color:var(--border)] bg-white/70 px-6 py-3.5 text-center text-base text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/60 focus:border-[color:var(--lavender)] focus:outline-none focus:ring-4 focus:ring-[color:var(--lavender)]/20"
          autoComplete="given-name"
          required
          minLength={2}
          maxLength={40}
        />
        <button
          type="submit"
          disabled={name.trim().length < 2}
          className="rdp-btn-gradient-hover group inline-flex items-center justify-center gap-3 rounded-full px-10 py-4 text-sm font-medium uppercase tracking-[0.22em] text-white shadow-[0_18px_40px_-18px_rgba(68,58,82,0.6)] hover:-translate-y-[1px] disabled:hover:translate-y-0"
        >
          Estou pronta
          <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </form>

      {/* Footer italic */}
      <p className="mt-10 max-w-md font-display text-base italic leading-relaxed text-[color:var(--amethyst)]/85">
        Sem julgamento. Sem diagnóstico. Sem rótulo.
        <br />
        Só uma forma honesta de você escutar a si mesma.
      </p>
    </motion.section>
  );
}

/* ============================== QUESTIONS ============================== */

function QuestionScreen({
  qIndex,
  total,
  answer,
  confirmation,
  encouragement,
  answers,
}: {
  qIndex: number;
  total: number;
  answer: (v: string) => void | Promise<void>;
  confirmation: string | null;
  encouragement: string | null;
  answers: Record<string, string>;
}) {
  const q = QUESTIONS[qIndex];
  const transition = getTransition(qIndex, answers);
  const [showOptions, setShowOptions] = useState(false);
  const [showPrompt, setShowPrompt] = useState(!transition);

  useEffect(() => {
    setShowOptions(false);
    setShowPrompt(!transition);
    const promptDelay = transition ? 700 + transition.length * 30 + 800 : 0;
    const t1 = transition
      ? window.setTimeout(() => setShowPrompt(true), promptDelay)
      : null;
    const optDelay = promptDelay + 700 + q.prompt.length * 30 + 200;
    const t2 = window.setTimeout(() => setShowOptions(true), optDelay);
    return () => {
      if (t1) clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [qIndex, q.prompt, transition]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-10 pt-6 sm:px-8"
    >
      <EmotionalProgress current={qIndex + 1} total={total} />

      <div className="mt-8 flex items-start gap-3 sm:gap-5">
        <GuideAvatar size="corner" />
        <div className="flex-1 space-y-3 pt-1">
          {transition && (
            <SpeechBubble
              text={transition}
              resetKey={`t-${qIndex}`}
              italic
            />
          )}
          {showPrompt && (
            <SpeechBubble
              text={q.prompt}
              resetKey={`p-${qIndex}`}
              typingDelay={transition ? 100 : 0}
            />
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-3">
        <AnimatePresence>
          {showOptions &&
            q.options.map((opt, i) => (
              <motion.button
                key={opt.value}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.18, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                onClick={() => answer(opt.value)}
                className="group relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white px-5 py-4 text-left text-base text-[color:var(--deep-purple)] transition-all hover:-translate-y-0.5 hover:border-[color:var(--lavender)] hover:rdp-shadow-soft sm:text-lg"
              >
                <span className="relative z-10">{opt.label}</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
              </motion.button>
            ))}
        </AnimatePresence>
      </div>

      {/* Confirmação efêmera */}
      <AnimatePresence>
        {confirmation && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 self-center rounded-full bg-[color:var(--milk-warm)] px-4 py-1.5 text-sm text-[color:var(--amethyst)]"
          >
            {confirmation}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encorajamento bloqueador */}
      <AnimatePresence>
        {encouragement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-[color:var(--milk)]/90 backdrop-blur-sm"
          >
            <div className="flex max-w-md items-start gap-4 px-6 text-left">
              <GuideAvatar size="corner" />
              <SpeechBubble
                text={encouragement}
                italic
                resetKey={encouragement}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ============================== LOADING ============================== */

function LoadingScreen({ step }: { step: number }) {
  const messages = [
    "Lendo suas respostas com calma...",
    "Cruzando os 4 padrões raízes...",
    "Mapeando o que seu corpo está pedindo...",
    "Encontrando o caminho desenhado pra você...",
    "Preparando sua leitura completa...",
    "Pronto.",
  ];
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 text-center"
    >
      <GuideAvatar size="hero" />
      <div className="mt-8">
        <SpeechBubble text="Estou analisando suas respostas..." typingDelay={300} />
      </div>
      <ul className="mt-10 space-y-2 text-[color:var(--amethyst)]">
        {messages.map((m, i) => (
          <li
            key={m}
            className={`font-display text-lg italic transition-all duration-500 ${
              i <= step ? "opacity-100" : "opacity-20"
            }`}
          >
            {m}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function AmbientParticles({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-[color:var(--gold)]"
          style={{
            left: `${(i * 53) % 100}%`,
            bottom: `-${(i * 7) % 30}px`,
            animation: `rdp-particle ${4 + (i % 5)}s ${i * 0.3}s ease-in-out infinite`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ============================== RESULT ============================== */

function ResultScreen({
  archetype,
  bridge,
  name,
  desire,
  email,
  setEmail,
  emailSaved,
  onSaveEmail,
  onContinue,
}: {
  archetype: ArchetypeData;
  bridge: string | null;
  name: string;
  desire?: string;
  email: string;
  setEmail: (s: string) => void;
  emailSaved: boolean;
  onSaveEmail: () => void;
  onContinue: () => void;
}) {
  const ctaLabel = (desire && DESIRE_CTA[desire]) || "Quero meu caminho de paz";
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="mx-auto max-w-2xl px-5 py-10 sm:px-8"
    >
      <div className="flex items-start gap-3 sm:gap-5">
        <GuideAvatar size="corner" />
        <div className="flex-1 pt-1">
          <SpeechBubble
            text={`Encontrei${name ? `, ${name}` : ""}. Você é a ${archetype.name}.`}
            typingDelay={400}
          />
        </div>
      </div>

      <div className="rdp-shadow-soft mt-8 overflow-hidden rounded-3xl bg-white">
        <div className="rdp-gradient-soft px-6 py-8 text-center sm:px-10">
          <p className="font-display text-sm italic tracking-[0.2em] text-[color:var(--gold-warm)]">
            ✦ PADRÃO RAIZ IDENTIFICADO ✦
          </p>
          <h2 className="mt-3 font-display text-4xl text-[color:var(--deep-purple)] sm:text-5xl">
            {archetype.name}
          </h2>
          <p className="mt-2 text-base text-[color:var(--amethyst)] sm:text-lg">
            {archetype.subtitle}
          </p>
        </div>

        <div className="space-y-6 px-6 py-7 sm:px-10">
          {bridge && (
            <p className="font-display text-lg italic leading-relaxed text-[color:var(--deep-purple)]/90">
              {bridge}
            </p>
          )}
          <div>
            <h3 className="font-display text-xl text-[color:var(--deep-purple)]">
              O que está acontecendo
            </h3>
            <div
              className="rdp-prose mt-2 leading-relaxed text-[color:var(--amethyst)]"
              dangerouslySetInnerHTML={{ __html: archetype.mechanismHtml }}
            />
          </div>

          <div
            className="rdp-verdade rounded-2xl border border-[color:var(--lavender)]/30 bg-[color:var(--milk-warm)] px-5 py-5"
            dangerouslySetInnerHTML={{ __html: archetype.desarmeHtml }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--border)] bg-white px-5 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-[color:var(--gold-warm)]">
                O que esperar
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--amethyst)]">
                {archetype.esperar}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-white px-5 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-[color:var(--gold-warm)]">
                O que não esperar
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--amethyst)]">
                {archetype.naoEsperar}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Captura opcional de email */}
      <div className="rdp-shadow-soft mt-6 rounded-2xl border border-[color:var(--border)] bg-white p-5">
        {emailSaved ? (
          <p className="text-center text-[color:var(--amethyst)]">
            Pronto. Enviei seu resultado pro seu email 🤍
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.includes("@")) onSaveEmail();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <p className="font-display text-lg text-[color:var(--deep-purple)]">
                Quer guardar esse resultado?
              </p>
              <p className="text-sm text-[color:var(--amethyst)]">
                Te envio por email. (Opcional)
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="mt-3 w-full rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-[color:var(--deep-purple)] placeholder:text-[color:var(--amethyst)]/60 focus:border-[color:var(--lavender)] focus:outline-none"
                maxLength={120}
              />
            </div>
            <button
              type="submit"
              className="rounded-xl border border-[color:var(--lavender)] bg-[color:var(--milk-warm)] px-5 py-3 font-medium text-[color:var(--deep-purple)] transition hover:bg-[color:var(--lavender)]/30"
            >
              Enviar
            </button>
          </form>
        )}
      </div>

      <button
        onClick={onContinue}
        className="rdp-gradient-cta rdp-shadow-soft mt-8 w-full rounded-2xl px-6 py-5 font-medium text-[color:var(--deep-purple)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        {ctaLabel} →
      </button>
    </motion.section>
  );
}

/* ============================== BRIDGE (ponte dedicada ao CTA) ============================== */

function BridgeScreen({
  archetype,
  desire,
  onContinue,
}: {
  archetype: ArchetypeData;
  desire?: string;
  onContinue: () => void;
}) {
  const ctaLabel = (desire && DESIRE_CTA[desire]) || "Quero meu caminho de paz";
  const quote = (desire && DESIRE_QUOTE[desire]) || null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20"
    >
      <div className="rdp-shadow-soft rdp-gradient-soft rounded-3xl border border-[color:var(--lavender)]/30 px-6 py-10 text-center sm:px-12 sm:py-14">
        <div className="mx-auto flex items-center justify-center gap-3 text-[color:var(--gold-warm)]">
          <span className="h-px w-10 bg-[color:var(--gold-warm)]/50" />
          <span aria-hidden>✦</span>
          <span className="h-px w-10 bg-[color:var(--gold-warm)]/50" />
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.28em] text-[color:var(--amethyst)]">
          Você marcou como sua maior prioridade
        </p>

        {quote && (
          <p className="mt-5 font-display text-2xl italic leading-snug text-[color:var(--gold-warm)] sm:text-3xl">
            “{quote}”
          </p>
        )}

        <p className="mx-auto mt-7 max-w-md text-base leading-relaxed text-[color:var(--deep-purple)] sm:text-lg">
          Existe um caminho desenhado especificamente pra esse desejo. <br className="hidden sm:block" />
          Pra esse padrão. Pra mulheres como você.
        </p>

        <button
          onClick={onContinue}
          className="rdp-btn-gradient-hover rdp-shadow-soft mt-9 inline-flex items-center justify-center gap-3 rounded-full px-8 py-4 font-medium text-[color:var(--milk)] sm:px-10"
        >
          {ctaLabel} <span aria-hidden>→</span>
        </button>

        <p className="mt-6 font-display text-sm italic text-[color:var(--amethyst)]">
          Você vê tudo antes de decidir. <br /> Sem compromisso, sem pressão.
        </p>
      </div>
    </motion.section>
  );
}

/* ============================== OFFER ============================== */

function OfferScreen({
  archetype,
  desire,
  onCheckout,
}: {
  archetype: ArchetypeData;
  desire?: string;
  onCheckout: () => void;
}) {
  const ctaLabel = (desire && DESIRE_CTA[desire]) || "Eu creio — quero minha paz";
  const quote = (desire && DESIRE_QUOTE[desire]) || null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-2xl px-5 py-12 sm:px-8"
    >
      {/* O CAMINHO — eco do desejo */}
      <section className="text-center">
        <p className="font-display text-sm italic tracking-[0.22em] text-[color:var(--gold-warm)]">
          ✦ O CAMINHO ✦
        </p>
        <h2 className="mt-4 font-display text-4xl leading-tight text-[color:var(--deep-purple)] sm:text-5xl">
          Você lembra do que <br className="hidden sm:block" /> você marcou no final?
        </h2>
        {quote && (
          <p className="mx-auto mt-6 max-w-lg font-display text-2xl italic leading-snug text-[color:var(--gold-warm)] sm:text-[26px]">
            “{quote}”
          </p>
        )}
        <p className="mx-auto mt-6 max-w-md text-[color:var(--deep-purple)]">
          Essa é a sua direção. <br />
          É o destino que seu corpo quer chegar.
        </p>
        <p className="mx-auto mt-4 max-w-lg text-[color:var(--amethyst)]">
          E o caminho — pra esse padrão específico, pra essa direção específica —
          foi desenhado em <strong className="text-[color:var(--deep-purple)]">14 sessões guiadas</strong>.
          14 sinais consecutivos. Em 7 dias.
        </p>
        <p className="mt-8 text-xs uppercase tracking-[0.22em] text-[color:var(--amethyst)]">
          Esse caminho tem nome
        </p>
      </section>

      {/* CARD ROTINA DE PAZ */}
      <div className="rdp-shadow-soft mt-6 overflow-hidden rounded-3xl bg-white">
        <div className="rdp-gradient-soft px-6 py-8 text-center sm:px-10">
          <p className="font-display text-xs italic tracking-[0.28em] text-[color:var(--gold-warm)]">
            MÉTODO COMPLETO · 7 DIAS
          </p>
          <h3 className="mt-3 font-display text-5xl text-[color:var(--deep-purple)] sm:text-6xl">
            Rotina de <em className="not-italic text-[color:var(--gold-warm)]">Paz</em>
          </h3>
          <p className="mt-3 font-display text-lg italic text-[color:var(--amethyst)]">
            O método guiado para a Mente Que Não Desliga.
          </p>
        </div>

        {/* O QUE VOCÊ RECEBE */}
        <div className="space-y-7 px-6 py-8 sm:px-10">
          <section>
            <SectionTitle>O que você recebe</SectionTitle>
            <p className="mt-3 leading-relaxed text-[color:var(--deep-purple)]">
              <strong>14 sessões guiadas em áudio</strong> — 7 capítulos pra usar de manhã, 7
              capítulos pra usar à noite. Cada sessão de 8 a 12 minutos. Cabe entre uma tarefa
              e outra, antes de dormir, antes da casa acordar.
            </p>
            <p className="mt-4 leading-relaxed text-[color:var(--deep-purple)]">
              Cada áudio segue <strong>4 movimentos</strong>: <strong>respiração</strong> que
              desativa o modo de sobrevivência, <strong>palavra com contexto</strong> (não
              versículo solto), <strong>exercício de declaração</strong>, e <strong>selagem</strong>
              {" "}— uma identidade que você leva pro dia ou pro sono.
            </p>
          </section>

          {/* ESPECIALMENTE PRA VOCÊ — capítulos do arquétipo */}
          <section>
            <SectionTitle>Especialmente pra você</SectionTitle>
            <p className="mt-3 text-[color:var(--amethyst)]">
              Dois capítulos foram feitos especificamente para o seu padrão:
            </p>
            <ul className="mt-4 space-y-3">
              {archetype.chapters.map((c, i) => (
                <li
                  key={`${c.num}-${c.period}-${i}`}
                  className="flex gap-4 rounded-2xl border border-[color:var(--lavender)]/30 bg-[color:var(--milk-warm)] px-4 py-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--rose-soft)] font-display text-sm italic text-[color:var(--amethyst)]">
                    {c.num}
                  </span>
                  <div className="flex-1">
                    <p className="font-display text-lg text-[color:var(--deep-purple)]">
                      {c.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--amethyst)]">
                      <strong className="text-[color:var(--deep-purple)]">{c.period}.</strong>{" "}
                      {c.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* JUNTO COM O MÉTODO */}
          <section>
            <SectionTitle>Junto com o método, você leva</SectionTitle>
            <ul className="mt-4 divide-y divide-[color:var(--border)]">
              {[
                ["Áudio Mestre de Ativação", "preparação completa para os 7 dias"],
                ["E-book \u201cDormir Melhor Hoje\u201d", "neurociência aplicada ao descanso"],
                ["Devocional \u201c30 Dias com Jesus\u201d", "pra continuar o caminho depois dos 7 dias"],
                ["Parábolas de Jesus em Imagens", "Palavra que entra pelo olhar"],
                ["148 Louvores do Reino", "em frequência terapêutica"],
                ["Acesso vitalício pelo app", "você ouve quando quiser, quantas vezes precisar"],
              ].map(([title, desc]) => (
                <li key={title} className="flex gap-3 py-3">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--rose-soft)] text-[color:var(--deep-purple)]">
                    ✓
                  </span>
                  <p className="leading-relaxed text-[color:var(--deep-purple)]">
                    <strong>{title}</strong>{" "}
                    <span className="text-[color:var(--amethyst)]">— {desc}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* PREÇO */}
        <div className="rdp-gradient-soft mx-6 mb-6 rounded-2xl border border-[color:var(--lavender)]/30 px-6 py-8 text-center sm:mx-10 sm:px-10">
          <p className="text-[color:var(--amethyst)] line-through">De R$ 197,00</p>
          <p className="mt-2 font-display text-[color:var(--deep-purple)]">
            <span className="text-3xl">R$</span>{" "}
            <span className="font-display text-7xl italic text-[color:var(--gold-warm)]">67</span>
          </p>
          <p className="mt-1 text-[color:var(--deep-purple)]">
            à vista <span className="mx-2 text-[color:var(--amethyst)]">ou</span>{" "}
            <strong>12× de R$ 5,59</strong>
          </p>
          <p className="mt-3 font-display text-sm italic text-[color:var(--amethyst)]">
            Pagamento único · Acesso permanente · Sem mensalidade
          </p>
        </div>

        {/* GARANTIA */}
        <div className="mx-6 mb-8 rounded-2xl border border-[color:var(--lavender)]/30 bg-[color:var(--milk-warm)] px-6 py-6 sm:mx-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--rose-soft)] text-lg">
              🛡
            </span>
            <h4 className="font-display text-xl text-[color:var(--deep-purple)]">
              Garantia incondicional de 7 dias
            </h4>
          </div>
          <p className="mt-3 leading-relaxed text-[color:var(--deep-purple)]">
            Faça a jornada completa. Se não sentir mudança, devolvo cada centavo.
            Sem formulário, sem pergunta, sem julgamento. Você só me escreve.
          </p>
        </div>

        {/* FECHAMENTO + CTA */}
        <div className="border-t border-[color:var(--border)] px-6 pb-8 pt-6 text-center sm:px-10">
          {quote && (
            <p className="mx-auto max-w-lg font-display text-lg italic text-[color:var(--amethyst)]">
              Você lembra do seu desejo: “{quote}”
            </p>
          )}
          <p className="mt-3 font-display text-xl text-[color:var(--deep-purple)] sm:text-2xl">
            Esse é o caminho específico pra ele.
          </p>

          <button
            onClick={onCheckout}
            className="rdp-btn-gradient-hover rdp-shadow-soft mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full px-6 py-4 text-sm font-medium uppercase tracking-[0.18em] text-[color:var(--milk)] sm:w-auto sm:px-12"
          >
            Eu creio — quero minha paz <span aria-hidden>→</span>
          </button>
          <p className="sr-only">{ctaLabel}</p>
          <p className="mt-4 text-xs text-[color:var(--amethyst)]">
            🔒 Acesso imediato após pagamento · Pagamento 100% seguro
          </p>
        </div>
      </div>
    </motion.section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-[color:var(--gold-warm)]/60" />
      <h4 className="font-display text-2xl text-[color:var(--deep-purple)]">{children}</h4>
    </div>
  );
}