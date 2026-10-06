import { CustomerProfile } from "@/components/delivery-backoffice";
export default function CustomerPage({ params }: { params: { id: string } }) { return <main className="page"><section className="shell operations"><CustomerProfile id={params.id} /></section></main>; }
