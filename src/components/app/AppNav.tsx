import { Link, useRouterState } from "@tanstack/react-router";
import { Layers, Music, BookOpen, Cross, Star, LogOut, LifeBuoy, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentAdmin } from "@/lib/admin/auth";
import logoSrc from "@/assets/rotina-de-paz-logo.png";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Carimbo de versão — bump a cada deploy pra confirmar (no aparelho do usuário) qual
// build está realmente carregada. Aparece na TopBar: "Círculo da Paz · <APP_BUILD>".
export const APP_BUILD = "v04jul-1";

const items = [
  { to: "/app",              label: "Paz",         icon: Layers,  match: (p: string) => p === "/app" || p.startsWith("/app/volume") },
  { to: "/app/louvores",     label: "Louvores",    icon: Music,   match: (p: string) => p.startsWith("/app/louvores") },
  { to: "/app/ebooks",       label: "E-books",     icon: BookOpen,match: (p: string) => p.startsWith("/app/ebooks"), badge: "Novo" },
  { to: "/app/devocionais",  label: "Devocionais", icon: Cross,   match: (p: string) => p.startsWith("/app/devocionais") },
  { to: "/app/depoimentos",  label: "Depoimentos", icon: Star,    match: (p: string) => p.startsWith("/app/depoimentos") },
] as const;

export function TopBar({ name, email, onLogout }: { name?: string | null; email?: string | null; onLogout?: () => void }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentAdmin().then((a) => setIsAdmin(!!a)).catch(() => setIsAdmin(false));
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--rose-dust)]/45 bg-white/95 backdrop-blur-xl shadow-[0_4px_16px_-4px_rgba(68,58,82,0.15)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link to="/app" className="flex items-center gap-3">
          <img src={logoSrc} alt="" width={44} height={44} className="h-11 w-11 drop-shadow-[0_2px_6px_rgba(201,168,118,0.3)]" />
          <div className="leading-tight">
            <p className="font-display text-[16px] font-semibold tracking-[0.22em] rdp-title-gradient">ROTINA DE PAZ</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--amethyst)]">Círculo da Paz · {APP_BUILD}</p>
          </div>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Abrir perfil"
              className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--gold-warm)]/50 bg-white/80 text-[12px] font-semibold text-[color:var(--gold-warm)] transition hover:brightness-105 active:scale-95"
            >
              {(name?.[0] ?? "P").toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-semibold text-[color:var(--deep-purple)] truncate">{name ?? "Membro"}</span>
              {email && <span className="text-xs font-normal text-[color:var(--amethyst)] truncate">{email}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" /> Painel Admin</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/app/suporte"><LifeBuoy className="mr-2 h-4 w-4" /> Suporte</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" /> Sair da conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              className={`relative flex-1 rounded-xl px-3 py-2.5 text-center transition active:scale-95 ${
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--rose-dust)]/30 bg-white/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto flex max-w-5xl items-stretch px-2 py-1.5">
        {items.map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to} className="relative flex flex-1 flex-col items-center gap-0.5 px-1 py-1.5 transition-transform active:scale-90">
              <div className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                active
                  ? "bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_14px_-6px_rgba(201,168,118,0.55)]"
                  : "text-[color:var(--amethyst)]"
              }`}>
                <Icon className="h-5 w-5" />
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