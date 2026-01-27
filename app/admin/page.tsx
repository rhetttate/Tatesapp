export default function AdminHome() {
  return (
    <div className="card">
      <div className="title">Admin Dashboard</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Use the tabs above to manage deals, members, sales, redemptions, and settings.
      </div>

      <div className="divider" />

      <div className="muted">
        If you want, I can add a “quick stats” box here (total members, today’s sales, redemptions, etc.)
        without breaking anything.
      </div>
    </div>
  );
}

