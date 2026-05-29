import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import primordiaIcon from "@/assets/primordia-icon.png";
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
  X,
  MessageSquare,
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
  { to: "/admin/suporte", icon: MessageSquare, label: "Suporte" },
  { to: "/admin/config", icon: Settings, label: "Configurações" },
];

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function AdminSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close mobile sidebar on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileOpen, onMobileClose]);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen) onMobileClose();
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn("px-5", collapsed && "px-0 flex justify-center")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <img src={primordiaIcon} alt="Primordia" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-white tracking-wide">
                Primordia
              </p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                Admin
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className={cn("mt-7 flex-1 space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={cn(
                "group relative flex items-center rounded-xl text-[13px] transition",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-white/[0.10] text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] backdrop-blur ring-1 ring-white/15"
                  : "text-white/65 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white/80" />
              )}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate font-medium">{it.label}</span>}
              {!collapsed && it.highlight && !active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />
              )}
              {/* Tooltip for collapsed mode */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-[#1A1B1F] px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
                  {it.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="mt-6 px-5">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2 text-[11px] text-white/70 backdrop-blur">
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
              <span className="relative h-2 w-2 rounded-full bg-white/80" />
            </span>
            Primordia conectado
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "adm-glass-dark relative z-10 hidden shrink-0 flex-col py-6 transition-all duration-300 lg:flex",
          collapsed ? "w-16" : "w-[244px]",
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Sidebar */}
          <aside className="adm-glass-dark relative z-10 flex h-full w-[244px] flex-col py-6 shadow-2xl">
            <button
              onClick={onMobileClose}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
