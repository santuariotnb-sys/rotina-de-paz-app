import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntitlementRow = {
  product_id: string;
  status: string;
  granted_at: string;
};

/** Conjunto de product_ids com entitlement ativo do usuário logado. */
export function useEntitlements() {
  return useQuery({
    queryKey: ["entitlements", "me"],
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
  });
}

/** Helper: o conteúdo está liberado para o usuário?
 *  - sem requiredProductId => sempre liberado
 *  - com requiredProductId => precisa estar no set de entitlements
 */
export function isUnlocked(
  ownedSet: Set<string> | undefined,
  requiredProductId: string | null | undefined,
) {
  if (!requiredProductId) return true;
  if (!ownedSet) return false;
  return ownedSet.has(requiredProductId);
}