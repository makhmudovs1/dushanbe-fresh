import type {
  MobileCartLine as Line,
  MobileCartSnapshot as Snapshot,
} from "@dushanbe-fresh/shared";
import type { CartAction } from "../domain/cart";
import { ApiError } from "../api/client";
import {
  changeLines,
  isCartSnapshot,
  legacyConflicts,
  lineKey,
  mergeMax,
  reconcile,
} from "../domain/account-cart";
import type { SecretStore } from "./session-manager";
type Pending = { revision: number; base: Line[]; items: Line[] };
type Batch = { sourceId: string; items: Line[] };
type RecordState = {
  snapshot: Snapshot;
  pending: Pending | null;
  batch: Batch | null;
  ack: string | null;
  review: {
    remote: Snapshot;
    conflicts: ReturnType<typeof legacyConflicts>;
  } | null;
};
export type AccountCartState = {
  items: Line[];
  hydrated: boolean;
  syncing: boolean;
  error: "storage" | "network" | "conflict" | "legacy" | null;
  conflicts: ReturnType<typeof legacyConflicts>;
};
export type CartTransport = <T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PUT"; body?: unknown },
) => Promise<T>;

export class AccountCartStore {
  private record: RecordState = {
    snapshot: { revision: 0, items: [] },
    pending: null,
    batch: null,
    ack: null,
    review: null,
  };
  private state: AccountCartState = {
    items: [],
    hydrated: false,
    syncing: false,
    error: null,
    conflicts: [],
  };
  private listeners = new Set<() => void>();
  private active = true;
  private busy = false;
  private version = 0;
  private writes: Promise<boolean> = Promise.resolve(true);
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    readonly owner: string,
    private storage: SecretStore,
    private transport: CartTransport,
    private uuid: () => string,
    private guest: () => Line[],
    private acknowledgeGuest: (items: Line[]) => Promise<void>,
    private namespace = "",
  ) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit(patch: Partial<AccountCartState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private key() {
    return `df.mobile.account-cart.v1.${this.namespace}${this.owner}`;
  }
  private persist() {
    const value = JSON.stringify(this.record);
    this.writes = this.writes
      .then(() => this.storage.setItem(this.key(), value))
      .then(() => true)
      .catch(() => {
        this.emit({ error: "storage" });
        return false;
      });
    return this.writes;
  }
  private local() {
    return (
      this.record.pending?.items ??
      mergeMax(this.record.snapshot.items, this.record.batch?.items ?? [])
    );
  }
  async initialize() {
    try {
      const raw = await this.storage.getItem(this.key());
      if (!this.active) return;
      if (raw) {
        const value = JSON.parse(raw) as RecordState;
        if (
          !isCartSnapshot(value.snapshot) ||
          (value.pending &&
            !isCartSnapshot({
              revision: value.pending.revision,
              items: value.pending.items,
            }))
        )
          throw new Error("INVALID_JOURNAL");
        this.record = value;
      }
      this.emit({ items: this.local() });
      await this.sync();
    } catch {
      this.emit({ error: "storage", hydrated: false });
    }
  }
  private claimKey() {
    return this.namespace
      ? `df.mobile.guest-claim.v2.${this.namespace}`
      : "df.mobile.guest-claim.v1";
  }
  private async prepareGuest() {
    const raw = await this.storage.getItem(this.claimKey());
    const claim = raw
      ? (JSON.parse(raw) as { owner: string; sourceId: string; items: Line[] })
      : null;
    if (claim && claim.owner !== this.owner) return;
    if (claim && claim.sourceId === this.record.ack) {
      await this.acknowledgeGuest(claim.items);
      await this.storage.removeItem(this.claimKey());
      return;
    }
    if (this.record.batch) {
      if (claim && claim.sourceId === this.record.batch.sourceId) {
        const kept = new Set(this.record.batch.items.map(lineKey));
        const discarded = claim.items.filter(
          (item) => !kept.has(lineKey(item)),
        );
        if (discarded.length) {
          await this.acknowledgeGuest(discarded);
          await this.storage.setItem(
            this.claimKey(),
            JSON.stringify({ ...claim, items: this.record.batch.items }),
          );
        }
      }
      return;
    }
    const items = claim?.items ?? this.guest();
    if (!items.length) return;
    const batch = { sourceId: claim?.sourceId ?? this.uuid(), items };
    // Owner claim is durable before import. Another account cannot steal an unacknowledged guest batch.
    await this.storage.setItem(
      this.claimKey(),
      JSON.stringify({ ...batch, owner: this.owner }),
    );
    this.record.batch = batch;
    if (this.record.pending) {
      this.record.pending = {
        ...this.record.pending,
        base: mergeMax(this.record.pending.base, items),
        items: mergeMax(this.record.pending.items, items),
      };
    }
    if (!(await this.persist())) throw new Error("STORAGE");
  }
  apply = (action: CartAction) => {
    if (!this.active || !this.state.hydrated) return;
    if (action.type === "clear" && this.record.review) {
      this.record.snapshot = this.record.review.remote;
      this.record.pending = null;
      this.record.review = null;
      if (this.record.batch)
        this.record.batch = { ...this.record.batch, items: [] };
      this.emit({ error: null, conflicts: [] });
    }
    const items = changeLines(this.local(), action);
    const pending = this.record.pending;
    this.record.pending = {
      revision: pending?.revision ?? this.record.snapshot.revision,
      base: pending?.base ?? this.record.snapshot.items,
      items,
    };
    this.version++;
    this.emit({ items });
    void this.persist().then((ok) => {
      if (ok) this.schedule();
    });
  };
  private schedule() {
    clearTimeout(this.timer);
    if (this.active && !this.busy && !this.state.error && this.record.pending)
      this.timer = setTimeout(() => {
        void this.sync();
      }, 350);
  }
  async sync(merge = false) {
    if (!this.active || this.busy) return;
    if (this.record.review) {
      this.emit({
        hydrated: true,
        error: "legacy",
        conflicts: this.record.review.conflicts,
      });
      return;
    }
    this.busy = true;
    this.emit({ syncing: true, error: null });
    try {
      if (!(await this.persist())) return;
      await this.prepareGuest();
      let remote = await this.transport<Snapshot>("/mobile/customer/cart");
      if (!this.active) return;
      if (!isCartSnapshot(remote)) throw new Error("INVALID_CART");
      const pending = this.record.pending;
      if (pending && pending.revision !== remote.revision && !merge) {
        this.emit({ error: "conflict" });
        return;
      }
      const conflicts = legacyConflicts(remote.items, [
        ...(pending?.items ?? []),
        ...(this.record.batch?.items ?? []),
      ]);
      if (conflicts.length) {
        this.record.review = { remote, conflicts };
        await this.persist();
        this.emit({ error: "legacy", conflicts });
        return;
      }
      if (pending)
        this.record.pending = {
          revision: remote.revision,
          base: remote.items,
          items:
            pending.revision === remote.revision
              ? pending.items
              : reconcile(pending.base, pending.items, remote.items),
        };
      this.record.snapshot = remote;
      if (!(await this.persist())) return;
      if (this.record.batch) {
        const batch = this.record.batch;
        const before = mergeMax(remote.items, batch.items);
        remote = await this.transport<Snapshot>(
          "/mobile/customer/cart/import",
          { method: "POST", body: batch },
        );
        if (!this.active) return;
        if (!isCartSnapshot(remote)) throw new Error("INVALID_CART");
        const latest = this.record.pending;
        if (latest)
          this.record.pending = {
            revision: remote.revision,
            base: remote.items,
            items: reconcile(before, latest.items, remote.items),
          };
        this.record.snapshot = remote;
        this.record.ack = batch.sourceId;
        this.record.batch = null;
        if (!(await this.persist())) return;
        await this.acknowledgeGuest(batch.items);
        await this.storage.removeItem(this.claimKey());
      }
      this.emit({ items: this.local() });
      if (this.record.pending) {
        const pending = this.record.pending;
        const version = this.version;
        if (!(await this.persist())) return;
        const saved = await this.transport<Snapshot>("/mobile/customer/cart", {
          method: "PUT",
          body: { revision: pending.revision, items: pending.items },
        });
        if (!this.active) return;
        if (!isCartSnapshot(saved)) throw new Error("INVALID_CART");
        this.record.snapshot = saved;
        this.record.pending =
          version === this.version
            ? null
            : {
                revision: saved.revision,
                base: saved.items,
                items: this.record.pending?.items ?? this.state.items,
              };
        if (!(await this.persist())) return;
        this.emit({ items: this.local() });
      }
    } catch (error) {
      if (!this.active) return;
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        error.data &&
        typeof error.data === "object" &&
        "currentCart" in error.data &&
        isCartSnapshot(error.data.currentCart)
      ) {
        const remote = error.data.currentCart;
        const conflicts = legacyConflicts(remote.items, this.local());
        this.record.review = { remote, conflicts };
        await this.persist();
        this.emit({ error: "legacy", conflicts });
      } else
        this.emit({
          error:
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "network",
        });
    } finally {
      this.busy = false;
      this.emit({ hydrated: true, syncing: false, items: this.local() });
      this.schedule();
    }
  }
  resolve = async (key: string, removeBoth: boolean) => {
    const review = this.record.review;
    const pair = review?.conflicts.find((c) => c.key === key);
    if (!review || !pair || this.busy || !this.active) return;
    const items = reconcile(
      this.record.pending?.base ?? this.record.snapshot.items,
      this.local(),
      review.remote.items,
    ).filter((i) => lineKey(i) !== key);
    if (!removeBoth) items.push(pair.saved);
    if (this.record.batch)
      this.record.batch = {
        ...this.record.batch,
        items: this.record.batch.items.filter((i) => lineKey(i) !== key),
      };
    this.record.snapshot = review.remote;
    this.record.pending = {
      revision: review.remote.revision,
      base: review.remote.items,
      items,
    };
    const conflicts = review.conflicts.filter((c) => c.key !== key);
    this.record.review = conflicts.length ? { ...review, conflicts } : null;
    this.version++;
    await this.persist();
    this.emit({
      items,
      error: conflicts.length ? "legacy" : "conflict",
      conflicts,
    });
  };
  async flush() {
    clearTimeout(this.timer);
    await this.writes;
    if (!this.state.error) await this.sync();
    return !this.record.pending && !this.record.batch && !this.state.error;
  }
  dispose() {
    this.active = false;
    clearTimeout(this.timer);
  }
}
