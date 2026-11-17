import { AppState } from "react-native";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { secrets } from "./secure-storage.native";
export { secrets } from "./secure-storage.native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/config";
import { SessionManager } from "./session-manager";
export const sessionManager = new SessionManager(secrets, api);
export function useSession() {
  return useSyncExternalStore(
    sessionManager.subscribe,
    sessionManager.getSnapshot,
    sessionManager.getSnapshot,
  );
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  useEffect(() => {
    let previous: string | null = null;
    const stop = sessionManager.subscribe(() => {
      const next = sessionManager.getSnapshot().user?.id ?? null;
      if (next !== previous) {
        void client.cancelQueries();
        client.clear();
        previous = next;
      }
    });
    void sessionManager.restore();
    const focus = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void sessionManager.refreshProfile().catch(() => {});
    });
    return () => {
      stop();
      focus.remove();
    };
  }, [client]);
  return children;
}
