"use client";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  // The register (/cashier) and UPC board (/cashier/upcs) are full-screen kiosks
  // that render their own top bar, so the layout just passes children through.
  return <>{children}</>;
}