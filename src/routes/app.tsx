import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logoSrc from "@/assets/rotina-de-paz-logo.png";
import { TopBar, BottomNav } from "@/components/app/AppNav";
import { PlayerProvider } from "@/components/app/player/PlayerProvider";
import MiniPlayer from "@/components/app/player/MiniPlayer";
import FullPlayer from "@/components/app/player/FullPlayer";
import { supabase } from "@/integrations/supabase/client";
import {
  clearStudent,
  loadStudent,
  SPLASH_KEY,
  syncStudentWithProfile,
  type Student,
} from "@/lib/student";

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
  const [booting, setBooting] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
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

    // Auth check
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/login" });
        return;
      }
      const merged = await syncStudentWithProfile(
        data.session.user.id,
        data.session.user.email ?? null,
      );
      if (!cancelled) {
        setStudent(merged ?? loadStudent());
        setAuthReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        clearStudent();
        navigate({ to: "/login" });
      }
    });

    return () => {
      cancelled = true;
      if (splashTimer) clearTimeout(splashTimer);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (booting || !authReady) return <Splash />;

  return (
    <PlayerProvider>
      <main className="rdp-app-bg min-h-dvh">
        <TopBar
          name={student?.name ?? null}
          onLogout={async () => {
            await supabase.auth.signOut();
            clearStudent();
            navigate({ to: "/login" });
          }}
        />
        <section className="mx-auto max-w-5xl px-4 pb-36 md:pb-28">
          <Outlet />
        </section>
        <MiniPlayer />
        <BottomNav />
        <FullPlayer />
      </main>
    </PlayerProvider>
  );
}

function Splash() {
  const particles = Array.from({ length: 28 });
  return (
    <main className="rdp-night fixed inset-0 z-50 grid place-items-center">
      <div className="rdp-particles" aria-hidden>
        {particles.map((_, i) => {
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