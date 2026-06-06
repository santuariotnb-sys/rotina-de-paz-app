import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Sun, Moon, Sparkles, Play, Crown } from "lucide-react";
import volMorningSrc from "@/assets/volume-1-manha.webp";
import volNightSrc from "@/assets/volume-2-noite.webp";
import { ARCHETYPES, type Archetype } from "@/data/quiz";
import { loadProgress, loadStudent, saveStudent, type Student } from "@/lib/student";

export const Route = createFileRoute("/app/")({
  component: PazHome,
});

function PazHome() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setStudent(loadStudent());
    setProgress(loadProgress());
  }, []);

  if (!student) return <ArchetypePicker onPick={(a) => { const s: Student = { archetype: a }; saveStudent(s); setStudent(s); }} />;

  const morningDone = countDone(progress, "morning");
  const nightDone = countDone(progress, "night");
  const arche = ARCHETYPES[student.archetype];
  const nextTurno: "manha" | "noite" = morningDone <= nightDone ? "manha" : "noite";
  const firstName = student.name?.split(" ")[0];

  return (
    <>
      {/* Continuar jornada */}
      <div className="mt-5 rdp-fade-up rdp-light-card rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 text-[color:var(--gold-warm)]">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">Próximo passo</p>
              <p className="mt-0.5 truncate font-display text-base sm:text-lg text-[color:var(--deep-purple)]">
                Olá{firstName ? `, ${firstName}` : ""} · <span className="italic text-[color:var(--amethyst)]">{arche.name}</span>
              </p>
              <p className="mt-0.5 text-[12px] sm:text-[13px] text-[color:var(--amethyst)]">
                Continue por <strong className="text-[color:var(--deep-purple)]">{nextTurno === "manha" ? "Volume I — Despertar" : "Volume II — Repouso"}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/app/volume/$turno", params: { turno: nextTurno } })}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-4 py-2.5 text-[13px] font-semibold text-[#2C1F0B] shadow-[0_6px_20px_-8px_rgba(201,168,118,0.55)] hover:brightness-110"
          >
            Iniciar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="mt-10 text-center rdp-fade-up">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Método RP7</p>
        <h1 className="mt-2 font-display text-4xl rdp-title-gradient">Sua Jornada de Paz</h1>
        <p className="mt-2 text-[14px] text-[color:var(--amethyst)] max-w-xl mx-auto">
          Escolha o volume para começar. Manhã ativa o corpo. Noite sela o dia.
        </p>
      </div>

      {/* Duas capas */}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <VolumeCard
          to="manha"
          img={volMorningSrc}
          eyebrow="Volume I"
          title="Despertar"
          subtitle="7 Manhãs de Renovação Neural"
          icon={<Sun className="h-4 w-4" />}
          tone="morning"
          done={morningDone}
        />
        <VolumeCard
          to="noite"
          img={volNightSrc}
          eyebrow="Volume II"
          title="Repouso"
          subtitle="7 Noites de Selagem Profunda"
          icon={<Moon className="h-4 w-4" />}
          tone="night"
          done={nightDone}
        />
      </div>
    </>
  );
}

function countDone(p: Record<string, boolean>, time: "morning" | "night") {
  return Object.entries(p).filter(([k, v]) => v && k.endsWith(`-${time}`)).length;
}

function VolumeCard({ to, img, eyebrow, title, subtitle, icon, tone, done }: {
  to: "manha" | "noite"; img: string; eyebrow: string; title: string; subtitle: string;
  icon: React.ReactNode; tone: "morning" | "night"; done: number;
}) {
  return (
    <Link
      to="/app/volume/$turno" params={{ turno: to }}
      className="group mx-auto block w-full max-w-[280px] overflow-hidden rounded-3xl rdp-light-card rdp-light-card-hover rdp-fade-up md:max-w-none"
    >
      <div className="relative aspect-[4/5] sm:aspect-square w-full overflow-hidden">
        <img src={img} alt={title} width={1024} height={1024} loading="lazy" decoding="async"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

        {/* período (sup-esq) */}
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">
          {icon} {tone === "morning" ? "Manhã" : "Noite"}
        </div>

        {/* selo premium (sup-dir) */}
        <div className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_4px_14px_-4px_rgba(201,168,118,0.85)] ring-1 ring-white/60" aria-label="Conteúdo premium">
          <Crown className="h-4 w-4 fill-current" />
        </div>

        {/* progresso (inf-esq) */}
        <div className="absolute bottom-4 left-4 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {done}/7
        </div>
      </div>
      <div className="p-5">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--gold-warm)]">{eyebrow}</p>
        <h3 className="mt-1 font-display text-2xl text-[color:var(--deep-purple)]">{title}</h3>
        <p className="mt-1 text-[13px] text-[color:var(--amethyst)]">{subtitle}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--rose-soft)]/40">
            <div className="h-full rounded-full bg-gradient-to-r from-[#D4A5B5] to-[#C9A876]" style={{ width: `${(done / 7) * 100}%` }} />
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_18px_-6px_rgba(201,168,118,0.7)] transition duration-300 group-hover:scale-105 group-hover:brightness-110" aria-label="Iniciar">
            <Play className="h-4 w-4 translate-x-[1px] fill-current" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ArchetypePicker({ onPick }: { onPick: (a: Archetype) => void }) {
  const list = Object.values(ARCHETYPES);
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-[10px] uppercase tracking-[0.32em] rdp-title-gradient">Rotina de Paz</p>
      <h1 className="mt-2 font-display text-3xl text-[color:var(--deep-purple)]">Bem-vinda ao seu app.</h1>
      <p className="mt-2 text-[14px] text-[color:var(--amethyst)]">
        Selecione o padrão que mais ressoa com você para liberar seu plano.
      </p>
      <div className="mt-6 grid gap-3 text-left">
        {list.map((a) => (
          <button key={a.id} onClick={() => onPick(a.id)} className="rdp-light-card rdp-light-card-hover rounded-2xl p-4 text-left">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">Padrão</p>
            <h3 className="mt-0.5 font-display text-xl text-[color:var(--deep-purple)]">{a.name}</h3>
            <p className="mt-1 text-[13px] text-[color:var(--amethyst)]">{a.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}