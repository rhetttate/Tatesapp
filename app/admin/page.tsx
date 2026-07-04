import Link from "next/link";

const QUICK_LINKS = [
  { href: "/admin/deals", title: "Deals", desc: "Home-page deals, departments, featured order" },
  { href: "/admin/coupon", title: "Coupons", desc: "Create coupons and track redemptions" },
  { href: "/admin/sales", title: "Sale Items", desc: "The tap-to-ring items on the cashier tablet" },
  { href: "/admin/plus", title: "PLUs", desc: "Produce lookup codes for the cashier" },
  { href: "/admin/members", title: "Members", desc: "Look up members and point balances" },
  { href: "/admin/settings", title: "Settings", desc: "Points rate and double-points day" },
];

export default function AdminHome() {
  return (
    <div className="card fadeIn">
      <div className="title">Dashboard</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Everything for running rewards, deals, and the cashier tablet.
      </div>

      <div className="divider" />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {QUICK_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="listRow" style={{ display: "block" }}>
            <div className="listRowName" style={{ fontSize: 16 }}>{l.title} →</div>
            <div className="listRowMeta" style={{ fontWeight: 600 }}>{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
