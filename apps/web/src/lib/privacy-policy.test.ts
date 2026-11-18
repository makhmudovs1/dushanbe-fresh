import { describe, expect, it } from "vitest";
import { privacyContact, publishedPrivacyPolicy } from "./privacy-policy";

const notice = "Текст согласованной политики с контактами оператора. ".repeat(5);

describe("privacy policy publication", () => {
  it("keeps the public page unavailable while either policy is missing or contains an approval placeholder", () => {
    const env = { WEB_PRIVACY_POLICY_RU: notice, WEB_PRIVACY_POLICY_TG: notice };
    expect(publishedPrivacyPolicy(env)).toBeNull();
    expect(publishedPrivacyPolicy({ ...env, WEB_PRIVACY_POLICY_PUBLISHED: "true", WEB_PRIVACY_POLICY_TG: "" })).toBeNull();
    expect(publishedPrivacyPolicy({ ...env, WEB_PRIVACY_POLICY_PUBLISHED: "true", WEB_PRIVACY_POLICY_TG: `${notice}[тамоси оператор]` })).toBeNull();
    expect(publishedPrivacyPolicy({ ...env, WEB_PRIVACY_POLICY_PUBLISHED: "true" })).toEqual({ ru: notice.trim(), tg: notice.trim() });
  });

  it("only puts a single plain email address in the contact link", () => {
    expect(privacyContact({ WEB_PRIVACY_CONTACT_EMAIL: " support@example.test " })).toBe("support@example.test");
    expect(privacyContact({ WEB_PRIVACY_CONTACT_EMAIL: "support@example.test?subject=Other" })).toBeNull();
    expect(privacyContact({ WEB_PRIVACY_CONTACT_EMAIL: "help@example.test\nother@example.test" })).toBeNull();
  });
});
