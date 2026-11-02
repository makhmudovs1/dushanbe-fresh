import { describe, expect, it } from "vitest";
import type { DeliverySlotDto } from "@dushanbe-fresh/shared";
import { checkoutPreviewSlot } from "./checkout-preview";

const slot = (id: string, available: boolean): DeliverySlotDto => ({ id, available, date: "2099-11-01", startsAt: "10:00", endsAt: "12:00", remainingCapacity: 10, unavailableReasons: available ? [] : ["cutoff_passed"] });

describe("checkout preview time", () => {
  it("prices against an available real slot without selecting it", () => {
    expect(checkoutPreviewSlot("", [slot("closed", false), slot("open", true)])).toBe("open");
  });
  it("preserves an explicit expired or missing selection for server validation", () => {
    expect(checkoutPreviewSlot("closed", [slot("closed", false), slot("open", true)])).toBe("closed");
    expect(checkoutPreviewSlot("removed", [slot("open", true)])).toBe("removed");
  });
  it("does not invent a slot when none are available", () => {
    expect(checkoutPreviewSlot("", [slot("closed", false)])).toBe("closed");
    expect(checkoutPreviewSlot("", [])).toBe("");
  });
});
