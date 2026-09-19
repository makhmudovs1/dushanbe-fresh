import { AdminWaveDetail } from "@/components/admin-wave-detail";
export default function WavePage({ params }: { params: { id: string } }) { return <main className="page"><section className="shell operations"><AdminWaveDetail id={params.id} /></section></main>; }
