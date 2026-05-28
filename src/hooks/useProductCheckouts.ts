import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Mapa product_id -> checkout_url (Kirvano) para CTAs de "Comprar". */
export function useProductCheckouts() {
  return useQuery({
    queryKey: ["product-checkouts"],
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
  });
}

export function checkoutFor(
  checkouts: Map<string, string> | undefined,
  productId: string | null | undefined,
): string | null {
  if (!productId || !checkouts) return null;
  return checkouts.get(productId) ?? null;
}