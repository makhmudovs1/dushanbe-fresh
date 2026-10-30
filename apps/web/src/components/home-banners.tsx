import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { serverI18n } from "@/i18n/server";
import { homeBanners } from "@/lib/storefront";

export async function HomeBanners() {
  const { t } = await serverI18n();
  return <section className="home-banners" aria-label={t("Выбор продуктов")}>
    {homeBanners.map(banner => <article key={banner.id} className={`home-banner${banner.primary ? " home-banner--primary" : " home-banner--secondary"}`}>
      <Image src={banner.image} alt={t(banner.alt)} fill priority={banner.primary}
        sizes={banner.primary ? "(max-width: 767px) 100vw, (max-width: 1023px) 66vw, 820px" : "(max-width: 767px) 100vw, 360px"} />
      <div className="home-banner__content">
        {banner.primary ? <><span>{t("В нашем каталоге")}</span><h1>{t(banner.title)}</h1></> : <h2>{t(banner.title)}</h2>}
        <p>{t(banner.text)}</p>
        <Link href={banner.href}>{t(banner.action)}<ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </article>)}
  </section>;
}
