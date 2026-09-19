import { AdminOrderDetail } from "@/components/admin-order-detail";
export default function OrderPage({ params }: { params: { id: string } }) { return <main className="page"><section className="shell operations"><AdminOrderDetail id={params.id} /></section></main>; }
