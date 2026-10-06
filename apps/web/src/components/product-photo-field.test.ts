import { describe, expect, it } from "vitest";
import { photoFileError } from "./product-photo-field";

describe("photo picker validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", type => {
    expect(photoFileError({ type, size: 5 * 1024 * 1024 })).toBeNull();
  });
  it("explains unsupported types and the size limit", () => {
    expect(photoFileError({ type: "image/svg+xml", size: 100 })).toContain("JPEG, PNG или WebP");
    expect(photoFileError({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).toContain("5 МБ");
  });
});
