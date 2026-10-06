import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("customer error messages", () => {
  it("preserves actionable Russian errors but hides technical English defaults", () => {
    expect(errorMessage("Добавьте фотографию товара.")).toBe("Добавьте фотографию товара.");
    expect(errorMessage("Internal Server Error")).toBe("Не удалось выполнить запрос. Повторите попытку.");
    expect(errorMessage(undefined)).toBe("Не удалось выполнить запрос. Повторите попытку.");
  });
});
