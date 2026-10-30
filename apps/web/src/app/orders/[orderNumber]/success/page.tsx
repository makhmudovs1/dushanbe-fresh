import { OrderSuccess } from "@/components/order-success";

export default async function OrderSuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return <main className="page"><section className="shell"><OrderSuccess orderNumber={orderNumber} /></section></main>;
}
