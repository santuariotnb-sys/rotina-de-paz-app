import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { getCurrentAdmin, type AdminRecord } from "@/lib/admin/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Primordial Digital · Painel" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "login">("checking");

  // On the /admin/login route we skip the gate. We detect that by
  // reading the pathname directly to avoid extra route wiring.
  useEffect(() => {
    let alive = true;
    const isLoginRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin/login");
    if (isLoginRoute) {
      setState("login");
      return;
    }
    (async () => {
      const record = await getCurrentAdmin();
      if (!alive) return;
      if (!record) {
        navigate({ to: "/admin/login", replace: true });
        return;
      }
      setAdmin(record);
      setState("ready");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) navigate({ to: "/admin/login", replace: true });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (state === "login") {
    return (
      <div data-scope="admin" className="adm-bg min-h-dvh">
        <Outlet />
      </div>
    );
  }

  if (state === "checking" || !admin) {
    return (
      <div data-scope="admin" className="adm-bg grid min-h-dvh place-items-center">
        <div className="flex items-center gap-3 text-[13px] text-[var(--adm-text-muted)]">
          <span className="h-2 w-2 animate-ping rounded-full bg-[var(--adm-accent)]" />
          Verificando acesso…
        </div>
      </div>
    );
  }

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("adm-sidebar-collapsed") === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("adm-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div data-scope="admin" className="adm-bg relative min-h-dvh">
      <div className="relative z-10 flex min-h-dvh">
        <AdminSidebar
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            admin={admin}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            onMobileOpen={() => setMobileOpen(true)}
          />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}