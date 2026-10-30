import type { Metadata } from "next";
import { OrderTracking } from "@/components/order-tracking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ | Dushanbe Fresh",
  description: "Статус и доставка вашего заказа",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function TrackingPage({ params }: { params: Promise<{ trackingToken: string }> }) {
  const { trackingToken } = await params;
  return <main className="page"><div className="shell tracking-shell"><OrderTracking key={trackingToken} token={trackingToken} /></div></main>;
}
