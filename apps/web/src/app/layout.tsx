import "./styles.css";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";
import { serverI18n } from "@/i18n/server";
import { LanguageProvider } from "@/i18n/provider";

import { CartProvider } from "@/cart/cart-context";
import { FavoritesProvider } from "@/favorites/favorites-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MobileNavigation } from "@/components/mobile-navigation";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Dushanbe Fresh",
  viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" },
  description: SITE_DESCRIPTION,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined },
  icons: {
    icon: { url: "/brand/favicon-v2.ico", type: "image/x-icon" },
    shortcut: "/brand/favicon-v2.ico",
    apple: { url: "/brand/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = serverI18n();
  return (
    <html lang={locale}>
      <body>
        <LanguageProvider initialLocale={locale}>
        <FavoritesProvider><CartProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
          <Suspense fallback={null}><MobileNavigation /></Suspense>
        </CartProvider></FavoritesProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
