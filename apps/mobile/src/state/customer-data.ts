import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  SavedAddress,
  CustomerOrderSummary,
} from "@dushanbe-fresh/shared";
import { sessionManager, useSession } from "./session";
export function useSavedAddresses() {
  const session = useSession();
  return useQuery({
    queryKey: ["addresses", session.user?.id],
    enabled: session.phase === "account",
    queryFn: ({ signal }) =>
      sessionManager.request<SavedAddress[]>("/mobile/customer/addresses", {
        signal,
        ownerId: session.user?.id,
      }),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}
export function useCustomerOrders() {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: ["orders", session.user?.id],
    enabled: session.phase === "account",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      sessionManager.request<CustomerOrderSummary[]>(
        `/mobile/customer/orders${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
        { signal, ownerId: session.user?.id },
      ),
    getNextPageParam: (last) =>
      last.length === 50 ? last[last.length - 1]?.id : undefined,
    select: (data) => {
      const seen = new Set<string>();
      return data.pages.flat().filter((order) => {
        if (seen.has(order.id)) return false;
        seen.add(order.id);
        return true;
      });
    },
    staleTime: 10000,
    refetchInterval: 20000,
  });
}
