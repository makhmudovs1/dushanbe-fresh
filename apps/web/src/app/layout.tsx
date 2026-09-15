import "./globals.css";

export const metadata = {
  title: "Dushanbe Fresh",
  description: "Fresh grocery delivery from local markets in Dushanbe"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
