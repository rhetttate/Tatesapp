import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tates Supermarket",
  description: "tates supermarket grocery rewards app",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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

        <footer style={{ padding: 16, textAlign: "center" }}>
          <a
            href="/privacy"
            style={{ marginRight: 16, fontWeight: 900, color: "#1d4ed8", textDecoration: "none" }}
          >
            Privacy Policy
          </a>
          <a
            href="/contact"
            style={{ fontWeight: 900, color: "#1d4ed8", textDecoration: "none" }}
          >
            Contact
          </a>
        </footer>
      </body>
    </html>
  );
}
