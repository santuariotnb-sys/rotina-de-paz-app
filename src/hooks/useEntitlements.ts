import { useQuery } from "@tanstack/react-query";
import { entitlementsQueryOptions } from "@/lib/app-queries";

export type EntitlementRow = {
  product_id: string;
  status: string;
  granted_at: string;
};

/** Conjunto de product_ids com entitlement ativo do usuário logado. */
export function useEntitlements() {
  return useQuery(entitlementsQueryOptions);
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
