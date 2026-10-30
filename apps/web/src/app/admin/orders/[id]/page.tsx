import { AdminOrderDetail } from "@/components/admin-order-detail";
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="page"><section className="shell operations"><AdminOrderDetail id={id} /></section></main>; }
