import "./styles.css";
import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

import { CartProvider } from "@/cart/cart-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Dushanbe Fresh",
  description: SITE_DESCRIPTION,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined },
  icons: {
    icon: { url: "/brand/favicon.ico", type: "image/x-icon" },
    shortcut: "/brand/favicon.ico",
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
