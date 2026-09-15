import { describe, expect, it } from "vitest";

import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("returns a healthy status", () => {
    const service = new HealthService();

    expect(service.getHealth()).toEqual({
      status: "ok",
      service: "api"
    });
  });
});
