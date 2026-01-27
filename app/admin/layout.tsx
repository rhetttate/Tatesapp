export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        body { margin: 0; }
        .wrap { max-width: 900px; margin: 0 auto; }
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 14px;
        }
        .brand {
          font-weight: 950; color: #0a2a7a; font-size: 18px;
          letter-spacing: 0.2px;
        }
        .nav {
          display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end;
        }
        .link {
          text-decoration: none;
          font-weight: 900;
          color: #1d4ed8;
          background: rgba(29,78,216,0.10);
          border: 1px solid rgba(29,78,216,0.18);
          padding: 8px 12px;
          border-radius: 999px;
        }
        .card {
          background: #fff;
          border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
      `}</style>

      <div className="wrap">
        <div className="topbar">
          <div className="brand">Admin Dashboard</div>

          <div className="nav">
            <a className="link" href="/admin">Overview</a>
            <a className="link" href="/admin/deals">Deals</a>
            <a className="link" href="/admin/members">Members</a>
            <a className="link" href="/admin/sales">Sales</a>
            <a className="link" href="/admin/redemptions">Redemptions</a>
            <a className="link" href="/admin/settings">Settings</a>
          </div>
        </div>

        <div className="card">{children}</div>
      </div>
    </div>
  );
}
