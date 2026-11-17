import { afterEach, describe, expect, it } from "vitest";
import type {
  MobileCartLine as Line,
  MobileCartSnapshot as Snapshot,
} from "@dushanbe-fresh/shared";
import { AccountCartStore, type CartTransport } from "./account-cart-store";
import type { SecretStore } from "./session-manager";
import { ApiError } from "../api/client";
import { serverLine, mergeMax } from "../domain/account-cart";
import { potato } from "../domain/fixtures.test-support";
const line = (id = potato.id, quantity = "1"): Line => ({
  ...serverLine({ product: potato, quantity }),
  productId: id,
});
const engines: AccountCartStore[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.dispose()));
function memory() {
  const values = new Map<string, string>();
  const storage: SecretStore = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    removeItem: async (k) => {
      values.delete(k);
    },
  };
  return { storage, values };
}
function backend() {
  let state: Snapshot = { revision: 0, items: [] };
  const ids = new Set<string>();
  let lostImport = false;
  let lostWrite = false;
  let imports = 0;
  const request: CartTransport = async <T>(
    path: string,
    options?: { method?: "GET" | "POST" | "PUT"; body?: unknown },
  ) => {
    if (path.endsWith("/import")) {
      imports++;
      const body = options!.body as { sourceId: string; items: Line[] };
      if (!ids.has(body.sourceId)) {
        state = {
          revision: state.revision + 1,
          items: mergeMax(state.items, body.items),
        };
        ids.add(body.sourceId);
      }
      if (lostImport) {
        lostImport = false;
        throw new ApiError("network");
      }
      return structuredClone(state) as T;
    }
    if (options?.method === "PUT") {
      const body = options.body as Snapshot;
      if (body.revision !== state.revision)
        throw new ApiError("http", 409, state);
      state = { revision: state.revision + 1, items: body.items };
      if (lostWrite) {
        lostWrite = false;
        throw new ApiError("network");
      }
      return structuredClone(state) as T;
    }
    return structuredClone(state) as T;
  };
  return {
    request,
    get: () => state,
    set: (next: Snapshot) => {
      state = next;
    },
    loseImport: () => {
      lostImport = true;
    },
    loseWrite: () => {
      lostWrite = true;
    },
    imports: () => imports,
  };
}
function engine(
  owner: string,
  m: ReturnType<typeof memory>,
  b: ReturnType<typeof backend>,
  guest: Line[] = [],
) {
  let g = guest;
  const e = new AccountCartStore(
    owner,
    m.storage,
    b.request,
    () => `source-${owner}`,
    () => g,
    async () => {
      g = [];
    },
  );
  engines.push(e);
  return e;
}
describe("owner-scoped cart protocol", () => {
  it("imports guest duplicates by maximum without merging varieties", async () => {
    const m = memory(),
      b = backend();
    b.set({ revision: 2, items: [line()] });
    const e = engine("a", m, b, [line(), line("red", "2")]);
    await e.initialize();
    expect(e.getSnapshot().items.map((i) => [i.productId, i.quantity])).toEqual(
      [
        [potato.id, "1"],
        ["red", "2"],
      ],
    );
  });
  it("retries the same import ID after the server committed but its response was lost", async () => {
    const m = memory(),
      b = backend();
    b.loseImport();
    const e = engine("a", m, b, [line()]);
    await e.initialize();
    expect(e.getSnapshot().error).toBe("network");
    e.dispose();
    const restarted = engine("a", m, b);
    await restarted.initialize();
    expect(b.get().items).toHaveLength(1);
    expect(b.get().items[0]?.quantity).toBe("1");
    expect(b.imports()).toBe(2);
  });
  it("does not donate a claimed guest cart to another account", async () => {
    const m = memory(),
      a = backend();
    a.loseImport();
    const first = engine("a", m, a, [line()]);
    await first.initialize();
    first.dispose();
    const second = engine("b", m, backend(), [line()]);
    await second.initialize();
    expect(second.getSnapshot().items).toEqual([]);
    expect(JSON.parse(m.values.get("df.mobile.guest-claim.v1")!).owner).toBe(
      "a",
    );
  });
  it("preserves remote additions and honors explicit local removals after conflict review", async () => {
    const m = memory(),
      b = backend();
    b.set({ revision: 1, items: [line()] });
    const e = engine("a", m, b);
    await e.initialize();
    e.apply({ type: "remove", id: potato.id });
    b.set({ revision: 2, items: [line(), line("red")] });
    await e.sync();
    expect(e.getSnapshot().error).toBe("conflict");
    await e.sync(true);
    expect(b.get().items.map((i) => i.productId)).toEqual(["red"]);
  });
  it("does not resurrect items after a lost clear acknowledgement", async () => {
    const m = memory(),
      b = backend();
    b.set({ revision: 1, items: [line()] });
    const e = engine("a", m, b);
    await e.initialize();
    e.apply({ type: "clear" });
    b.loseWrite();
    expect(await e.flush()).toBe(false);
    expect(b.get().items).toEqual([]);
    e.dispose();
    const again = engine("a", m, b);
    await again.initialize();
    expect(again.getSnapshot().error).toBe("conflict");
    await again.sync(true);
    expect(b.get().items).toEqual([]);
  });
  it("keeps incompatible legacy snapshots for explicit review", async () => {
    const m = memory(),
      b = backend();
    const legacy = {
      ...line(),
      qualityOptionId: "old",
      qualityOptionLabel: "Old",
    };
    b.set({ revision: 2, items: [legacy] });
    const e = engine("a", m, b, [{ ...legacy, quantity: "2" }]);
    await e.initialize();
    expect(e.getSnapshot().error).toBe("legacy");
    const pair = e.getSnapshot().conflicts[0]!;
    await e.resolve(pair.key, false);
    await e.sync(true);
    expect(b.get().items[0]?.quantity).toBe("1");
  });
  it("rejects quantity edits to legacy lines", async () => {
    const m = memory(),
      b = backend();
    b.set({ revision: 1, items: [{ ...line(), qualityOptionLabel: "Old" }] });
    const e = engine("a", m, b);
    await e.initialize();
    expect(() =>
      e.apply({ type: "change", product: potato, direction: 1 }),
    ).toThrow("LEGACY_CART");
  });
  it("refuses malformed journals without overwriting them", async () => {
    const m = memory(),
      b = backend();
    m.values.set("df.mobile.account-cart.v1.a", "broken");
    const e = engine("a", m, b);
    await e.initialize();
    expect(e.getSnapshot()).toMatchObject({
      hydrated: false,
      error: "storage",
    });
    expect(m.values.get("df.mobile.account-cart.v1.a")).toBe("broken");
  });
  it("fences an in-flight response after disposal", async () => {
    const m = memory(),
      b = backend();
    let resolve: ((value: Snapshot) => void) | undefined;
    b.request = async <T>() =>
      new Promise<Snapshot>((done) => {
        resolve = done;
      }) as Promise<T>;
    const e = engine("a", m, b);
    const starting = e.initialize();
    await new Promise((done) => setTimeout(done, 5));
    e.dispose();
    resolve?.({ revision: 1, items: [line("private")] });
    await starting;
    expect(e.getSnapshot().items).toEqual([]);
  });
  it("explicit clear resolves a legacy review without reimporting its discarded guest lines", async () => {
    const m = memory(),
      b = backend();
    const legacy = {
      ...line(),
      qualityOptionId: "old",
      qualityOptionLabel: "Old",
    };
    b.set({ revision: 2, items: [legacy] });
    const acknowledged: Line[][] = [];
    const e = new AccountCartStore(
      "a",
      m.storage,
      b.request,
      () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      () => [{ ...legacy, quantity: "2" }],
      async (items) => {
        acknowledged.push(items);
      },
    );
    engines.push(e);
    await e.initialize();
    expect(e.getSnapshot().error).toBe("legacy");
    e.apply({ type: "clear" });
    await e.flush();
    expect(b.get().items).toEqual([]);
    expect(
      acknowledged.some((items) => items.some((i) => i.quantity === "2")),
    ).toBe(true);
    expect(m.values.has("df.mobile.guest-claim.v1")).toBe(false);
  });
});
