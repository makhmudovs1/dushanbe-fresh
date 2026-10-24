import type { Metadata } from "next";
import { CustomerAccount } from "@/components/customer-account";
import { Suspense } from "react";
export const metadata: Metadata = { title: "Dushanbe Fresh", robots: { index: false, follow: false } };
export default function AccountPage() { return <main className="page"><div className="shell account-page"><Suspense><CustomerAccount /></Suspense></div></main>; }
