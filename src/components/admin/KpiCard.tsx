import { useEffect, useState } from "react";
import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  accent?: "blue" | "green" | "amber" | "rose";
};

const accentMap: Record<NonNullable<Props["accent"]>, string> = {
  blue: "bg-white/[0.08] text-white/85 ring-1 ring-white/15",
  green: "bg-white/[0.08] text-white/85 ring-1 ring-white/15",
  amber: "bg-white/[0.08] text-white/85 ring-1 ring-white/15",
  rose: "bg-white/[0.08] text-white/85 ring-1 ring-white/15",
};

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString("pt-BR")}</>;
}

export function KpiCard({ label, value, hint, icon, loading, accent = "blue" }: Props) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-white/55" style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: '0.22em' }}>
            {label}
          </p>
          <p className="mt-3 font-semibold text-white tabular-nums text-3xl leading-none" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
            {loading ? (
              <span className="inline-block h-7 w-20 animate-pulse rounded-md bg-white/10" />
            ) : typeof value === "number" ? (
              <CountUp to={value} />
            ) : (
              value
            )}
          </p>
          {hint && (
            <p className="mt-2 text-[12px] text-white/55">{hint}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl backdrop-blur-md",
              accentMap[accent],
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}