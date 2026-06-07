import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import logoSrc from "@/assets/rotina-de-paz-logo.png";
import { TopBar, BottomNav } from "@/components/app/AppNav";
import { PlayerProvider } from "@/components/app/player/PlayerProvider";
import MiniPlayer from "@/components/app/player/MiniPlayer";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearStudent,
  loadStudent,
  SPLASH_KEY,
  syncStudentWithProfile,
  type Student,
} from "@/lib/student";
import { getLegalStatus } from "@/lib/legal/legal.functions";
import { ebooksQueryOptions, louvoresQueryOptions, devocionaisQueryOptions } from "@/lib/app-queries";

// Lazy: tira o framer-motion (~40kb) do bundle inicial do /app. O player expandido só
// carrega quando o usuário abre o FullPlayer.
const FullPlayer = lazy(() => import("@/components/app/player/FullPlayer"));

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Rotina de Paz · App" },
      { name: "description", content: "Seu plano de paz — sessões guiadas, louvores, e-books e devocionais." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();
  const [booting, setBooting] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Splash timer
    const seen = sessionStorage.getItem(SPLASH_KEY);
    const splashTimer = seen
      ? null
      : setTimeout(() => {
          sessionStorage.setItem(SPLASH_KEY, "1");
          if (!cancelled) setBooting(false);
        }, 1500);
    if (seen) setBooting(false);

    // Auth check + legal gate
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/login" });
        return;
      }
      setEmail(data.session.user.email ?? null);
      try {
        const merged = await syncStudentWithProfile(
          data.session.user.id,
          data.session.user.email ?? null,
        );
        if (cancelled) return;
        setStudent(merged ?? loadStudent());
      } catch (e) {
        // Sync falhou (rede/timeout) → usa estado local, nunca trava o cliente pagante.
        console.error("[app] sync de perfil falhou, usando estado local:", e);
        if (cancelled) return;
        setStudent(loadStudent());
      }

      // Check legal acceptance before granting access
      try {
        const { needsAcceptance } = await getLegalStatus();
        if (!cancelled && needsAcceptance) {
          navigate({ to: "/aceite" });
          return;
        }
      } catch {
        // If check fails, allow access (fail-open to not block paying customers)
      }
      if (cancelled) return;
      setAuthReady(true);
      // Aquece o cache das abas em background → trocar de aba vira cache-hit instantâneo.
      void queryClient.prefetchQuery(ebooksQueryOptions);
      void queryClient.prefetchQuery(louvoresQueryOptions);
      void queryClient.prefetchQuery(devocionaisQueryOptions);
    }).catch((e) => {
      // getSession rejeitou → não deixa preso no Splash; libera com estado local.
      console.error("[app] getSession falhou:", e);
      if (cancelled) return;
      setStudent(loadStudent());
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        clearStudent();
        navigate({ to: "/login" });
      } else {
        setEmail(session.user.email ?? null);
      }
    });

    return () => {
      cancelled = true;
      if (splashTimer) clearTimeout(splashTimer);
      sub.subscription.unsubscribe();
    };
  }, [navigate, queryClient]);

  if (booting || !authReady) return <Splash />;

  return (
    <PlayerProvider>
      <main className="rdp-app-bg min-h-dvh max-w-[100vw] overflow-x-hidden">
        <TopBar
          name={student?.name ?? null}
          email={email}
          onLogout={async () => {
            try { await supabase.auth.signOut(); } catch { /* fail-forward: limpa local */ }
            clearStudent();
            navigate({ to: "/login" });
          }}
        />
        <section className="mx-auto w-full max-w-5xl overflow-x-hidden px-4 pb-36 md:pb-28" style={{ paddingBottom: "calc(9rem + env(safe-area-inset-bottom, 0px))" }}>
          <Outlet />
        </section>
        <MiniPlayer />
        <BottomNav />
        <Suspense fallback={null}>
          <FullPlayer />
        </Suspense>
        <Toaster />
      </main>
    </PlayerProvider>
  );
}

function Splash() {
  // Partículas só no cliente: usam Math.random() (não-determinístico) e renderizá-las no
  // SSR causava mismatch de hidratação. Servidor e 1º render do cliente ficam idênticos.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <main className="rdp-night fixed inset-0 z-50 grid place-items-center">
      <div className="rdp-particles" aria-hidden>
        {mounted && Array.from({ length: 28 }).map((_, i) => {
          const left = Math.random() * 100;
          const size = 2 + Math.random() * 4;
          const dur = 6 + Math.random() * 7;
          const delay = -Math.random() * 8;
          const drift = (Math.random() - 0.5) * 80;
          const opacity = 0.5 + Math.random() * 0.5;
          return (
            <span
              key={i}
              className="rdp-particle"
              style={{
                left: `${left}%`,
                width: `${size}px`,
                height: `${size}px`,
                animationDuration: `${dur}s`,
                animationDelay: `${delay}s`,
                ["--rdp-drift" as string]: `${drift}px`,
                opacity,
              }}
            />
          );
        })}
      </div>
      <div className="relative flex flex-col items-center gap-4 rdp-logo-in">
        <img src={logoSrc} alt="Rotina de Paz" width={180} height={180} className="h-44 w-44 rdp-breath" />
        <p className="font-display text-xl tracking-[0.32em] rdp-gold-text">ROTINA DE PAZ</p>
        <div className="mt-2 h-[2px] w-32 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rdp-shimmer" />
        </div>
        <p className="rdp-haja-luz mt-3 font-display text-[11px] uppercase tracking-[0.42em] text-[color:rgba(232,201,160,0.85)]">
          Haja Luz
        </p>
      </div>
    </main>
  );
}