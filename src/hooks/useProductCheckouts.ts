import { useQuery } from "@tanstack/react-query";
import { checkoutsQueryOptions } from "@/lib/app-queries";

/** Mapa product_id -> checkout_url (Kirvano) para CTAs de "Comprar". */
export function useProductCheckouts() {
  return useQuery(checkoutsQueryOptions);
}

export function checkoutFor(
  checkouts: Map<string, string> | undefined,
  productId: string | null | undefined,
): string | null {
  if (!productId || !checkouts) return null;
  return checkouts.get(productId) ?? null;
}
