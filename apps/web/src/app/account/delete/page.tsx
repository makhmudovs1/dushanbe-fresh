import type { Metadata } from "next";
import { AccountDeletion } from "@/components/account-deletion";
import { privacyContact, publishedPrivacyPolicy } from "@/lib/privacy-policy";
export const metadata: Metadata = { title: "Удаление аккаунта — Dushanbe Fresh", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function AccountDeletionPage() {
  return <main className="page"><div className="shell account-page"><AccountDeletion
    privacyPolicyPublished={Boolean(publishedPrivacyPolicy(process.env))}
    supportEmail={privacyContact(process.env)}
  /></div></main>;
}
