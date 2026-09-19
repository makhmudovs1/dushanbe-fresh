import "./globals.css";

import { CartProvider } from "@/cart/cart-context";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Dushanbe Fresh",
  description: "Fresh grocery delivery from local markets in Dushanbe"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <SiteHeader />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
