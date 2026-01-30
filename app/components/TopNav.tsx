"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const path = usePathname();

  const tabClass = (href: string) => {
    const active = path === href || (href !== "/" && path?.startsWith(href));
    return "tab " + (active ? "tabActive" : "");
  };

  return (
    <div className="topNavWrap">
      <div className="logoBar">
        <div className="logoBox">
          <img className="logoImg" src="/tatessign.png" alt="Tate's Supermarket" />
        </div>
      </div>

      <div className="tabs">
        <Link href="/" className={tabClass("/")}>
          Deals
        </Link>
        <Link href="/coupons" className={tabClass("/coupon")}>
          Coupons
        </Link>
        <Link href="/member" className={tabClass("/member")}>
          Points
        </Link>
      </div>
    </div>
  );
}
