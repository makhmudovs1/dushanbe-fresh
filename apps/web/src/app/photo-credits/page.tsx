import { serverI18n } from "@/i18n/server";
import sources from "@/lib/product-photo-sources.json";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/photo-credits", "Источники фотографий | Dushanbe Fresh", "Авторы, источники и лицензии иллюстративных фотографий продуктов Dushanbe Fresh.");

export default function PhotoCreditsPage() {
  const { locale, name } = serverI18n();
  const tj = locale === "tg";
  return <main className="page"><div className="shell photo-credits">
    <header className="page-heading"><h1>{tj ? "Манбаъҳои аксҳо" : "Источники фотографий"}</h1>
      <p>{tj ? "Муаллифон ва иҷозатномаҳои аксҳои маҳсулот." : "Авторы и лицензии фотографий продуктов."}</p>
    </header>
    <p>{tj ? "Аксҳо намуди маҳсулотро нишон медиҳанд, на гурӯҳи мушаххаси маҳсулоти фармоиши шумо." : "Фотографии иллюстрируют вид продукта, а не конкретную партию вашего заказа."}</p>
    <p>{tj ? "Аксҳо хурд карда, ба WebP табдил дода шудаанд. Ба аксҳои нав барои нигоҳ доштани маҳсулот пурра майдони сафеди мураббаъ илова шудааст. Ҳар акси коркардшуда иҷозатномаи манбаъро нигоҳ медорад; ин иҷозатнома ба рамзи сайт дахл надорад." : "Фотографии уменьшены и преобразованы в WebP. Для новых фото добавлено квадратное белое поле, чтобы сохранить продукт целиком. Каждая обработанная фотография сохраняет лицензию источника; она не распространяется на код сайта."}</p>
    <ul className="photo-credits__list">{sources.map(source => <li key={source.slug}>
      <h2>{name(source)}</h2>
      <p>{source.author}</p>
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.title.replace(/^File:/, "")}</a>
      <div className="photo-credits__links">
        <a href={source.licenseUrl} target="_blank" rel="license noopener noreferrer">{source.license}</a>
        <a href={source.imageUrl} target="_blank" rel="noopener noreferrer">{tj ? "Акси коркардшуда" : "Обработанная фотография"}</a>
      </div>
    </li>)}</ul>
  </div></main>;
}
