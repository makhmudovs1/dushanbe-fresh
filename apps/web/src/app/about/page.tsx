import Link from "next/link";

export const metadata = { title: "О сервисе | Dushanbe Fresh" };

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
