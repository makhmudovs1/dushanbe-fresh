"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export function LegacyCartNotice({ checkout = false }: { checkout?: boolean }) {
  const { t } = useI18n();
  return <div className="notice legacy-cart-notice" role="alert">
    <p>{t("В корзине есть старые позиции с предпочтениями. Они сохранены без изменений. Удалите их и выберите конкретные товары заново.")}</p>
    <Link className="secondary-link" href={checkout ? "/cart" : "/catalog"}>{t(checkout ? "Уточнить корзину" : "Выбрать товары в каталоге")}</Link>
  </div>;
}
