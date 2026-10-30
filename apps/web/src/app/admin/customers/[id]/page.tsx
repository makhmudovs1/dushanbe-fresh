import { CustomerProfile } from "@/components/delivery-backoffice";
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="page"><section className="shell operations"><CustomerProfile id={id} /></section></main>; }
