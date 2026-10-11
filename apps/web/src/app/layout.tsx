import "./styles.css";

import { CartProvider } from "@/cart/cart-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Dushanbe Fresh",
  description: "Fresh grocery delivery from local markets in Dushanbe",
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
