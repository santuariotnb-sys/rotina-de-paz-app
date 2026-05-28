import { Link, useRouterState } from "@tanstack/react-router";
import { Layers, Music, BookOpen, Cross, Star } from "lucide-react";
import logoSrc from "@/assets/rotina-de-paz-logo.png";

const items = [
  { to: "/app",              label: "Paz",         icon: Layers,  match: (p: string) => p === "/app" || p.startsWith("/app/volume") },
  { to: "/app/louvores",     label: "Louvores",    icon: Music,   match: (p: string) => p.startsWith("/app/louvores") },
  { to: "/app/ebooks",       label: "E-books",     icon: BookOpen,match: (p: string) => p.startsWith("/app/ebooks"), badge: "Novo" },
  { to: "/app/devocionais",  label: "Devocionais", icon: Cross,   match: (p: string) => p.startsWith("/app/devocionais") },
  { to: "/app/depoimentos",  label: "Depoimentos", icon: Star,    match: (p: string) => p.startsWith("/app/depoimentos") },
] as const;

export function TopBar({ name, onLogout }: { name?: string | null; onLogout?: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--rose-dust)]/25 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link to="/app" className="flex items-center gap-2.5">
          <img src={logoSrc} alt="" width={40} height={40} className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-display text-[15px] tracking-[0.22em] rdp-title-gradient">ROTINA DE PAZ</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--amethyst)]/70">Círculo da Paz</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {onLogout && (
            <button onClick={onLogout} className="hidden sm:inline text-[12px] text-[color:var(--amethyst)] hover:text-[color:var(--deep-purple)]">Sair</button>
          )}
          <div className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--gold-warm)]/50 bg-white/80 text-[12px] font-semibold text-[color:var(--gold-warm)]">
            {(name?.[0] ?? "P").toUpperCase()}
          </div>
        </div>
      </div>
      <DesktopNav />
    </header>
  );
}

function DesktopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="hidden md:block border-t border-[color:var(--rose-dust)]/20 bg-white/40">
      <div className="mx-auto flex max-w-5xl items-stretch gap-1 px-3 py-2">
        {items.map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`relative flex-1 rounded-xl px-3 py-2.5 text-center transition ${
                active
                  ? "bg-gradient-to-br from-white/95 to-[color:var(--rose-soft)]/40 shadow-[0_6px_18px_-10px_rgba(201,168,118,0.5)] border border-[color:var(--gold-warm)]/50"
                  : "hover:bg-white/60 border border-transparent"
              }`}
            >
              <Icon className={`mx-auto h-5 w-5 ${active ? "text-[color:var(--gold-warm)]" : "text-[color:var(--amethyst)]"}`} />
              <p className={`mt-1 text-[11px] font-display tracking-wide ${active ? "rdp-title-gradient" : "text-[color:var(--amethyst)]"}`}>{it.label}</p>
              {"badge" in it && it.badge && (
                <span className="absolute -top-1 right-3 rounded-full bg-[color:var(--gold-warm)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#2C1F0B]">{it.badge}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--rose-dust)]/30 bg-white/90 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-5xl items-stretch px-2 py-1.5">
        {items.map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to} className="relative flex flex-1 flex-col items-center gap-0.5 px-1 py-1.5">
              <div className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                active
                  ? "bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_14px_-6px_rgba(201,168,118,0.55)]"
                  : "text-[color:var(--amethyst)]"
              }`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className={`text-[9px] tracking-wide ${active ? "text-[color:var(--gold-warm)] font-semibold" : "text-[color:var(--amethyst)]/75"}`}>
                {it.label}
              </p>
              {"badge" in it && it.badge && (
                <span className="absolute top-0 right-2 rounded-full bg-[color:var(--gold-warm)] px-1 py-px text-[8px] font-bold text-[#2C1F0B]">•</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}