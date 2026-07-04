// Query options das abas do app, centralizados num único módulo (sem componentes) para
// permitir prefetch no mount do shell (app.tsx) sem puxar código de rota pro bundle.
// As rotas importam estes options; o shell faz prefetch deles após o login.
import type { BookKey, Louvor } from "@/data/louvores";
import type { Devocional } from "@/data/devocionais";
import { supabase } from "@/integrations/supabase/client";

// Query options exportados para prefetch no shell (app.tsx)
export const entitlementsQueryOptions = {
  queryKey: ["entitlements", "me"] as const,
  queryFn: async (): Promise<Set<string>> => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return new Set();
    const { data, error } = await supabase
      .from("entitlements")
      .select("product_id, status")
      .eq("user_id", auth.user.id)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((r) => r.product_id));
  },
  staleTime: 5 * 60_000,
};

export const checkoutsQueryOptions = {
  queryKey: ["product-checkouts"] as const,
  queryFn: async (): Promise<Map<string, string>> => {
    const { data, error } = await supabase
      .from("products")
      .select("id, checkout_url")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const map = new Map<string, string>();
    for (const r of data ?? []) {
      if (r.checkout_url) map.set(r.id, r.checkout_url);
    }
    return map;
  },
  staleTime: 5 * 60_000,
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const FALLBACK_COVER = "linear-gradient(135deg,#C9A876 0%,#443A52 100%)";

export type DevExt = Devocional & { slug: string; requiredProductId: string | null };

export const ebooksQueryOptions = {
  queryKey: ["app", "ebooks"] as const,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ebooks")
      .select(
        "id, title, subtitle, category, price_cents, badge, cover_url, sort_order, required_product_id, description",
      )
      .eq("status", "active")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

export const louvoresQueryOptions = {
  queryKey: ["app", "louvores"] as const,
  queryFn: async (): Promise<Louvor[]> => {
    const { data, error } = await supabase
      .from("louvores")
      .select(
        "id, book, chapter_index, title, subtitle, duration_seconds, audio_url, is_bonus, sort_order",
      )
      .order("book", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("chapter_index", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      book: r.book as BookKey,
      index: r.chapter_index,
      title: r.title,
      subtitle: r.subtitle ?? "",
      duration: formatDuration(r.duration_seconds ?? 0),
      src: r.audio_url ?? "",
      isBonus: r.is_bonus,
    }));
  },
};

export const devocionaisQueryOptions = {
  queryKey: ["app", "devocionais"] as const,
  queryFn: async (): Promise<DevExt[]> => {
    const { data, error } = await supabase
      .from("courses")
      .select(
        "id, title, subtitle, slug, days, modules, badge, cover_url, sort_order, required_product_id",
      )
      .eq("status", "active")
      .eq("kind", "devocional")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle ?? "",
      slug: r.slug,
      days: r.days ?? 0,
      modules: r.modules ?? 1,
      badge: r.badge ?? "DEVOCIONAL",
      cover: r.cover_url ? `url(${r.cover_url}) center/cover` : FALLBACK_COVER,
      requiredProductId: r.required_product_id ?? null,
    }));
  },
};
