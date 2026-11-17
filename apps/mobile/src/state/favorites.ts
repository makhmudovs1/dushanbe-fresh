import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionManager, useSession } from "./session";
import type { Product } from "../domain/catalog";
export type Favorites = {
  ids: string[];
  products: (Product & { unavailable?: boolean })[];
};
export function useFavorites() {
  const session = useSession();
  return useQuery({
    queryKey: ["favorites", session.user?.id],
    enabled: session.phase === "account",
    queryFn: ({ signal }) =>
      sessionManager.request<Favorites>("/mobile/customer/favorites", {
        signal,
        ownerId: session.user?.id,
      }),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}
export function useFavoriteMutation() {
  const session = useSession();
  const client = useQueryClient();
  const key = ["favorites", session.user?.id];
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      sessionManager.request<{ ids: string[] }>(
        `/mobile/customer/favorites/${encodeURIComponent(id)}`,
        { method: "PUT", body: { active }, ownerId: session.user?.id },
      ),
    onMutate: async ({ id, active }) => {
      await client.cancelQueries({ queryKey: key });
      if (sessionManager.getSnapshot().user?.id !== session.user?.id)
        throw new Error("OWNER_CHANGED");
      const previous = client.getQueryData<Favorites>(key);
      client.setQueryData<Favorites>(key, (old) => ({
        ids: active
          ? [...new Set([...(old?.ids ?? []), id])]
          : (old?.ids ?? []).filter((value) => value !== id),
        products: old?.products ?? [],
      }));
      return { previous, owner: session.user?.id };
    },
    onError: (_error, _variables, context) => {
      if (context?.owner === sessionManager.getSnapshot().user?.id)
        client.setQueryData(key, context?.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
