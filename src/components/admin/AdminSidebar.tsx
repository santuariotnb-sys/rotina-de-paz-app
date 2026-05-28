import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Headphones,
  Music2,
  Clapperboard,
  BookOpen,
  ShoppingBag,
  Users,
  Gem,
  UserSquare2,
  CircleDollarSign,
  Target,
  Settings,
  Webhook,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  exact?: boolean;
  highlight?: boolean;
};

const items: NavItem[] = [
  { to: "/admin", icon: LayoutDashboard, label: "Visão Geral", exact: true },
  { to: "/admin/audios", icon: Headphones, label: "Áudios do Método" },
  { to: "/admin/louvores", icon: Music2, label: "Louvores" },
  { to: "/admin/cursos", icon: Clapperboard, label: "Cursos & Devocionais" },
  { to: "/admin/ebooks", icon: BookOpen, label: "E-books" },
  { to: "/admin/produtos", icon: ShoppingBag, label: "Produtos & Kirvano", highlight: true },
  { to: "/admin/acessos", icon: KeyRound, label: "Acessos & Entitlements" },
  { to: "/admin/clientes", icon: UserSquare2, label: "Clientes" },
  { to: "/admin/webhooks", icon: Webhook, label: "Webhooks" },
  { to: "/admin/leads", icon: Users, label: "Leads do Quiz" },
  { to: "/admin/membros", icon: Gem, label: "Membros" },
  { to: "/admin/vendas", icon: CircleDollarSign, label: "Vendas" },
  { to: "/admin/tracking", icon: Target, label: "Tracking" },
  { to: "/admin/config", icon: Settings, label: "Configurações" },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="adm-glass-dark relative z-10 hidden w-[244px] shrink-0 flex-col py-6 lg:flex">
      <div className="px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-white/90 to-white/60 text-[#1A1B1F] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)]">
            <span className="font-bold" style={{ fontFamily: '"Cormorant Garamond", serif' }}>S</span>
          </div>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
              Santuário
            </p>
            <p className="text-sm font-semibold text-white" style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: '0.04em' }}>
              TNB · Admin
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-7 flex-1 space-y-0.5 px-3">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition",
                active
                  ? "bg-white/[0.10] text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] backdrop-blur ring-1 ring-white/15"
                  : "text-white/65 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white/80" />
              )}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate font-medium">{it.label}</span>
              {it.highlight && !active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 px-5">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2 text-[11px] text-white/70 backdrop-blur">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
            <span className="relative h-2 w-2 rounded-full bg-white/80" />
          </span>
          Santuário conectado
        </div>
      </div>
    </aside>
  );
}