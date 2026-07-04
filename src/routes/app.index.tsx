import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Sun, Moon, Play, Crown, Music, Cross, ArrowRight } from "lucide-react";
import volMorningSrc from "@/assets/volume-1-manha.webp";
import volNightSrc from "@/assets/volume-2-noite.webp";
import { ARCHETYPES, type Archetype } from "@/data/quiz";
import { loadProgress, loadStudent, saveStudent, type Student } from "@/lib/student";

export const Route = createFileRoute("/app/")({
  component: PazHome,
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function PazHome() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const firstRef = useRef(true);
  const first = firstRef.current;
  firstRef.current = false;

  useEffect(() => {
    setStudent(loadStudent());
    setProgress(loadProgress());
  }, []);

  if (!student)
    return (
      <ArchetypePicker
        onPick={(a) => {
          const s: Student = { archetype: a };
          saveStudent(s);
          setStudent(s);
        }}
      />
    );

  const morningDone = countDone(progress, "morning");
  const nightDone = countDone(progress, "night");
  const arche = ARCHETYPES[student.archetype];
  const nextTurno: "manha" | "noite" = morningDone <= nightDone ? "manha" : "noite";
  const firstName = student.name?.split(" ")[0];
  const isMorning = nextTurno === "manha";
  const nextDone = isMorning ? morningDone : nightDone;
  const heroImg = isMorning ? volMorningSrc : volNightSrc;

  return (
    <div className={first ? "" : "rdp-no-anim"}>
      {/* ===== HERO imersivo: continuar a jornada ===== */}
      <section className="rdp-fade-up relative -mx-4 mt-2 overflow-hidden rounded-b-[2rem] sm:mx-0 sm:mt-5 sm:rounded-[2rem]">
        <img
          src={heroImg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          width={1024}
          height={1024}
        />
        {/* véu para legibilidade + atmosfera de santuário */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2A2033]/92 via-[#2A2033]/55 to-[#2A2033]/25" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,rgba(201,168,118,0.28),transparent_60%)]" />

        <div className="relative flex min-h-[340px] flex-col justify-between p-6 sm:min-h-[300px] sm:p-8">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur-md ring-1 ring-white/20">
              {isMorning ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {greeting()}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[12px] font-semibold text-white/90 backdrop-blur-md">
              Dia {Math.min(nextDone + 1, 7)} <span className="text-white/55">de 7</span>
            </span>
          </div>

          <div>
            <p className="text-[12px] uppercase tracking-[0.24em] text-[#E8C9A0]">
              Continue sua jornada
            </p>
            <h1 className="mt-1.5 font-display text-[2rem] leading-[1.1] text-white sm:text-4xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-1.5 max-w-md text-[14px] text-white/75">
              Seu padrão é <span className="italic text-[#E8C9A0]">{arche.name}</span>. Continue por{" "}
              <strong className="font-semibold text-white">
                {isMorning ? "Volume I — Despertar" : "Volume II — Repouso"}
              </strong>
              .
            </p>

            {/* barra de progresso do volume atual */}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#E8C9A0] to-[#C9A876]"
                  style={{ width: `${(nextDone / 7) * 100}%` }}
                />
              </div>
              <span className="text-[12px] font-semibold text-white/80">{nextDone}/7</span>
            </div>

            <button
              onClick={() => navigate({ to: "/app/volume/$turno", params: { turno: nextTurno } })}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-[15px] font-semibold text-[#2C1F0B] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition active:scale-[0.98] sm:w-auto"
            >
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
              {nextDone === 0 ? "Começar agora" : "Continuar"}
            </button>
          </div>
        </div>
      </section>

      {/* ===== Atalhos rápidos (cara de app) ===== */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <QuickLink
          to="/app/louvores"
          icon={<Music className="h-5 w-5" />}
          label="Louvores"
          hint="148 cânticos"
        />
        <QuickLink
          to="/app/devocionais"
          icon={<Cross className="h-5 w-5" />}
          label="Devocionais"
          hint="Leituras diárias"
        />
      </div>

      {/* ===== Sua jornada — os dois volumes ===== */}
      <div className="mt-9 rdp-fade-up">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.24em] text-[color:var(--gold-ink)]">
              Método RP7
            </p>
            <h2 className="mt-1 font-display text-[1.75rem] leading-tight rdp-title-gradient">
              Sua Jornada de Paz
            </h2>
          </div>
        </div>
        <p className="mt-1.5 text-[13px] text-[color:var(--amethyst)]">
          Manhã ativa o corpo. Noite sela o dia.
        </p>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <VolumeCard
          to="manha"
          img={volMorningSrc}
          eyebrow="Volume I"
          title="Despertar"
          subtitle="7 Manhãs de Renovação Neural"
          icon={<Sun className="h-3.5 w-3.5" />}
          tone="morning"
          done={morningDone}
        />
        <VolumeCard
          to="noite"
          img={volNightSrc}
          eyebrow="Volume II"
          title="Repouso"
          subtitle="7 Noites de Selagem Profunda"
          icon={<Moon className="h-3.5 w-3.5" />}
          tone="night"
          done={nightDone}
        />
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  label,
  hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl rdp-light-card rdp-light-card-hover p-3.5"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--rose-soft)]/60 to-[color:var(--gold-warm)]/25 text-[color:var(--gold-ink)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] leading-tight text-[color:var(--deep-purple)]">
          {label}
        </span>
        <span className="block text-[12px] text-[color:var(--amethyst)]">{hint}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--amethyst)]/60 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function countDone(p: Record<string, boolean>, time: "morning" | "night") {
  return Object.entries(p).filter(([k, v]) => v && k.endsWith(`-${time}`)).length;
}

function VolumeCard({
  to,
  img,
  eyebrow,
  title,
  subtitle,
  icon,
  tone,
  done,
}: {
  to: "manha" | "noite";
  img: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: "morning" | "night";
  done: number;
}) {
  return (
    <Link
      to="/app/volume/$turno"
      params={{ turno: to }}
      className="group relative block overflow-hidden rounded-3xl rdp-fade-up shadow-[0_16px_40px_-20px_rgba(68,58,82,0.5)]"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <img
          src={img}
          alt={title}
          width={1024}
          height={1024}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#241B2E]/95 via-[#241B2E]/35 to-transparent" />

        {/* período (sup-esq) */}
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold-ink)] backdrop-blur">
          {icon} {tone === "morning" ? "Manhã" : "Noite"}
        </div>

        {/* selo premium (sup-dir) */}
        <div
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_4px_14px_-4px_rgba(201,168,118,0.85)] ring-1 ring-white/60"
          aria-label="Conteúdo premium"
        >
          <Crown className="h-4 w-4 fill-current" />
        </div>

        {/* título editorial SOBRE a imagem */}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C9A0]">{eyebrow}</p>
          <h3 className="mt-0.5 font-display text-[1.75rem] leading-none text-white">{title}</h3>
          <p className="mt-1.5 text-[12.5px] text-white/75">{subtitle}</p>

          <div className="mt-3.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#E8C9A0] to-[#C9A876]"
                style={{ width: `${(done / 7) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-white/85">{done}/7</span>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#2C1F0B] shadow-lg transition duration-300 group-hover:scale-105"
              aria-label="Iniciar"
            >
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ArchetypePicker({ onPick }: { onPick: (a: Archetype) => void }) {
  const list = Object.values(ARCHETYPES);
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-[11px] uppercase tracking-[0.32em] rdp-title-gradient">Rotina de Paz</p>
      <h1 className="mt-2 font-display text-3xl text-[color:var(--deep-purple)]">
        Bem-vinda ao seu app.
      </h1>
      <p className="mt-2 text-[14px] text-[color:var(--amethyst)]">
        Selecione o padrão que mais ressoa com você para liberar seu plano.
      </p>
      <div className="mt-6 grid gap-3 text-left">
        {list.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a.id)}
            className="group flex items-center gap-3 rdp-light-card rdp-light-card-hover rounded-2xl p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] uppercase tracking-[0.22em] text-[color:var(--gold-ink)]">
                Padrão
              </span>
              <span className="mt-0.5 block font-display text-xl text-[color:var(--deep-purple)]">
                {a.name}
              </span>
              <span className="mt-1 block text-[13px] text-[color:var(--amethyst)]">
                {a.subtitle}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--amethyst)]/60 transition group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
