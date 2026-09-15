import { describe, expect, it } from "vitest";

import { SERVICE_NAME } from "./index";

describe("shared package", () => {
  it("exports the service name", () => {
    expect(SERVICE_NAME).toBe("Dushanbe Fresh");
  });
});
