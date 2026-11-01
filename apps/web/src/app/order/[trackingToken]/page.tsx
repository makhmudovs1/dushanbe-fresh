import type { Metadata } from "next";
import { OrderTracking } from "@/components/order-tracking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ | Dushanbe Fresh",
  description: "Статус и доставка вашего заказа",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function TrackingPage({ params, searchParams }: { params: Promise<{ trackingToken: string }>; searchParams: Promise<{ accountOrder?: string }> }) {
  const { trackingToken } = await params;
  const query = await searchParams;
  const accountOrderId = typeof query.accountOrder === "string" && query.accountOrder.length <= 100 ? query.accountOrder : undefined;
  return <main className="page"><div className="shell tracking-shell"><OrderTracking key={trackingToken} token={trackingToken} accountOrderId={accountOrderId} /></div></main>;
}
