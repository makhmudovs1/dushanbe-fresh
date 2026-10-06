import { ProductGridSkeleton } from "@/components/loading-state";

export default function Loading() {
  return <main className="page"><div className="shell"><ProductGridSkeleton /></div></main>;
}
