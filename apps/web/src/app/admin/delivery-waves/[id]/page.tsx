import { AdminWaveDetail } from "@/components/admin-wave-detail";
export default async function WavePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="page"><section className="shell operations"><AdminWaveDetail id={id} /></section></main>; }
