import { CustomerError } from "@/lib/customer";
import {
  CART_STORAGE_KEY, CartAction, CartItem, CartState, cartReducer, emptyCartState,
  getCartItemKey, isLegacyCartItem, loadCart
} from "./cart";

export type CartSnapshot = { revision: number; items: CartItem[] };
type Journal = { revision: number | null; items: CartItem[]; baseItems: CartItem[] };
type GuestImport = { sourceId: string; items: CartItem[] };
export type CartLegacyConflict = { key: string; saved: CartItem; incoming: CartItem };
type LegacyReview = { currentCart: CartSnapshot; conflicts: CartLegacyConflict[] };
type AccountRecord = {
  snapshot: CartSnapshot | null; pending: Journal | null; guestImport: GuestImport | null; acknowledgedImport: string | null;
  legacyReview: LegacyReview | null
};
type GuestClaim = { userId: string; sourceId: string };
export type CartSyncView = {
  state: CartState; hydrated: boolean; syncing: boolean; syncError: string; legacyConflicts: CartLegacyConflict[]
};
export type CartRequest = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

const CONFLICT = "Корзина изменена на другом устройстве. Нажмите повторить, чтобы объединить изменения.";
const FAILURE = "Не удалось синхронизировать корзину. Локальные изменения сохранены; повторите попытку.";
const STORAGE_FAILURE = "Не удалось сохранить корзину на устройстве. Проверьте доступ к хранилищу и повторите попытку.";
const LEGACY_REVIEW = "В корзинах есть несовместимые старые позиции. Сравните варианты и количество, удалите ненужные и повторите сохранение.";
const RESOLVED = "Выбор сохранён на устройстве. Нажмите повторить, чтобы синхронизировать корзину.";

export function accountCartStorageKey(userId: string) {
  return `dushanbe-fresh.account-cart.v1:${encodeURIComponent(userId)}`;
}

export function sameCartItems(left: CartItem[], right: CartItem[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function accountItemKey(item: CartItem) {
  return JSON.stringify([item.productId, item.qualityOptionId ?? null]);
}

function sameCartSnapshot(left: CartItem, right: CartItem) {
  const entries = Object.entries(left).filter(([, value]) => value !== undefined);
  const fields = Object.fromEntries(Object.entries(right).filter(([, value]) => value !== undefined));
  return entries.length === Object.keys(fields).length && entries.every(([key, value]) => fields[key] === value);
}

export function findLegacyCartConflicts(currentCart: CartSnapshot, incoming: CartItem[]): CartLegacyConflict[] {
  const saved = new Map(currentCart.items.map(item => [accountItemKey(item), item]));
  return incoming.flatMap(item => {
    const key = accountItemKey(item);
    const previous = saved.get(key);
    // Cart lines are flat snapshots; property order and JSON-omitted undefined fields are immaterial.
    return previous && (isLegacyCartItem(previous) || isLegacyCartItem(item)) && !sameCartSnapshot(previous, item)
      ? [{ key, saved: previous, incoming: item }] : [];
  });
}

/** Local preview only. Incompatible legacy snapshots require explicit review before server writes. */
export function mergeCartItemsMax(saved: CartItem[], incoming: CartItem[]) {
  const merged = new Map(saved.map(item => [accountItemKey(item), item]));
  for (const item of incoming) {
    const key = accountItemKey(item);
    const previous = merged.get(key);
    if (previous && isLegacyCartItem(previous)) continue;
    if (isLegacyCartItem(item)) { merged.set(key, item); continue; }
    merged.set(key, previous ? {
      ...previous, quantity: Number(previous.quantity) >= Number(item.quantity) ? previous.quantity : item.quantity
    } : item);
  }
  return [...merged.values()];
}

/** Explicit conflict retry: keep remote-only additions, honor local removals, never edit remote legacy lines. */
export function reconcileCartItems(base: CartItem[], local: CartItem[], remote: CartItem[]) {
  const before = new Map(base.map(item => [accountItemKey(item), item]));
  const ours = new Map(local.map(item => [accountItemKey(item), item]));
  const result = new Map(remote.map(item => [accountItemKey(item), item]));
  for (const [key, old] of before) {
    const item = ours.get(key);
    if (!item) result.delete(key);
    else if (!sameCartItems([old], [item])) {
      const theirs = result.get(key);
      if (theirs && isLegacyCartItem(theirs)) continue;
      result.set(key, !theirs || sameCartItems([old], [theirs]) ? item : mergeCartItemsMax([theirs], [item])[0]);
    }
  }
  for (const [key, item] of ours) {
    if (!before.has(key)) {
      const theirs = result.get(key);
      result.set(key, theirs ? mergeCartItemsMax([theirs], [item])[0] : item);
    }
  }
  return [...result.values()];
}

function guestClaim(storage: Storage | undefined): GuestClaim | null {
  try { return JSON.parse(storage?.getItem(CART_STORAGE_KEY) ?? "null")?.accountImport ?? null; }
  catch { return null; }
}

export function loadGuestCart(storage: Storage | undefined): CartState {
  return guestClaim(storage) ? emptyCartState : loadCart(storage);
}

function validItems(value: unknown): value is CartItem[] {
  if (!Array.isArray(value)) return false;
  const parsed = loadCart({ getItem: () => JSON.stringify({ items: value }) } as unknown as Storage);
  return parsed.items.length === value.length;
}

function isSnapshot(value: unknown): value is CartSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as CartSnapshot;
  return Number.isInteger(snapshot.revision) && snapshot.revision >= 0 && validItems(snapshot.items);
}

function parseLegacyReview(value: unknown): LegacyReview | null {
  if (!value || typeof value !== "object") return null;
  const review = value as LegacyReview;
  if (!isSnapshot(review.currentCart) || !Array.isArray(review.conflicts) || !review.conflicts.length) return null;
  const conflicts = review.conflicts.flatMap(pair => {
    if (!pair || !validItems([pair.saved, pair.incoming])) return [];
    return findLegacyCartConflicts({ revision: review.currentCart.revision, items: [pair.saved] }, [pair.incoming]);
  });
  return conflicts.length === review.conflicts.length ? { currentCart: review.currentCart, conflicts } : null;
}

function loadAccount(storage: Storage | undefined, userId: string): AccountRecord {
  const empty: AccountRecord = { snapshot: null, pending: null, guestImport: null, acknowledgedImport: null, legacyReview: null };
  try {
    const saved = JSON.parse(storage?.getItem(accountCartStorageKey(userId)) ?? "null") as AccountRecord | null;
    if (!saved) return empty;
    return {
      snapshot: isSnapshot(saved.snapshot) ? saved.snapshot : null,
      pending: saved.pending && (saved.pending.revision === null || Number.isInteger(saved.pending.revision)) &&
        validItems(saved.pending.items) && validItems(saved.pending.baseItems) ? saved.pending : null,
      guestImport: saved.guestImport && typeof saved.guestImport.sourceId === "string" && validItems(saved.guestImport.items)
        ? saved.guestImport : null,
      acknowledgedImport: typeof saved.acknowledgedImport === "string" ? saved.acknowledgedImport : null,
      legacyReview: parseLegacyReview(saved.legacyReview)
    };
  } catch { return empty; }
}

/** One verified owner per session. Disposal fences every asynchronous response. */
export class AccountCartSync {
  private record: AccountRecord;
  private active = true;
  private busy = false;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private editVersion = 0;
  private storageFailed = false;
  private view: CartSyncView;

  constructor(
    readonly userId: string,
    private readonly storage: Storage | undefined,
    private readonly request: CartRequest,
    private readonly uuid: () => string,
    private readonly publish: (view: CartSyncView) => void,
    private readonly debounceMs = 300
  ) {
    this.record = loadAccount(storage, userId);
    const claim = guestClaim(storage);
    const guest = !claim || claim.userId === userId ? loadCart(storage).items : [];
    const items = this.record.pending?.items ?? mergeCartItemsMax(this.record.snapshot?.items ?? [], this.record.guestImport?.items ?? guest);
    this.view = {
      state: { items }, hydrated: false, syncing: false, syncError: this.record.legacyReview ? LEGACY_REVIEW : "",
      legacyConflicts: this.record.legacyReview?.conflicts ?? []
    };
  }

  private localItems() {
    return this.record.pending?.items ?? mergeCartItemsMax(this.record.snapshot?.items ?? [], this.record.guestImport?.items ?? []);
  }

  private emit(patch: Partial<CartSyncView>) {
    if (!this.active) return;
    this.view = { ...this.view, ...patch };
    this.publish(this.view);
  }

  private persist() {
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(accountCartStorageKey(this.userId), JSON.stringify(this.record));
      this.storageFailed = false;
      return true;
    } catch {
      this.storageFailed = true;
      this.emit({ syncError: STORAGE_FAILURE });
      return false;
    }
  }

  private prepareGuest() {
    if (this.record.guestImport) return;
    const claim = guestClaim(this.storage);
    if (claim && claim.userId !== this.userId) return;
    if (claim && claim.sourceId === this.record.acknowledgedImport) {
      this.acknowledgeGuest(claim.sourceId);
      return;
    }
    const guest = loadCart(this.storage);
    if (!guest.items.length) return;
    const sourceId = claim?.sourceId ?? this.uuid();
    // Claim first: a crash before the account journal write can be recovered only by this owner.
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(CART_STORAGE_KEY, JSON.stringify({ ...guest, accountImport: { userId: this.userId, sourceId } }));
    } catch (error) { this.storageFailed = true; throw error; }
    this.record.guestImport = { sourceId, items: guest.items };
    if (this.record.pending) {
      // A fresh guest batch was not part of older account edits, especially an earlier checkout clear.
      this.record.pending = {
        ...this.record.pending,
        items: mergeCartItemsMax(this.record.pending.items, guest.items),
        baseItems: mergeCartItemsMax(this.record.pending.baseItems, guest.items)
      };
    }
    if (!this.persist()) throw new Error("Storage unavailable");
  }

  private acknowledgeGuest(sourceId: string) {
    const claim = guestClaim(this.storage);
    if (claim?.userId === this.userId && claim.sourceId === sourceId) this.storage?.removeItem(CART_STORAGE_KEY);
  }

  private requireLegacyReview(review: LegacyReview) {
    this.record.legacyReview = review;
    this.ready = false;
    this.persist();
    this.emit({ legacyConflicts: review.conflicts, syncError: this.storageFailed ? STORAGE_FAILURE : LEGACY_REVIEW });
  }

  private handleLegacyError(error: unknown) {
    if (!(error instanceof CustomerError) || error.status !== 422 || !error.data || typeof error.data !== "object") return false;
    const body = error.data as { code?: string };
    if (body.code !== "CART_LEGACY_REVIEW_REQUIRED") return false;
    const review = parseLegacyReview(body);
    if (!review) return false;
    this.requireLegacyReview(review);
    return true;
  }

  private updateClaimedGuest() {
    const batch = this.record.guestImport;
    const claim = guestClaim(this.storage);
    if (!batch || claim?.userId !== this.userId || claim.sourceId !== batch.sourceId) return;
    try { this.storage?.setItem(CART_STORAGE_KEY, JSON.stringify({ items: batch.items, accountImport: claim })); }
    catch { this.storageFailed = true; this.emit({ syncError: STORAGE_FAILURE }); }
  }

  private resolveLegacy(key: string, removeBoth: boolean) {
    if (!this.active || this.busy) return false;
    const review = this.record.legacyReview;
    const pair = review?.conflicts.find(conflict => conflict.key === key);
    if (!review || !pair) return false;
    const pending = this.record.pending;
    let items = reconcileCartItems(pending?.baseItems ?? this.record.snapshot?.items ?? [], this.localItems(), review.currentCart.items);
    const present = items.some(item => accountItemKey(item) === key);
    items = items.flatMap(item => accountItemKey(item) === key ? removeBoth ? [] : [pair.saved] : [item]);
    if (!removeBoth && !present) items.push(pair.saved);
    if (this.record.guestImport) {
      this.record.guestImport = { ...this.record.guestImport, items: this.record.guestImport.items.filter(item => accountItemKey(item) !== key) };
    }
    this.record.snapshot = review.currentCart;
    this.record.pending = { revision: review.currentCart.revision, baseItems: review.currentCart.items, items };
    const conflicts = review.conflicts.filter(conflict => conflict.key !== key);
    this.record.legacyReview = conflicts.length ? { ...review, conflicts } : null;
    this.editVersion++;
    if (this.persist()) this.updateClaimedGuest();
    this.emit({ state: { items }, legacyConflicts: conflicts, syncError: this.storageFailed ? STORAGE_FAILURE : conflicts.length ? LEGACY_REVIEW : RESOLVED });
    return true;
  }

  discardIncoming = (key: string) => this.resolveLegacy(key, false);
  removeBoth = (key: string) => this.resolveLegacy(key, true);

  apply(action: CartAction) {
    if (!this.active || (!this.view.hydrated && action.type !== "clear")) return false;
    if (action.type === "remove") {
      const pair = this.record.legacyReview?.conflicts.find(conflict => getCartItemKey(conflict.saved) === action.key);
      if (pair) return this.removeBoth(pair.key);
    }
    const next = cartReducer(this.view.state, action);
    if (sameCartItems(next.items, this.view.state.items) && action.type !== "clear") return false;
    const pending = this.record.pending;
    const clearingReview = action.type === "clear" && !!this.record.legacyReview;
    this.record.pending = {
      revision: pending?.revision ?? this.record.snapshot?.revision ?? null,
      baseItems: pending?.baseItems ?? this.view.state.items,
      items: next.items
    };
    this.editVersion++;
    if (action.type === "clear" && this.record.legacyReview) {
      this.record.pending.revision = this.record.legacyReview.currentCart.revision;
      this.record.pending.baseItems = this.record.legacyReview.currentCart.items;
      this.record.snapshot = this.record.legacyReview.currentCart;
      this.record.legacyReview = null;
      if (this.record.guestImport) this.record.guestImport = { ...this.record.guestImport, items: [] };
    }
    const persisted = this.persist();
    if (persisted && action.type === "clear") this.updateClaimedGuest();
    this.emit({ state: next, legacyConflicts: this.record.legacyReview?.conflicts ?? [],
      ...(clearingReview && !this.storageFailed ? { syncError: RESOLVED } : {}) });
    this.schedule();
    return true;
  }

  private schedule() {
    if (!this.active || !this.ready || this.busy || this.view.syncError || !this.record.pending) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, this.debounceMs);
  }

  async start(merge = false) {
    if (!this.active || this.busy) return;
    if (this.record.legacyReview) {
      this.emit({ hydrated: true, syncing: false, syncError: LEGACY_REVIEW, legacyConflicts: this.record.legacyReview.conflicts });
      return;
    }
    clearTimeout(this.timer);
    this.busy = true;
    this.ready = false;
    this.emit({ hydrated: false, syncing: true, syncError: "", legacyConflicts: [] });
    try {
      this.prepareGuest();
      this.emit({ state: { items: this.localItems() } });
      if (!this.persist()) return;
      let remote = await this.request<CartSnapshot>("customer/cart");
      if (!this.active) return;
      if (!isSnapshot(remote)) throw new Error("Invalid cart snapshot");
      const pending = this.record.pending;
      if (pending && pending.revision !== remote.revision && !merge) {
        this.emit({ syncError: CONFLICT });
        return;
      }
      if (pending) {
        const conflicts = findLegacyCartConflicts(remote, pending.items);
        if (conflicts.length) {
          this.requireLegacyReview({ currentCart: remote, conflicts });
          return;
        }
        const withGuest = mergeCartItemsMax(remote.items, this.record.guestImport?.items ?? []);
        this.record.pending = {
          revision: remote.revision, baseItems: withGuest,
          items: pending.revision === remote.revision ? pending.items : reconcileCartItems(pending.baseItems, pending.items, withGuest)
        };
      }
      this.record.snapshot = remote;
      if (!this.persist()) return;
      while (this.record.guestImport) {
        const imported = this.record.guestImport;
        const base = mergeCartItemsMax(remote.items, imported.items);
        remote = await this.request<CartSnapshot>("customer/cart/import", "POST", imported);
        if (!this.active) return;
        if (!isSnapshot(remote)) throw new Error("Invalid cart snapshot");
        const latest = this.record.pending;
        this.record.snapshot = remote;
        if (latest) this.record.pending = {
          revision: remote.revision, baseItems: remote.items,
          items: reconcileCartItems(base, latest.items, remote.items)
        };
        this.record.guestImport = null;
        this.record.acknowledgedImport = imported.sourceId;
        if (!this.persist()) return;
        this.acknowledgeGuest(imported.sourceId);
        this.prepareGuest();
      }
      this.emit({ state: { items: this.localItems() } });
      this.ready = true;
    } catch (error) {
      if (!this.active || this.handleLegacyError(error)) return;
      const items = this.record.snapshot || this.record.pending || this.record.guestImport ? this.localItems() : this.view.state.items;
      this.emit({ state: { items }, syncError: this.storageFailed ? STORAGE_FAILURE : FAILURE });
    } finally {
      this.busy = false;
      this.emit({ hydrated: true, syncing: false });
      this.schedule();
    }
  }

  private async save() {
    if (!this.active || this.busy || !this.ready || this.view.syncError || !this.record.pending) return;
    this.busy = true;
    this.emit({ syncing: true });
    const pending = this.record.pending;
    const version = this.editVersion;
    try {
      if (!this.persist()) return;
      const saved = await this.request<CartSnapshot>("customer/cart", "PUT", { revision: pending.revision, items: pending.items });
      if (!this.active) return;
      if (!isSnapshot(saved)) throw new Error("Invalid cart snapshot");
      this.record.snapshot = saved;
      if (version === this.editVersion) {
        this.record.pending = null;
        this.emit({ state: { items: saved.items } });
      } else {
        this.record.pending = { revision: saved.revision, items: this.view.state.items, baseItems: saved.items };
      }
      this.persist();
    } catch (error) {
      if (!this.active) return;
      if (this.handleLegacyError(error)) return;
      // Keep the original base and journal; retry fetches the latest snapshot before an explicit merge.
      this.emit({ syncError: error instanceof CustomerError && error.status === 409 ? CONFLICT : FAILURE });
    } finally {
      this.busy = false;
      this.emit({ syncing: false });
      this.schedule();
    }
  }

  retrySync = () => { void this.start(true); };

  dispose() {
    this.active = false;
    clearTimeout(this.timer);
  }
}
