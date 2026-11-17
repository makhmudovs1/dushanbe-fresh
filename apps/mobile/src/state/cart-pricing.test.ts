import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  owner: "one",
  phase: "account",
  request: vi.fn(),
}));
vi.mock("./session", () => ({
  useSession: () => ({
    phase: h.phase,
    user: h.phase === "account" ? { id: h.owner } : null,
  }),
}));
vi.mock("../api/config", () => ({ api: { request: h.request } }));
vi.mock("../api/queries", () => ({
  useSlots: () => ({
    data: [{ id: "available-slot", available: true }],
    isPending: false,
    isError: false,
  }),
}));
import { useCartQuote } from "./cart-pricing";
const quote = (amount: string) => ({
  valid: false,
  reviewToken: "a".repeat(64),
  itemsSubtotal: amount,
  deliveryFee: "5",
  serviceFee: "1",
  totalEstimated: amount,
  minimumOrderAmount: "100",
  minimumOrderShortfall: "90",
  items: [],
  errors: [],
});
let snapshot: ReturnType<typeof useCartQuote>;
let renderer: ReactTestRenderer;
let client: QueryClient;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
function Probe() {
  snapshot = useCartQuote(
    [{ productId: "product", quantity: "0.5", observedPrice: "20", qualityOptionId: null }],
    true,
  );
  return null;
}
async function tick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
async function render() {
  await act(async () => {
    renderer = create(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  await tick();
}
beforeEach(() => {
  vi.clearAllMocks();
  h.owner = "one";
  h.phase = "account";
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => renderer?.unmount());
  client.clear();
});
it("gets authoritative delivery/minimum totals using the real read-only quote contract", async () => {
  h.request.mockResolvedValueOnce(quote("16"));
  await render();
  expect(h.request).toHaveBeenCalledWith(
    "/checkout/validate",
    expect.objectContaining({
      method: "POST",
      signal: expect.any(AbortSignal),
      body: {
        deliverySlotId: "available-slot",
        items: [{ productId: "product", quantity: "0.5", observedPrice: "20", qualityOptionId: null }],
      },
    }),
  );
  expect(snapshot.data?.deliveryFee).toBe("5");
  expect(snapshot.data?.totalEstimated).toBe("16");
});
it("never displays the previous account's quote during a slow account switch", async () => {
  h.request.mockResolvedValueOnce(quote("16"));
  await render();
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
  await act(async () => complete(quote("26")));
  await tick();
  expect(snapshot.data?.totalEstimated).toBe("26");
});
it("does not request cart pricing while the identity is unresolved or locked", async () => {
  h.phase = "locked";
  await render();
  expect(h.request).not.toHaveBeenCalled();
  expect(snapshot.data).toBeUndefined();
});
