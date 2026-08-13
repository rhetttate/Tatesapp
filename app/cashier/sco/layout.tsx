import type { Metadata, Viewport } from "next";

// Server-component layout so the SCO screen can carry its own web-app
// manifest: installing from this page ("Add to Home Screen" in Chrome) gives
// a full-screen standalone app that opens straight to /cashier/sco.
export const metadata: Metadata = {
  title: "Self-Checkout Control",
  manifest: "/sco.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SCO",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function ScoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
