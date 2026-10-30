import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service";

import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("returns a healthy status", () => {
    const query = vi.fn();
    const service = new HealthService({ $queryRaw: query } as unknown as PrismaService);

    expect(service.getHealth()).toEqual({
      status: "ok",
      service: "api"
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("reports readiness only after a database query", async () => {
    const query = vi.fn().mockResolvedValue([{ value: 1 }]);
    const service = new HealthService({ $queryRaw: query } as unknown as PrismaService);
    await expect(service.getReadiness()).resolves.toEqual({ status: "ok", service: "api", database: "ok" });
    expect(query).toHaveBeenCalledOnce();
  });

  it("returns 503 without exposing database errors", async () => {
    const service = new HealthService({ $queryRaw: vi.fn().mockRejectedValue(new Error("private connection details")) } as unknown as PrismaService);
    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getReadiness()).rejects.toThrow("Service is not ready");
  });

  it("bounds readiness wait without changing liveness", async () => {
    vi.useFakeTimers();
    try {
      const service = new HealthService({ $queryRaw: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as PrismaService);
      const outcome = expect(service.getReadiness()).rejects.toThrow("Service is not ready");
      await vi.advanceTimersByTimeAsync(2000);
      await outcome;
      expect(service.getHealth().status).toBe("ok");
    } finally { vi.useRealTimers(); }
  });
});
