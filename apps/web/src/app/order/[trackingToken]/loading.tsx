import { TrackingSkeleton } from "@/components/tracking-skeleton";

export default function Loading() {
  return <main className="page"><div className="shell tracking-shell"><TrackingSkeleton /></div></main>;
}
