import { expect, it } from "vitest";
import { isOwnedMobileTestTarget } from "./mobile-runtime-target.test-support";
it("allows only the disposable local purchase runtime, never a working or production database", () => {
  expect(isOwnedMobileTestTarget("postgresql://df_mobile_test@127.0.0.1:55447/dushanbe_fresh_mobile_purchase_test")).toBe(true);
  expect(isOwnedMobileTestTarget("postgresql://df_mobile_test:ci-only@127.0.0.1:55439/dushanbe_fresh_mobile_purchase_test")).toBe(true);
  for (const value of [undefined, "", "postgresql://df_mobile_test@77.95.0.94:55447/dushanbe_fresh_mobile_purchase_test", "postgresql://df_mobile_test@127.0.0.1:5432/dushanbe_fresh_mobile_purchase_test", "postgresql://postgres@127.0.0.1:55447/dushanbe_fresh_mobile_purchase_test", "postgresql://df_mobile_test@127.0.0.1:55447/dushanbe_fresh", "https://df_mobile_test@127.0.0.1:55447/dushanbe_fresh_mobile_purchase_test"]) expect(isOwnedMobileTestTarget(value)).toBe(false);
});
