import type { Metadata } from "next";
import { OrderTracking } from "@/components/order-tracking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ | Dushanbe Fresh",
  description: "Статус и доставка вашего заказа",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default function TrackingPage({ params }: { params: { trackingToken: string } }) {
  return <main className="page"><div className="shell tracking-shell"><OrderTracking key={params.trackingToken} token={params.trackingToken} /></div></main>;
}
