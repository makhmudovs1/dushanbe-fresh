import type { Metadata } from "next";

export const SITE_URL = "https://dushanbefresh.tj";
export const HOME_TITLE = "Dushanbe Fresh — доставка свежих продуктов в Душанбе";
export const SITE_DESCRIPTION = "Свежие овощи, фрукты, зелень, орехи и сухофрукты с рынков Душанбе. Выбирайте продукты в Dushanbe Fresh и заказывайте доставку домой в удобное время.";

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, SITE_URL).href;
  const image = { url: `${SITE_URL}/brand/icon-v2.png`, width: 512, height: 512, alt: "Dushanbe Fresh" };
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "ru_RU", siteName: "Dushanbe Fresh", title, description, url, images: [image] },
    twitter: { card: "summary", title, description, images: [image.url] }
  };
}

export function privateMetadata(title: string): Metadata {
  return { title: `${title} | Dushanbe Fresh`, robots: { index: false, follow: false } };
}
