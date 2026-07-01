import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tate's Supermarket — Deals & Rewards",
  description: "Browse weekly deals, clip coupons, and earn points at Tate's Supermarket.",
  applicationName: "Tate's Rewards",
  openGraph: {
    title: "Tate's Supermarket — Deals & Rewards",
    description: "Browse weekly deals, clip coupons, and earn points at Tate's Supermarket.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}

        <footer className="siteFooter">
          <a href="/privacy">Privacy Policy</a>
          <a href="/contact">Contact</a>
        </footer>
      </body>
    </html>
  );
}
