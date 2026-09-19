import { OrderSuccess } from "@/components/order-success";

export default function OrderSuccessPage({ params }: { params: { orderNumber: string } }) {
  return <main className="page"><section className="shell"><OrderSuccess orderNumber={params.orderNumber} /></section></main>;
}
