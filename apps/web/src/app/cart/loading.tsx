import { CartSkeleton } from "@/components/loading-state";

export default function Loading() {
  return <main className="page"><section className="shell"><CartSkeleton /></section></main>;
}
