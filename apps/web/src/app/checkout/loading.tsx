import Link from "next/link";
import { CheckoutSkeleton } from "@/components/loading-state";
import { serverI18n } from "@/i18n/server";

export default function Loading() {
  const { t } = serverI18n();
  return <main className="page"><div className="shell">
    <Link className="back-link" href="/cart">{t("Вернуться в корзину")}</Link>
    <header className="page-heading"><h1>{t("Оформление заказа")}</h1><p>{t("Свежие продукты с доставкой по Душанбе")}</p></header>
    <CheckoutSkeleton />
  </div></main>;
}
