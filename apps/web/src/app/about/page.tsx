import { serverI18n } from "@/i18n/server";
import Link from "next/link";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/about", "О сервисе | Dushanbe Fresh", "Как работает Dushanbe Fresh: выбираем свежие продукты на рынках Душанбе, проверяем качество, упаковываем и доставляем домой.");

export default function AboutPage() {
  const { t } = serverI18n();
  return <main className="page"><div className="shell about-page">
    <header className="page-heading"><h1>Dushanbe Fresh</h1><p>{t("Сервис доставки свежих продуктов с рынков Душанбе.")}</p></header>
    <p>{t("Мы хотим избавить жителей Душанбе от необходимости ехать на рынок за повседневными продуктами, сохранив возможность получать свежие овощи, фрукты, зелень и другие товары с местных рынков.")}</p>
    <section><h2>{t("Как это работает")}</h2><ol>
      <li>{t("Вы выбираете продукты и окно доставки.")}</li>
      <li>{t("Мы закупаем продукты на рынке.")}</li>
      <li>{t("Сборщик проверяет продукты и упаковывает заказ.")}</li>
      <li>{t("Курьер доставляет заказ в выбранное окно.")}</li>
    </ol></section>
    <Link className="primary-link" href="/catalog">{t("Перейти в каталог")}</Link>
  </div></main>;
}
