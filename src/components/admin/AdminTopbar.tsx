import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Search, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin/audit";
import type { AdminRecord } from "@/lib/admin/auth";

type Props = {
  admin: AdminRecord;
  collapsed: boolean;
  onToggle: () => void;
  onMobileOpen: () => void;
};

export function AdminTopbar({ admin, collapsed, onToggle, onMobileOpen }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await logAdminAction("admin.logout");
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  };

  const initials = admin.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 backdrop-blur-2xl lg:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMobileOpen}
        className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop collapse toggle */}
      <button
        onClick={onToggle}
        className="hidden h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:grid"
        title={collapsed ? "Expandir menu" : "Recolher menu"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-1.5 ring-1 ring-white/10 backdrop-blur max-w-md">
        <Search className="h-4 w-4 text-white/55" />
        <input
          type="search"
          placeholder="Buscar leads, produtos, membros..."
          className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#8A90A2]"
          disabled
        />
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70 sm:inline">
          em breve
        </kbd>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden text-right md:block">
          <p className="text-[12px] font-semibold text-white leading-tight">
            {admin.name}
          </p>
          <p className="text-[11px] text-white/55 leading-tight">{admin.email}</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-white/90 to-white/60 text-[12px] font-semibold text-[#1A1B1F] shadow-[0_8px_18px_-4px_rgba(0,0,0,0.45)]">
          {initials || "A"}
        </div>
        <button
          onClick={handleLogout}
          disabled={loading}
          title="Sair"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white/70 ring-1 ring-white/10 backdrop-blur transition hover:text-white hover:bg-white/10 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
