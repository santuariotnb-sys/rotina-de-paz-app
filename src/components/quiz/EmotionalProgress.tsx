export function EmotionalProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--milk-warm)]">
        <div
          className="rdp-gradient-progress absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ width: `${Math.min(100, (current / total) * 100)}%` }}
        />
        <div className="absolute inset-0 flex">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-white/60 last:border-r-0"
              aria-hidden
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs tracking-wide text-[color:var(--amethyst)]">
        Você está conhecendo sua paz · {Math.max(1, current)} de {total}
      </p>
    </div>
  );
}