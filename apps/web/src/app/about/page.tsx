import Link from "next/link";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/about", "О сервисе | Dushanbe Fresh", "Как работает Dushanbe Fresh: выбираем свежие продукты на рынках Душанбе, проверяем качество, упаковываем и доставляем домой.");

export default function AboutPage() {
  return <main className="page"><div className="shell about-page">
    <header className="page-heading"><h1>Dushanbe Fresh</h1><p>Сервис доставки свежих продуктов с рынков Душанбе.</p></header>
    <p>Мы хотим избавить жителей Душанбе от необходимости ехать на рынок за повседневными продуктами,
      сохранив возможность получать свежие овощи, фрукты, зелень и другие товары с местных рынков.</p>
    <section><h2>Как это работает</h2><ol>
      <li>Вы выбираете продукты и окно доставки.</li>
      <li>Мы закупаем продукты на рынке.</li>
      <li>Сборщик проверяет продукты и упаковывает заказ.</li>
      <li>Курьер доставляет заказ в выбранное окно.</li>
    </ol></section>
    <Link className="primary-link" href="/catalog">Перейти в каталог</Link>
  </div></main>;
}
