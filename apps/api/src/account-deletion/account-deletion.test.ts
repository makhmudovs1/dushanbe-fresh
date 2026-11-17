import { describe, expect, it } from "vitest";
import { deletionCapability } from "./account-deletion.service";
const approved = { CUSTOMER_ACCOUNT_DELETION_REQUESTS_ENABLED: "true", CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION: "test-only-v1", CUSTOMER_ACCOUNT_DELETION_NOTICE_RU: "Изолированная тестовая политика хранения данных.", CUSTOMER_ACCOUNT_DELETION_NOTICE_TG: "Сиёсати санҷишии нигоҳдории маълумот." };
describe("account deletion initiation policy gate", () => {
  it("is disabled by default and cannot publish unapproved or incomplete retention terms", () => {
    for (const env of [{}, { ...approved, CUSTOMER_ACCOUNT_DELETION_REQUESTS_ENABLED: "false" }, { ...approved, CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION: "" }, { ...approved, CUSTOMER_ACCOUNT_DELETION_NOTICE_RU: "" }, { ...approved, CUSTOMER_ACCOUNT_DELETION_NOTICE_TG: "" }, { ...approved, CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION: "injected\nversion" }]) expect(deletionCapability(env)).toEqual({ available: false, mode: "request", policyVersion: null, retentionNotice: null });
  });
  it("honestly identifies initiation as a request and requires both approved-language notices", () => {
    expect(deletionCapability(approved)).toEqual({ available: true, mode: "request", policyVersion: "test-only-v1", retentionNotice: { ru: approved.CUSTOMER_ACCOUNT_DELETION_NOTICE_RU, tg: approved.CUSTOMER_ACCOUNT_DELETION_NOTICE_TG } });
  });
});
