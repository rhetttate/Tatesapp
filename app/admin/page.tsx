export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, color: "#0a2a7a" }}>
        Overview
      </div>
      <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)" }}>
        Pick a section above.
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <a
          href="/admin/deals"
          style={{
            textDecoration: "none",
            background: "rgba(29,78,216,0.08)",
            border: "1px solid rgba(29,78,216,0.16)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Deals</div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
            Create & manage weekly deals.
          </div>
        </a>

        <a
          href="/admin/members"
          style={{
            textDecoration: "none",
            background: "rgba(29,78,216,0.08)",
            border: "1px solid rgba(29,78,216,0.16)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Members</div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
            View members, points, and activity.
          </div>
        </a>

        <a
          href="/admin/sales"
          style={{
            textDecoration: "none",
            background: "rgba(29,78,216,0.08)",
            border: "1px solid rgba(29,78,216,0.16)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Sales</div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
            Track sales entries.
          </div>
        </a>

        <a
          href="/admin/redemptions"
          style={{
            textDecoration: "none",
            background: "rgba(29,78,216,0.08)",
            border: "1px solid rgba(29,78,216,0.16)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Redemptions</div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
            Review redemptions and coupon events.
          </div>
        </a>

        <a
          href="/admin/settings"
          style={{
            textDecoration: "none",
            background: "rgba(29,78,216,0.08)",
            border: "1px solid rgba(29,78,216,0.16)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Settings</div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
            Configure app settings.
          </div>
        </a>
      </div>

      <div style={{ marginTop: 16, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
        If you still see a blank page after this, it’s almost always a crash inside one of the nested pages
        (Deals/Members/etc) or a layout import mismatch — but this home page and layout will render on their own.
      </div>
    </div>
  );
}
