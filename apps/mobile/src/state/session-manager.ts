import { sessionStorageKey, loginChallengeKey } from "../domain/storage-scope";
import type { CustomerProfile, MobileSessionDto } from "@dushanbe-fresh/shared";
import { ApiClient, ApiError } from "../api/client";
export type SecretStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type SessionState = {
  phase: "restoring" | "guest" | "account" | "locked";
  user: CustomerProfile | null;
  error: "network" | "expired" | "storage" | null;
};
type Envelope = {
  session: MobileSessionDto;
  refreshPending?: boolean;
  logoutPending?: boolean;
};

function validSession(value: unknown): value is MobileSessionDto {
  if (!value || typeof value !== "object") return false;
  const s = value as MobileSessionDto;
  return (
    /^dfm_access_[a-f0-9]{64}$/.test(s.accessToken) &&
    /^dfm_refresh_[a-f0-9]{64}$/.test(s.refreshToken) &&
    !!s.user?.id &&
    typeof s.user.phone === "string" &&
    Number.isFinite(Date.parse(s.accessExpiresAt)) &&
    Number.isFinite(Date.parse(s.refreshExpiresAt))
  );
}
export class SessionManager {
  private state: SessionState = { phase: "restoring", user: null, error: null };
  private session: MobileSessionDto | null = null;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private writes: Promise<void> = Promise.resolve();
  private durable(epoch: number, envelope: Envelope | null) {
    const next = this.writes
      .catch(() => {})
      .then(async () => {
        if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
        if (envelope)
          await this.storage.setItem(this.key, JSON.stringify(envelope));
        else await this.storage.removeItem(this.key);
        if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
      });
    this.writes = next;
    return next;
  }

  private refreshing: Promise<MobileSessionDto> | null = null;
  constructor(
    private storage: SecretStore,
    private api: ApiClient,
  ) {}
  private get key() {
    return sessionStorageKey(this.api.baseUrl);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private emit(state: SessionState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  private publish(session: MobileSessionDto) {
    this.session = session;
    this.emit({ phase: "account", user: session.user, error: null });
  }
  async restore() {
    const epoch = ++this.epoch;
    this.session = null;
    this.emit({ phase: "restoring", user: null, error: null });
    try {
      const raw = await this.storage.getItem(this.key);
      if (epoch !== this.epoch) return;
      if (!raw) {
        this.emit({ phase: "guest", user: null, error: null });
        return;
      }
      const envelope = JSON.parse(raw) as Envelope;
      if (!validSession(envelope.session)) throw new Error("INVALID_SESSION");
      if (envelope.logoutPending) {
        await this.api.request("/mobile/auth/logout", {
          method: "POST",
          body: { refreshToken: envelope.session.refreshToken },
        });
        await this.durable(epoch, null);
        if (epoch === this.epoch)
          this.emit({ phase: "guest", user: null, error: null });
        return;
      }
      if (
        envelope.refreshPending ||
        Date.parse(envelope.session.refreshExpiresAt) <= Date.now()
      ) {
        if (envelope.refreshPending)
          await this.api.request("/mobile/auth/logout", {
            method: "POST",
            body: { refreshToken: envelope.session.refreshToken },
          });
        await this.durable(epoch, null);
        if (epoch === this.epoch)
          this.emit({ phase: "guest", user: null, error: "expired" });
        return;
      }
      this.session = envelope.session;
      if (Date.parse(envelope.session.accessExpiresAt) <= Date.now() + 15000)
        await this.refresh();
      else {
        const user = await this.api.request<CustomerProfile>(
          "/mobile/auth/me",
          { accessToken: envelope.session.accessToken },
        );
        if (epoch !== this.epoch) return;
        if (!user || user.id !== envelope.session.user.id)
          throw new ApiError("response");
        this.publish({ ...envelope.session, user });
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 404)
      ) {
        try {
          await this.durable(epoch, null);
        } catch {
          if (epoch === this.epoch) {
            this.session = null;
            this.emit({ phase: "locked", user: null, error: "storage" });
          }
          return;
        }
        this.session = null;
        this.emit({ phase: "guest", user: null, error: "expired" });
      } else
        this.emit({
          phase: "locked",
          user: null,
          error: error instanceof ApiError ? "network" : "storage",
        });
    }
  }
  async login(challengeId: string, code: string) {
    const epoch = ++this.epoch;
    const previous = await this.storage.getItem(this.key);
    if (previous) {
      const envelope = JSON.parse(previous) as Envelope;
      if (envelope.logoutPending || envelope.refreshPending) {
        await this.api.request("/mobile/auth/logout", {
          method: "POST",
          body: { refreshToken: envelope.session.refreshToken },
        });
        await this.durable(epoch, null);
      }
    }

    const result = await this.api.request<MobileSessionDto>(
      "/mobile/auth/verify",
      { method: "POST", body: { challengeId, code } },
    );
    if (!validSession(result)) throw new ApiError("response");
    if (epoch !== this.epoch) {
      await this.api.request("/mobile/auth/logout", {
        method: "POST",
        body: { refreshToken: result.refreshToken },
      });
      throw new Error("OWNER_CHANGED");
    }
    try {
      await this.durable(epoch, { session: result });
    } catch {
      await this.api
        .request("/mobile/auth/logout", {
          method: "POST",
          body: { refreshToken: result.refreshToken },
        })
        .catch(() => {});
      throw new Error("SESSION_NOT_SAVED");
    }
    if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
    this.publish(result);
    return result.user;
  }
  private async refresh(): Promise<MobileSessionDto> {
    if (this.refreshing) return this.refreshing;
    const current = this.session;
    const epoch = this.epoch;
    if (!current) throw new ApiError("http", 401);
    this.refreshing = (async () => {
      try {
        await this.durable(epoch, { session: current, refreshPending: true });
        const next = await this.api.request<MobileSessionDto>(
          "/mobile/auth/refresh",
          { method: "POST", body: { refreshToken: current.refreshToken } },
        );
        if (!validSession(next) || next.user.id !== current.user.id)
          throw new ApiError("response");
        if (epoch !== this.epoch) {
          await this.api
            .request("/mobile/auth/logout", {
              method: "POST",
              body: { refreshToken: next.refreshToken },
            })
            .catch(() => {});
          throw new Error("OWNER_CHANGED");
        }
        await this.durable(epoch, { session: next });
        if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
        this.publish(next);
        return next;
      } catch (error) {
        if (epoch === this.epoch) {
          this.session = null;
          this.emit({
            phase: "locked",
            user: null,
            error:
              error instanceof ApiError && error.status === 401
                ? "expired"
                : "network",
          });
        }
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      signal?: AbortSignal;
      ownerId?: string;
    } = {},
  ): Promise<T> {
    if (
      !path.startsWith("/mobile/customer/") &&
      !path.startsWith("/mobile/geocoding/") &&
      path !== "/mobile/checkout/orders" &&
      path !== "/mobile/auth/me"
    )
      throw new Error("INVALID_PRIVATE_PATH");
    const epoch = this.epoch;
    if (
      options.ownerId !== undefined &&
      options.ownerId !== this.state.user?.id
    )
      throw new Error("OWNER_CHANGED");
    const { ownerId: unusedOwner, ...requestOptions } = options;
    void unusedOwner;
    let session = this.session;
    if (!session || this.state.phase !== "account")
      throw new ApiError("http", 401);
    if (Date.parse(session.accessExpiresAt) <= Date.now() + 15000)
      session = await this.refresh();
    if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
    let result: T;
    try {
      result = await this.api.request<T>(path, {
        ...requestOptions,
        accessToken: session.accessToken,
      });
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        epoch !== this.epoch
      )
        throw error;
      const next = await this.refresh();
      result = await this.api.request<T>(path, {
        ...requestOptions,
        accessToken: next.accessToken,
      });
    }
    if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
    return result;
  }
  async refreshProfile() {
    const current = this.session;
    if (!current || this.state.phase !== "account") return;
    const epoch = this.epoch;
    const user = await this.request<CustomerProfile>("/mobile/auth/me", {
      ownerId: current.user.id,
    });
    if (
      epoch !== this.epoch ||
      !this.session ||
      user.id !== this.session.user.id
    )
      throw new Error("OWNER_CHANGED");
    const next = { ...this.session, user };
    await this.durable(epoch, { session: next });
    if (epoch === this.epoch) this.publish(next);
  }
  async updateName(name: string, ownerId?: string) {
    return this.updateProfile({ name }, ownerId);
  }
  async updateProfile(
    parts: { firstName: string; lastName: string } | { name: string },
    ownerId?: string,
  ) {
    const epoch = this.epoch;
    const user = await this.request<CustomerProfile>(
      "/mobile/customer/profile",
      { method: "PATCH", body: parts, ownerId },
    );
    if (
      epoch !== this.epoch ||
      !this.session ||
      this.session.user.id !== user.id
    )
      throw new Error("OWNER_CHANGED");
    const next = { ...this.session, user };
    await this.durable(epoch, { session: next });
    this.publish(next);
  }
  async logout(ownerId?: string) {
    if (ownerId !== undefined && ownerId !== this.state.user?.id)
      throw new Error("OWNER_CHANGED");
    let current = this.session;
    const epoch = ++this.epoch;
    this.session = null;
    this.emit({ phase: "locked", user: null, error: null });
    if (!current) {
      // A second logout must not erase an offline revocation tombstone.
      try {
        const raw = await this.storage.getItem(this.key);
        if (epoch !== this.epoch) throw new Error("OWNER_CHANGED");
        if (raw) {
          const envelope = JSON.parse(raw) as Envelope;
          if (!validSession(envelope.session))
            throw new Error("INVALID_SESSION");
          current = envelope.session;
        } else {
          this.emit({ phase: "guest", user: null, error: null });
          return;
        }
      } catch (error) {
        if (epoch === this.epoch)
          this.emit({ phase: "locked", user: null, error: "storage" });
        throw error;
      }
    }
    try {
      await this.durable(epoch, { session: current, logoutPending: true });
      await this.storage.removeItem(loginChallengeKey(this.api.baseUrl));
      if (epoch === this.epoch)
        this.emit({ phase: "guest", user: null, error: null });
      await this.api.request("/mobile/auth/logout", {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      await this.durable(epoch, null);
    } catch (error) {
      // Revoke on the server even when local tombstone persistence failed.
      await this.api
        .request("/mobile/auth/logout", {
          method: "POST",
          body: { refreshToken: current.refreshToken },
        })
        .catch(() => {});
      if (epoch === this.epoch)
        this.emit({
          phase: "locked",
          user: null,
          error: error instanceof ApiError ? "network" : "storage",
        });
      throw error;
    }
  }
}
