import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverI18n } from "@/i18n/server";
import { publishedPrivacyPolicy } from "@/lib/privacy-policy";

export const metadata: Metadata = { title: "Политика конфиденциальности — Dushanbe Fresh" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const policy = publishedPrivacyPolicy(process.env);
  if (!policy) notFound();
  const { locale } = await serverI18n();
  return <main className="page"><div className="shell account-page"><article className="customer-form">
    <h1>{locale === "tg" ? "Сиёсати махфияти Dushanbe Fresh" : "Политика конфиденциальности Dushanbe Fresh"}</h1>
    {policy[locale].split(/\r?\n\s*\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    <Link href="/account/delete">{locale === "tg" ? "Нест кардани ҳисоб" : "Удаление аккаунта"}</Link>
  </article></div></main>;
}
