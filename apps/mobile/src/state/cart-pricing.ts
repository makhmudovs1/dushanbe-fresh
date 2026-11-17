import { useQuery } from "@tanstack/react-query";
import type { CheckoutInput, CheckoutQuote } from "@dushanbe-fresh/shared";
import { api } from "../api/config";
import { ApiError } from "../api/client";
import { useSlots } from "../api/queries";
import { isQuote } from "../domain/checkout";
import { useSession } from "./session";

// A public read-only quote is authoritative for fees/minimum/current prices.
// Its cache is still owner-scoped so another account never sees a previous cart.
export function useCartQuote(items: CheckoutInput["items"], ready: boolean) {
  const session = useSession();
  const slots = useSlots();
  const slot = (slots.data?.find((s) => s.available) ?? slots.data?.[0])?.id;
  const owner = session.phase === "account" ? session.user?.id : "guest";
  const key = JSON.stringify(items);
  const quote = useQuery({
    queryKey: ["cart-quote", owner, key, slot],
    enabled:
      ready &&
      !!items.length &&
      !!slot &&
      ["account", "guest"].includes(session.phase),
    staleTime: 15000,
    queryFn: async ({ signal }): Promise<CheckoutQuote> => {
      const result = await api.request("/checkout/validate", {
        method: "POST",
        body: { items: JSON.parse(key), deliverySlotId: slot },
        signal,
      });
      if (!isQuote(result)) throw new ApiError("response");
      return result;
    },
  });
  return {
    ...quote,
    pending: ready && !!items.length && (slots.isPending || quote.isFetching),
    failed: slots.isError || quote.isError,
  };
}
