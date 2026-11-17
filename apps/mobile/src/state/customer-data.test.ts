import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ owner: "one", request: vi.fn() }));
vi.mock("./session", () => ({
  useSession: () => ({ phase: "account", user: { id: h.owner } }),
  sessionManager: { request: h.request },
}));
import { useCustomerOrders } from "./customer-data";
let snapshot: ReturnType<typeof useCustomerOrders>;
let renderer: ReactTestRenderer;
let client: QueryClient;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
function Probe() {
  snapshot = useCustomerOrders();
  return null;
}
async function render() {
  await act(async () => {
    renderer = create(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  await tick();
}
async function tick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.owner = "one";
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => renderer?.unmount());
  client.clear();
});
describe("owned order history pagination", () => {
  it("loads the existing before cursor, deduplicates overlap and keeps the owner bound", async () => {
    const first = Array.from({ length: 50 }, (_, i) => ({ id: `order-${i}` }));
    h.request
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ id: "order-49" }, { id: "order-50" }]);
    await render();
    expect(snapshot.data).toHaveLength(50);
    expect(snapshot.hasNextPage).toBe(true);
    await act(async () => {
      await snapshot.fetchNextPage();
    });
    await tick();
    expect(h.request).toHaveBeenLastCalledWith(
      "/mobile/customer/orders?before=order-49",
      expect.objectContaining({
        ownerId: "one",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(snapshot.data).toHaveLength(51);
    expect(snapshot.hasNextPage).toBe(false);
  });
  it("does not show another account's cached orders during an account switch", async () => {
    h.request.mockResolvedValueOnce([{ id: "one-private-order" }]);
    await render();
    expect(snapshot.data?.[0]?.id).toBe("one-private-order");
    let complete!: (value: unknown) => void;
    h.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    h.owner = "two";
    await act(async () =>
      renderer.update(
        createElement(QueryClientProvider, { client }, createElement(Probe)),
      ),
    );
    expect(snapshot.data).toBeUndefined();
    await act(async () => complete([{ id: "two-private-order" }]));
    await tick();
    expect(snapshot.data?.map((x) => x.id)).toEqual(["two-private-order"]);
    expect(h.request).toHaveBeenLastCalledWith(
      "/mobile/customer/orders",
      expect.objectContaining({ ownerId: "two" }),
    );
  });
});
