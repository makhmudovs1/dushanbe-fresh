import Link from "next/link";
import { CheckoutSkeleton } from "@/components/loading-state";

export default function Loading() {
  return <main className="page"><div className="shell">
    <Link className="back-link" href="/cart">Вернуться в корзину</Link>
    <header className="page-heading"><h1>Оформление заказа</h1><p>Свежие продукты с доставкой по Душанбе</p></header>
    <CheckoutSkeleton />
  </div></main>;
}
