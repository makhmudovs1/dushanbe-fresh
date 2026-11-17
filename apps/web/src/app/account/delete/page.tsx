import type { Metadata } from "next";
import { AccountDeletion } from "@/components/account-deletion";
export const metadata: Metadata = { title: "Удаление аккаунта — Dushanbe Fresh", robots: { index: false, follow: false } };
export default function AccountDeletionPage() { return <main className="page"><div className="shell account-page"><AccountDeletion /></div></main>; }
