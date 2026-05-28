import { GlassCard } from "./GlassCard";
import { Sparkles } from "lucide-react";

export function StubPage({ title, description, phase }: { title: string; description: string; phase: string }) {
  return (
    <div className="adm-fade-up space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">{phase}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">{title}</h1>
        <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">{description}</p>
      </header>
      <GlassCard className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--adm-accent-soft)] text-[var(--adm-accent)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--adm-navy-deep)]">Em construção</p>
          <p className="text-[12px] text-[var(--adm-text-muted)]">Este módulo será entregue em uma das próximas fases. A navegação e auth já estão funcionais.</p>
        </div>
      </GlassCard>
    </div>
  );
}