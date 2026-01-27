"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  const tabClass = (href: string) =>
    "tab " + (path === href ? "tabActive" : "");

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        a { color: inherit; }
        .wrap { max-width: 860px; margin: 0 auto; }

        .tabs {
          display: flex;
          justify-content: center;
          gap: 26px;
          font-weight: 950;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .tab { text-decoration: none; color: #94a3b8; padding-bottom: 6px; }
        .tabActive { color: #1d4ed8; border-bottom: 3px solid #1d4ed8; }

        .card {
          background: #fff;
          border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
        .divider { height: 1px; background: rgba(29,78,216,0.12); margin: 14px 0; }
      `}</style>

      <div className="wrap">
        <div className="tabs">
          <Link href="/admin" className={tabClass("/admin")}>Dashboard</Link>
          <Link href="/admin/deals" className={tabClass("/admin/deals")}>Deals</Link>
          <Link href="/admin/members" className={tabClass("/admin/members")}>Members</Link>
          <Link href="/admin/sales" className={tabClass("/admin/sales")}>Sales</Link>
          <Link href="/admin/redemptions" className={tabClass("/admin/redemptions")}>Redemptions</Link>
          <Link href="/admin/settings" className={tabClass("/admin/settings")}>Settings</Link>
        </div>

        {children}
      </div>
    </div>
  );
}
