import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDeepStrictEqual } from "node:util";
import { CustomerError } from "@/lib/customer";
import type { Product } from "@/lib/api";
import {
  AccountCartSync, accountCartStorageKey, CartRequest, CartSnapshot, CartSyncView,
  findLegacyCartConflicts, loadGuestCart, mergeCartItemsMax, reconcileCartItems
} from "./account-cart";
import { CART_STORAGE_KEY, CartItem, getCartItemKey, loadCart, saveCart } from "./cart";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const item = (quantity = "1", productId = "tomatoes", qualityOptionId: string | null = null): CartItem => ({
  productId, quantity, slug: productId, name: "Tomatoes", imageUrl: null, unit: "kg", sellingPrice: "10.50",
  isWeighted: true, minQuantity: "0.5", quantityStep: "0.5", qualityOptionId,
  qualityOptionLabel: qualityOptionId ? "Historical preference" : null
});
const key = getCartItemKey(item());
const sourceId = "a0000000-0000-4000-8000-000000000001";
const legacyCases = [
  { kind: "preference ID", line: item("1", "old", "ripe") },
  { kind: "RU label only", line: { ...item("1", "old"), qualityOptionLabel: "Historical RU label" } },
  { kind: "TJ label only", line: { ...item("1", "old"), qualityOptionLabelTj: "Historical TJ label" } }
];
const labelOnlyCases = legacyCases.filter(({ line }) => !line.qualityOptionId);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function server(initial: CartSnapshot = { revision: 0, items: [] }) {
  let snapshot = initial;
  const sources = new Set<string>();
  // Independent server contract: never use the client merge/reconciliation helpers here.
  const legacy = (line: CartItem) => !!(line.qualityOptionId || line.qualityOptionLabel || line.qualityOptionLabelTj);
  const sameKey = (left: CartItem, right: CartItem) => left.productId === right.productId && left.qualityOptionId === right.qualityOptionId;
  const assertCompatible = (incoming: CartItem[]) => {
    const conflicts = incoming.flatMap(line => {
      const saved = snapshot.items.find(old => sameKey(old, line));
      return saved && (legacy(saved) || legacy(line)) && !isDeepStrictEqual(saved, line) ? [{ saved, incoming: line }] : [];
    });
    if (conflicts.length) throw new CustomerError("В корзинах есть несовместимые старые позиции.", 422, {
      code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false, currentCart: snapshot, conflicts
    });
  };
  const request = vi.fn(async (_path: string, method = "GET", body?: unknown) => {
    if (method === "GET") return snapshot;
    if (method === "POST") {
      const imported = body as { sourceId: string; items: CartItem[] };
      if (!sources.has(imported.sourceId)) {
        assertCompatible(imported.items);
        const items = [...snapshot.items];
        for (const line of imported.items) {
          const index = items.findIndex(saved => sameKey(saved, line));
          if (index < 0) items.push(line);
          else if (!legacy(items[index])) {
            items[index] = legacy(line) ? line : {
              ...items[index], quantity: Number(line.quantity) > Number(items[index].quantity) ? line.quantity : items[index].quantity
            };
          }
        }
        snapshot = { revision: snapshot.revision + 1, items };
        sources.add(imported.sourceId);
      }
    } else {
      const saved = body as CartSnapshot;
      if (saved.revision !== snapshot.revision) throw new CustomerError("Conflict", 409, snapshot);
      assertCompatible(saved.items);
      const items = saved.items.map(line => {
        const previous = snapshot.items.find(old => sameKey(old, line));
        return previous && legacy(previous) ? previous : line;
      });
      snapshot = { revision: snapshot.revision + 1, items };
    }
    return snapshot;
  });
  return { request, current: () => snapshot, replace: (next: CartSnapshot) => { snapshot = next; } };
}

const sessions: AccountCartSync[] = [];
function harness(request: CartRequest, storage: Storage | undefined = new MemoryStorage(), userId = "alice", uuid = vi.fn(() => sourceId)) {
  const views: CartSyncView[] = [];
  const session = new AccountCartSync(userId, storage, request, uuid, view => views.push(view), 50);
  sessions.push(session);
  return { session, views, view: () => views[views.length - 1], storage: storage!, uuid };
}
const stored = (storage: Storage, owner = "alice") => JSON.parse(storage.getItem(accountCartStorageKey(owner))!);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); vi.useRealTimers(); });

describe("account cart pure reconciliation", () => {
  it("merges ordinary quantities by MAX, retaining saved metadata and immutable legacy keys", () => {
    const saved = [item("2"), item("1", "tomatoes", "ripe"), item("0.75", "tomatoes", "firm")];
    const incoming = [
      { ...item("3"), sellingPrice: "99", quantityStep: "2" }, item("2", "tomatoes", "ripe"), item("1", "potatoes")
    ];
    const merged = mergeCartItemsMax(saved, incoming);
    expect(merged).toEqual([{ ...saved[0], quantity: "3" }, saved[1], saved[2], incoming[2]]);
    expect(mergeCartItemsMax(merged, incoming)).toEqual(merged);
    expect(saved.map(line => line.quantity)).toEqual(["2", "1", "0.75"]);
  });

  it("keeps removals and decreases when remote did not change, without erasing other-device additions", () => {
    const base = [item("2"), item("1", "potatoes")];
    expect(reconcileCartItems(base, [item("1")], [...base, item("3", "apples")]))
      .toEqual([item("1"), item("3", "apples")]);
    expect(reconcileCartItems(base, [], base)).toEqual([]);
  });

  it("uses MAX for simultaneous quantity edits, but never rewrites a remote legacy snapshot", () => {
    const legacy = item("1", "old", "ripe");
    expect(reconcileCartItems([item("1"), legacy], [item("2"), { ...legacy, quantity: "9" }], [item("3"), legacy]))
      .toEqual([item("3"), legacy]);
    expect(reconcileCartItems([legacy], [], [legacy])).toEqual([]);
  });

  it("does not normalize invalid historical quantities or alter prices/min/step", () => {
    const old = { ...item("0.75"), quantityStep: "0.25", sellingPrice: "5" };
    expect(mergeCartItemsMax([old], [item("0.5")])).toEqual([old]);
    expect(reconcileCartItems([old], [old], [old])).toEqual([old]);
  });

  it("does not collide null preferences with a historical ID or delimiter-containing product IDs", () => {
    const lines = [item("1"), item("2", "tomatoes", "none"), item("3", "a:b", "c"), item("4", "a", "b:c")];
    expect(mergeCartItemsMax([], lines)).toEqual(lines);
    expect(reconcileCartItems([], lines, [])).toEqual(lines);
  });

  it.each(legacyCases)("freezes the complete saved $kind snapshot on import and conflict retry", ({ line }) => {
    const incoming = { ...line, quantity: "9", name: "Changed name", sellingPrice: "99", minQuantity: "2", quantityStep: "2" };
    expect(mergeCartItemsMax([line], [incoming])).toEqual([line]);
    expect(reconcileCartItems([], [incoming], [line])).toEqual([line]);
    expect(reconcileCartItems([line], [incoming], [line])).toEqual([line]);
    expect(reconcileCartItems([line], [], [line])).toEqual([]);
    expect(findLegacyCartConflicts({ revision: 1, items: [line] }, [incoming]))
      .toEqual([{ key: JSON.stringify([line.productId, line.qualityOptionId]), saved: line, incoming }]);
    expect(findLegacyCartConflicts({ revision: 1, items: [line] }, [Object.fromEntries(Object.entries(line).reverse()) as CartItem])).toEqual([]);
  });

  it.each(labelOnlyCases)("keeps saved $kind legacy when an ordinary line has the same null-preference key", ({ line }) => {
    const ordinary = { ...item("9", line.productId), sellingPrice: "99" };
    expect(mergeCartItemsMax([line], [ordinary])).toEqual([line]);
    expect(reconcileCartItems([], [ordinary], [line])).toEqual([line]);
    expect(reconcileCartItems([item("1", line.productId)], [ordinary], [line])).toEqual([line]);
  });

  it.each(labelOnlyCases)("retains the entire incoming $kind snapshot over a colliding ordinary line, even at lower quantity", ({ line }) => {
    const ordinary = { ...item("9", line.productId), sellingPrice: "99", minQuantity: "2", quantityStep: "2" };
    expect(mergeCartItemsMax([ordinary], [line])).toEqual([line]);
    expect(mergeCartItemsMax([], [line])).toEqual([line]);
    expect(reconcileCartItems([], [line], [ordinary])).toEqual([line]);
    expect(reconcileCartItems([item("8", line.productId)], [line], [ordinary])).toEqual([line]);
  });
});

describe("verified-owner cart sync", () => {
  it.each(legacyCases)("retains rejected $kind imports until explicit incoming removal, keeping the server snapshot intact", async ({ line }) => {
    const storage = new MemoryStorage();
    const baseline = [line, item("1")];
    storage.setItem(accountCartStorageKey("alice"), JSON.stringify({
      snapshot: { revision: 1, items: baseline },
      pending: { revision: 1, items: [line, item("2")], baseItems: baseline },
      guestImport: null, acknowledgedImport: null
    }));
    const incoming = { ...line, quantity: "9", sellingPrice: "99", name: "Guest legacy snapshot" };
    saveCart(storage, { items: [incoming] });
    const api = server({ revision: 1, items: baseline });
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    expect(h.views.every(view => view.state.items.find(old => old.productId === line.productId)?.quantity === "1")).toBe(true);
    expect(h.view().state.items).toEqual([line, item("2")]);
    expect(stored(storage).pending.items).toEqual([line, item("2")]);
    expect(api.current().items).toEqual(baseline);
    expect(h.view().legacyConflicts).toEqual([{ key: JSON.stringify([line.productId, line.qualityOptionId]), saved: line, incoming }]);
    expect(loadCart(storage).items).toEqual([incoming]);
    expect(stored(storage).guestImport).toEqual({ sourceId, items: [incoming] });
    const count = api.request.mock.calls.length;
    h.session.retrySync();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.request).toHaveBeenCalledTimes(count);
    h.session.discardIncoming(h.view().legacyConflicts[0].key);
    expect(h.view().legacyConflicts).toEqual([]);
    expect(stored(storage).guestImport).toEqual({ sourceId, items: [] });
    await h.session.start(true);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    expect(api.request.mock.calls.find(([, method]) => method === "PUT")?.[2]).toEqual({ revision: 2, items: [line, item("2")] });
    expect(api.current().items).toEqual([line, item("2")]);
    expect(h.view().syncError).toBe("");
  });

  it.each(legacyCases)("reconciles a locally new $kind key against remote legacy before writing the journal or PUT", async ({ line }) => {
    const storage = new MemoryStorage();
    const incoming = { ...line, quantity: "9", name: "Local legacy snapshot", sellingPrice: "99" };
    storage.setItem(accountCartStorageKey("alice"), JSON.stringify({
      snapshot: { revision: 1, items: [] },
      pending: { revision: 1, items: [incoming], baseItems: [] },
      guestImport: null, acknowledgedImport: null
    }));
    // Scripted authoritative responses, not a MAX-based mock that could conceal client-side edits.
    const request = vi.fn(async (_path: string, method = "GET", body?: unknown) => {
      if (method === "GET") return { revision: 2, items: [line] };
      expect(method).toBe("PUT");
      expect(body).toEqual({ revision: 2, items: [line] });
      return { revision: 3, items: [line] };
    });
    const h = harness(request as CartRequest, storage);
    await h.session.start();
    expect(h.view().syncError).toContain("другом устройстве");
    expect(request).toHaveBeenCalledTimes(1);
    await h.session.start(true);
    expect(h.view().legacyConflicts).toEqual([{ key: JSON.stringify([line.productId, line.qualityOptionId]), saved: line, incoming }]);
    expect(request.mock.calls.every(([, method]) => method === undefined || method === "GET")).toBe(true);
    h.session.discardIncoming(h.view().legacyConflicts[0].key);
    await h.session.start(true);
    expect(h.view().state.items).toEqual([line]);
    expect(stored(storage).pending.items).toEqual([line]);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.view().state.items).toEqual([line]);
    expect(h.view().syncError).toBe("");
    expect(stored(storage).pending).toBeNull();
  });

  it.each(labelOnlyCases)("preserves rejected incoming $kind snapshots until explicit discard without relabelling the server line", async ({ line }) => {
    const storage = new MemoryStorage();
    const ordinary = { ...item("9", line.productId), sellingPrice: "99" };
    storage.setItem(accountCartStorageKey("alice"), JSON.stringify({
      snapshot: { revision: 1, items: [ordinary] }, pending: null, guestImport: null, acknowledgedImport: null
    }));
    saveCart(storage, { items: [line] });
    const api = server({ revision: 1, items: [ordinary] });
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    expect(h.views.every(view => view.state.items.length === 1 && JSON.stringify(view.state.items[0]) === JSON.stringify(line))).toBe(true);
    expect(h.view().state.items).toEqual([line]);
    expect(h.view().legacyConflicts).toEqual([{ key: JSON.stringify([line.productId, null]), saved: ordinary, incoming: line }]);
    expect(loadCart(storage).items).toEqual([line]);
    expect(stored(storage).snapshot).toEqual({ revision: 1, items: [ordinary] });
    expect(stored(storage).pending).toBeNull();
    h.session.discardIncoming(h.view().legacyConflicts[0].key);
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([ordinary]);
    expect(h.view().state.items).toEqual([ordinary]);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("persists a stable import before POST, blocks initial taps, clears only guest cache on acknowledgement", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const api = server({ revision: 2, items: [item("3"), item("1", "apples")] });
    const response = deferred<CartSnapshot>();
    const request = vi.fn(async (path: string, method?: string, body?: unknown) => {
      if (method === "POST") {
        expect(stored(storage).guestImport).toEqual({ sourceId, items: [item("2")] });
        return response.promise;
      }
      return api.request(path, method, body);
    });
    const first = harness(request as CartRequest, storage);
    const starting = first.session.start();
    await Promise.resolve();
    expect(first.view()).toMatchObject({ hydrated: false, syncing: true });
    expect(first.session.apply({ type: "increment", key })).toBe(false);
    expect(loadCart(storage).items).toEqual([item("2")]);
    expect(loadGuestCart(storage).items).toEqual([]);
    response.resolve({ revision: 3, items: [item("3"), item("1", "apples")] });
    await starting;
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(first.view()).toMatchObject({ hydrated: true, syncing: false, syncError: "", state: { items: [item("3"), item("1", "apples")] } });
    expect(first.views.every(view => view.state.items.length > 0)).toBe(true);
    first.session.dispose();
    await harness(api.request as CartRequest, storage).session.start();
    expect(api.request.mock.calls.some(([, method]) => method === "POST")).toBe(false);
  });

  it("persists a rejected review across reload, blocks retries, and retains unrelated guest goods with the same UUID", async () => {
    const storage = new MemoryStorage();
    const saved = item("1", "old", "ripe");
    const incoming = { ...saved, quantity: "9" };
    const other = item("2", "apples");
    saveCart(storage, { items: [incoming, other] });
    const api = server({ revision: 1, items: [saved] });
    const first = harness(api.request as CartRequest, storage);
    await first.session.start();
    const rawGuest = storage.getItem(CART_STORAGE_KEY);
    expect(stored(storage).guestImport).toEqual({ sourceId, items: [incoming, other] });
    const count = api.request.mock.calls.length;
    first.session.dispose();
    const second = harness(api.request as CartRequest, storage);
    await second.session.start();
    second.session.retrySync();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.request).toHaveBeenCalledTimes(count);
    expect(second.uuid).not.toHaveBeenCalled();
    expect(storage.getItem(CART_STORAGE_KEY)).toBe(rawGuest);
    expect(second.view().legacyConflicts[0]).toMatchObject({ saved, incoming });
    second.session.discardIncoming(second.view().legacyConflicts[0].key);
    expect(stored(storage).guestImport).toEqual({ sourceId, items: [other] });
    expect(loadCart(storage).items).toEqual([other]);
    await second.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([saved, other]);
    expect(second.view().syncError).toBe("");
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(api.request.mock.calls.filter(([, method]) => method === "POST").map(([, , body]) => (body as { sourceId: string }).sourceId))
      .toEqual([sourceId, sourceId]);
  });

  it.each(legacyCases)("removes both conflicting $kind snapshots only after explicit action, preserving other guest lines", async ({ line }) => {
    const storage = new MemoryStorage();
    const incoming = { ...line, quantity: "9" };
    const other = item("2", "apples");
    saveCart(storage, { items: [incoming, other] });
    const api = server({ revision: 1, items: [line] });
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    expect(api.current().items).toEqual([line]);
    h.session.removeBoth(h.view().legacyConflicts[0].key);
    expect(h.view().state.items).toEqual([other]);
    expect(stored(storage).pending.items).toEqual([other]);
    expect(stored(storage).guestImport).toEqual({ sourceId, items: [other] });
    expect(api.current().items).toEqual([line]);
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([other]);
    expect(api.request.mock.calls.find(([, method]) => method === "PUT")?.[2]).toEqual({ revision: 2, items: [other] });
    expect(h.view().legacyConflicts).toEqual([]);
  });

  it("keeps every unresolved pair until its own confirmation and does not accept unknown or disposed-owner actions", async () => {
    const saved = [legacyCases[0].line, legacyCases[1].line];
    const incoming = saved.map(line => ({ ...line, quantity: "9" }));
    const storage = new MemoryStorage();
    saveCart(storage, { items: incoming });
    const api = server({ revision: 1, items: saved });
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    const [first, second] = h.view().legacyConflicts;
    const initial = storage.getItem(accountCartStorageKey("alice"));
    expect(h.session.discardIncoming("unknown")).toBe(false);
    expect(storage.getItem(accountCartStorageKey("alice"))).toBe(initial);
    h.session.discardIncoming(first.key);
    expect(h.view().legacyConflicts).toEqual([second]);
    expect(stored(storage).guestImport.items).toEqual([incoming[1]]);
    const count = api.request.mock.calls.length;
    h.session.retrySync();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.request).toHaveBeenCalledTimes(count);
    h.session.removeBoth(second.key);
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([saved[0]]);
    h.session.dispose();
    const acknowledged = storage.getItem(accountCartStorageKey("alice"));
    expect(h.session.removeBoth(first.key)).toBe(false);
    expect(storage.getItem(accountCartStorageKey("alice"))).toBe(acknowledged);
  });

  it("handles a PUT 422 with an actionable review, then allows ordinary removeItem to remove both and retry", async () => {
    const ordinary = item("1", "old");
    const saved = { ...ordinary, quantity: "3", qualityOptionLabel: "Historical RU label" };
    const api = server({ revision: 1, items: [ordinary] });
    const request = vi.fn((path: string, method?: string, body?: unknown) => {
      if (method === "PUT") api.replace({ revision: 1, items: [saved] });
      return api.request(path, method, body);
    });
    const h = harness(request as CartRequest);
    await h.session.start();
    h.session.apply({ type: "increment", key: getCartItemKey(ordinary) });
    await vi.advanceTimersByTimeAsync(50);
    expect(h.view().legacyConflicts).toEqual([{
      key: JSON.stringify([ordinary.productId, null]), saved, incoming: { ...ordinary, quantity: "1.5" }
    }]);
    expect(h.view().syncError).toContain("несовместимые");
    expect(h.session.apply({ type: "remove", key: getCartItemKey(ordinary) })).toBe(true);
    expect(h.view().state.items).toEqual([]);
    expect(h.view().legacyConflicts).toEqual([]);
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([]);
    expect(h.view().syncError).toBe("");
  });

  it("keeps unacknowledged guest data hidden from another user while legacy review is pending", async () => {
    const storage = new MemoryStorage();
    const saved = legacyCases[0].line;
    saveCart(storage, { items: [{ ...saved, quantity: "9" }] });
    const alice = harness(server({ revision: 1, items: [saved] }).request as CartRequest, storage);
    await alice.session.start();
    alice.session.dispose();
    const aliceRecord = storage.getItem(accountCartStorageKey("alice"));
    const guest = storage.getItem(CART_STORAGE_KEY);
    const bob = harness(server().request as CartRequest, storage, "bob");
    await bob.session.start();
    expect(bob.view().state.items).toEqual([]);
    expect(bob.view().legacyConflicts).toEqual([]);
    bob.session.removeBoth(JSON.stringify([saved.productId, saved.qualityOptionId]));
    expect(storage.getItem(accountCartStorageKey("alice"))).toBe(aliceRecord);
    expect(storage.getItem(CART_STORAGE_KEY)).toBe(guest);
    expect(loadGuestCart(storage).items).toEqual([]);
  });

  it("does not apply a late 422 review after the account session is disposed", async () => {
    const storage = new MemoryStorage();
    const saved = legacyCases[0].line;
    const incoming = { ...saved, quantity: "9" };
    saveCart(storage, { items: [incoming] });
    const rejected = deferred<CartSnapshot>();
    const request = vi.fn((_path: string, method?: string) => method === "POST" ? rejected.promise : Promise.resolve({ revision: 1, items: [saved] }));
    const h = harness(request as CartRequest, storage);
    const start = h.session.start();
    await vi.advanceTimersByTimeAsync(0);
    h.session.dispose();
    const before = storage.getItem(accountCartStorageKey("alice"));
    const count = h.views.length;
    rejected.reject(new CustomerError("Несовместимые старые позиции.", 422, {
      code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false,
      currentCart: { revision: 1, items: [saved] }, conflicts: [{ saved, incoming }]
    }));
    await start;
    expect(h.views).toHaveLength(count);
    expect(storage.getItem(accountCartStorageKey("alice"))).toBe(before);
  });

  it("retries lost import responses with the same UUID after reload, never reimports into another owner", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const api = server({ revision: 1, items: [item("1")] });
    const lost = vi.fn(async (path: string, method?: string, body?: unknown) => {
      const result = await api.request(path, method, body);
      if (method === "POST") throw new Error("Response lost");
      return result;
    });
    const first = harness(lost as CartRequest, storage);
    await first.session.start();
    expect(first.view().syncError).not.toBe("");
    expect(first.view().state.items).toEqual([item("2")]);
    expect(loadCart(storage).items).toEqual([item("2")]);
    first.session.dispose();
    const bobApi = server();
    const bob = harness(bobApi.request as CartRequest, storage, "bob");
    await bob.session.start();
    expect(bob.view().state.items).toEqual([]);
    expect(bobApi.request.mock.calls).toHaveLength(1);
    const second = harness(api.request as CartRequest, storage);
    await second.session.start();
    expect(second.uuid).not.toHaveBeenCalled();
    expect(api.request.mock.calls.filter(([, method]) => method === "POST").map(([, , body]) => (body as { sourceId: string }).sourceId))
      .toEqual([sourceId, sourceId]);
    expect(api.current().items).toEqual([item("2")]);
    expect(second.view().state.items).toEqual([item("2")]);
  });

  it("immediately journals checkout clear; reload never hydrates a stale server cart", async () => {
    const api = server({ revision: 4, items: [item("2")] });
    const first = harness(api.request as CartRequest);
    await first.session.start();
    first.session.apply({ type: "clear" });
    expect(stored(first.storage).pending).toMatchObject({ revision: 4, items: [] });
    first.session.dispose();
    const second = harness(api.request as CartRequest, first.storage);
    await second.session.start();
    expect(second.views.every(view => view.state.items.length === 0)).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([]);
    expect(stored(first.storage).pending).toBeNull();
  });

  it("serializes/debounces CAS writes and never applies an old response over newer edits or clear", async () => {
    const api = server({ revision: 1, items: [item("1")] });
    const oldResponse = deferred<CartSnapshot>();
    let puts = 0;
    const request = vi.fn(async (path: string, method?: string, body?: unknown) => {
      if (method === "PUT" && puts++ === 0) return oldResponse.promise;
      return api.request(path, method, body);
    });
    const h = harness(request as CartRequest);
    await h.session.start();
    h.session.apply({ type: "increment", key });
    h.session.apply({ type: "increment", key });
    expect(stored(h.storage).pending.items).toEqual([item("2")]);
    await vi.advanceTimersByTimeAsync(50);
    h.session.apply({ type: "clear" });
    expect(stored(h.storage).pending.items).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(puts).toBe(1);
    const ack = { revision: 2, items: [item("2")] };
    api.replace(ack);
    oldResponse.resolve(ack);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.view().state.items).toEqual([]);
    expect(stored(h.storage).pending).toMatchObject({ revision: 2, items: [] });
    await vi.advanceTimersByTimeAsync(50);
    expect(puts).toBe(2);
    expect(api.current()).toEqual({ revision: 3, items: [] });
  });

  it("stops on conflict, leaves local edits visible, and merges only after explicit retry", async () => {
    const api = server({ revision: 1, items: [item("1")] });
    const h = harness(api.request as CartRequest);
    await h.session.start();
    h.session.apply({ type: "increment", key });
    api.replace({ revision: 2, items: [item("3"), item("1", "apples")] });
    await vi.advanceTimersByTimeAsync(50);
    expect(h.view().syncError).toContain("другом устройстве");
    expect(h.view().state.items).toEqual([item("1.5")]);
    h.session.apply({ type: "increment", key });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.request.mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(1);
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([item("3"), item("1", "apples")]);
    expect(h.view().syncError).toBe("");
  });

  it("detects a stale persisted journal on startup without automatically overwriting remote edits", async () => {
    const api = server({ revision: 1, items: [item("1")] });
    const first = harness(api.request as CartRequest);
    await first.session.start();
    first.session.apply({ type: "clear" });
    first.session.dispose();
    api.replace({ revision: 2, items: [item("3"), item("1", "apples")] });
    const second = harness(api.request as CartRequest, first.storage);
    await second.session.start();
    expect(second.view().state.items).toEqual([]);
    expect(second.view().syncError).toContain("другом устройстве");
    await vi.advanceTimersByTimeAsync(500);
    expect(api.current().revision).toBe(2);
    second.session.retrySync();
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([item("1", "apples")]);
  });

  it("shows a local cart on initial fetch failure, journals offline edits, and retries import safely", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const api = server();
    api.request.mockRejectedValueOnce(new Error("Offline"));
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    expect(h.view()).toMatchObject({ hydrated: true, syncing: false, state: { items: [item("2")] } });
    expect(h.view().syncError).not.toBe("");
    h.session.apply({ type: "decrement", key });
    expect(stored(storage).pending).toMatchObject({ revision: null, items: [item("1.5")] });
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([item("1.5")]);
    expect(h.uuid).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("preserves legacy lines and refreshes ordinary rules without normalization or repricing", async () => {
    const legacy = item("0.75", "old", "ripe");
    const old = { ...item("0.75"), quantityStep: "0.25" };
    const api = server({ revision: 1, items: [legacy, old] });
    const h = harness(api.request as CartRequest);
    await h.session.start();
    expect(h.session.apply({ type: "increment", key: getCartItemKey(legacy) })).toBe(false);
    expect(h.session.apply({ type: "add", item: item("1", "old") })).toBe(false);
    h.session.apply({ type: "refresh-quantity-rules", products: [
      { id: "old", minQuantity: "2", quantityStep: "2" }, { id: "tomatoes", minQuantity: "0.5", quantityStep: "0.5" }
    ] as Product[] });
    expect(h.view().state.items).toEqual([legacy, { ...old, quantityStep: "0.5" }]);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual(h.view().state.items);
  });

  it("fences a disposed owner's late GET/import/PUT responses and does not delete server carts", async () => {
    for (const method of ["GET", "POST", "PUT"]) {
      const storage = new MemoryStorage();
      if (method === "POST") saveCart(storage, { items: [item("1")] });
      const delayed = deferred<CartSnapshot>();
      const api = server({ revision: 1, items: [item("1")] });
      const request = vi.fn((path: string, verb = "GET", body?: unknown) => verb === method ? delayed.promise : api.request(path, verb, body));
      const h = harness(request as CartRequest, storage);
      const starting = h.session.start();
      if (method === "PUT") { await starting; h.session.apply({ type: "clear" }); await vi.advanceTimersByTimeAsync(50); }
      else await vi.advanceTimersByTimeAsync(0);
      h.session.dispose();
      const before = storage.getItem(accountCartStorageKey("alice"));
      const count = h.views.length;
      delayed.resolve({ revision: 99, items: [item("99")] });
      await starting;
      await vi.advanceTimersByTimeAsync(500);
      expect(h.views).toHaveLength(count);
      expect(storage.getItem(accountCartStorageKey("alice"))).toBe(before);
      expect(api.current().items).toEqual([item("1")]);
      expect(request.mock.calls.some(([, verb]) => verb === "DELETE")).toBe(false);
    }
  });

  it("never sends an import without durable UUID/journal storage", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    const api = server();
    const h = harness(api.request as CartRequest, storage);
    await h.session.start();
    expect(h.view().syncError).not.toBe("");
    expect(h.view().state.items).toEqual([item("2")]);
    expect(api.request).not.toHaveBeenCalled();
    expect(loadCart(storage).items).toEqual([item("2")]);
  });

  it("does not resurrect imported guest lines when checkout clears during an in-flight import", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const api = server();
    const importing = deferred<CartSnapshot>();
    const request = vi.fn((path: string, method?: string, body?: unknown) => method === "POST" ? importing.promise : api.request(path, method, body));
    const h = harness(request as CartRequest, storage);
    const start = h.session.start();
    await vi.advanceTimersByTimeAsync(0);
    h.session.apply({ type: "clear" });
    expect(stored(storage).pending.items).toEqual([]);
    const snapshot = { revision: 1, items: [item("2")] };
    api.replace(snapshot);
    importing.resolve(snapshot);
    await start;
    expect(h.view().state.items).toEqual([]);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([]);
  });

  it("handles an applied PUT with a lost response on reload without doubling quantities", async () => {
    const api = server({ revision: 1, items: [item("1")] });
    const lost = vi.fn(async (path: string, method?: string, body?: unknown) => {
      const result = await api.request(path, method, body);
      if (method === "PUT") throw new Error("Response lost");
      return result;
    });
    const first = harness(lost as CartRequest);
    await first.session.start();
    first.session.apply({ type: "increment", key });
    await vi.advanceTimersByTimeAsync(50);
    first.session.dispose();
    expect(api.current()).toEqual({ revision: 2, items: [item("1.5")] });
    const second = harness(api.request as CartRequest, first.storage);
    await second.session.start();
    expect(second.view().syncError).toContain("другом устройстве");
    expect(second.view().state.items).toEqual([item("1.5")]);
    await second.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([item("1.5")]);
  });

  it("does not clear a newer guest cache when acknowledging an earlier import", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("1")] });
    const api = server();
    const response = deferred<CartSnapshot>();
    let imports = 0;
    const request = vi.fn(async (path: string, method?: string, body?: unknown) => {
      if (method === "POST" && imports++ === 0) {
        const saved = await api.request(path, method, body);
        await response.promise;
        return saved;
      }
      if (method === "POST") expect(loadCart(storage).items).toEqual([item("2", "apples")]);
      return api.request(path, method, body);
    });
    const uuid = vi.fn().mockReturnValueOnce(sourceId).mockReturnValueOnce("a0000000-0000-4000-8000-000000000002");
    const h = harness(request as CartRequest, storage, "alice", uuid);
    const start = h.session.start();
    await vi.advanceTimersByTimeAsync(0);
    saveCart(storage, { items: [item("2", "apples")] });
    response.resolve(api.current());
    await start;
    expect(h.view().state.items).toEqual([item("1"), item("2", "apples")]);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(uuid).toHaveBeenCalledTimes(2);
  });

  it("recovers the claimed UUID if the account journal write failed before the first request", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const write = storage.setItem.bind(storage);
    const blocked = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === accountCartStorageKey("alice")) throw new Error("Quota exceeded");
      write(key, value);
    });
    const api = server();
    const first = harness(api.request as CartRequest, storage);
    await first.session.start();
    expect(api.request).not.toHaveBeenCalled();
    expect(loadGuestCart(storage).items).toEqual([]);
    first.session.dispose();
    blocked.mockRestore();
    const second = harness(api.request as CartRequest, storage);
    await second.session.start();
    expect(second.uuid).not.toHaveBeenCalled();
    expect(api.request.mock.calls.find(([, method]) => method === "POST")?.[2]).toEqual({ sourceId, items: [item("2")] });
    expect(second.view().state.items).toEqual([item("2")]);
  });

  it("keeps a failed-to-persist clear in memory and stops network saves until explicit retry", async () => {
    const api = server({ revision: 1, items: [item("1")] });
    const h = harness(api.request as CartRequest);
    await h.session.start();
    const blocked = vi.spyOn(h.storage, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    h.session.apply({ type: "clear" });
    expect(h.view().state.items).toEqual([]);
    expect(h.view().syncError).toContain("хранилищу");
    await vi.advanceTimersByTimeAsync(100);
    expect(api.current().revision).toBe(1);
    blocked.mockRestore();
    await h.session.start(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(api.current().items).toEqual([]);
    expect(h.view().syncError).toBe("");
  });

  it("merges a fresh guest batch into an older account journal instead of treating it as a local deletion", async () => {
    for (const clear of [false, true]) {
      const api = server({ revision: 1, items: [item("1")] });
      const first = harness(api.request as CartRequest);
      await first.session.start();
      first.session.apply(clear ? { type: "clear" } : { type: "increment", key });
      first.session.dispose();
      // The user shops as a guest after logout, then signs back into the same account.
      saveCart(first.storage, { items: [item("2", "apples")] });
      const second = harness(api.request as CartRequest, first.storage);
      await second.session.start();
      await vi.advanceTimersByTimeAsync(50);
      expect(api.current().items).toEqual(clear ? [item("2", "apples")] : [item("1.5"), item("2", "apples")]);
      expect(second.view().state.items).toEqual(api.current().items);
    }
  });

  it("does not mistake acknowledged guest data for a new batch if guest cleanup failed after checkout clear", async () => {
    const storage = new MemoryStorage();
    saveCart(storage, { items: [item("2")] });
    const api = server();
    const release = deferred<CartSnapshot>();
    const request = vi.fn(async (path: string, method?: string, body?: unknown) => {
      const saved = await api.request(path, method, body);
      if (method === "POST") await release.promise;
      return saved;
    });
    const first = harness(request as CartRequest, storage);
    const start = first.session.start();
    await vi.advanceTimersByTimeAsync(0);
    first.session.apply({ type: "clear" });
    vi.spyOn(storage, "removeItem").mockImplementationOnce(() => { throw new Error("Storage blocked"); });
    release.resolve(api.current());
    await start;
    expect(stored(storage).pending.items).toEqual([]);
    expect(loadCart(storage).items).toEqual([item("2")]);
    first.session.dispose();
    const second = harness(api.request as CartRequest, storage);
    await second.session.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(api.request.mock.calls.filter(([, method]) => method === "POST")).toHaveLength(1);
    expect(second.view().state.items).toEqual([]);
    expect(api.current().items).toEqual([]);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });
});
