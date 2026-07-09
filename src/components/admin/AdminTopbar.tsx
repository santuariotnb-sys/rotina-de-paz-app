import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, ArrowLeft, ListFilter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin/audit";
import type { AdminRecord } from "@/lib/admin/auth";
import { useAdminQuiz } from "@/lib/admin/quiz-context";

type Props = {
  admin: AdminRecord;
  collapsed: boolean;
  onToggle: () => void;
  onMobileOpen: () => void;
};

export function AdminTopbar({ admin, collapsed, onToggle, onMobileOpen }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { quizId, setQuizId, quizzes } = useAdminQuiz();

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
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-1.5 ring-1 ring-white/10 backdrop-blur max-w-md">
        <ListFilter className="h-4 w-4 shrink-0 text-white/55" />
        <select
          value={quizId ?? ""}
          onChange={(e) => setQuizId(e.target.value || null)}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none [&>option]:bg-[#1A1B1F] [&>option]:text-white"
          title="Filtrar métricas por quiz"
        >
          <option value="">Todos os quizzes</option>
          {quizzes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2.5">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> App
        </Link>
        <div className="hidden text-right md:block">
          <p className="text-[12px] font-semibold text-white leading-tight">{admin.name}</p>
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
