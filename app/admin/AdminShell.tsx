"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL_ALLOWLIST = ["rhetttate19@icloud.com"];

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function money(n: number) {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 14,
        border: "1px solid rgba(29,78,216,0.14)",
        boxShadow: "0 8px 24px rgba(10,42,122,0.06)",
      }}
    >
      <div style={{ fontWeight: 950, color: "#0a2a7a" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 950, color: "#0a2a7a", marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 6, color: "rgba(10,42,122,0.65)", fontWeight: 800, fontSize: 13 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function AdminDashboardQuickStats() {
  const [loading, setLoading] = useState(true);
  const [membersCount, setMembersCount] = useState<number>(0);
  const [todaySales, setTodaySales] = useState<number>(0);
  const [todayPurchases, setTodayPurchases] = useState<number>(0);
  const [todayRedemptions, setTodayRedemptions] = useState<number>(0);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let alive = true;

    // hard timeout so it can never "stick"
    const timeout = setTimeout(() => {
      if (!alive) return;
      setErr((e) => e || "Stats timed out (check RLS/table names).");
      setLoading(false);
    }, 4000);

    (async () => {
      try {
        setErr("");
        setLoading(true);

        const since = startOfTodayISO();

        // total members (count only)
        const m = await supabase.from("members").select("id", { count: "exact", head: true });
        if (m.error) throw m.error;

        // today purchases + total sales
        const p = await supabase
          .from("purchases")
          .select("amount, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (p.error) throw p.error;

        const purchases = (p.data ?? []) as any[];
        const purchaseCount = purchases.length;
        const salesSum = purchases.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);

        // today redemption requests (use your real table)
        const r = await supabase
          .from("redemption_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (r.error) throw r.error;

        if (!alive) return;

        setMembersCount(m.count ?? 0);
        setTodayPurchases(purchaseCount);
        setTodaySales(salesSum);
        setTodayRedemptions(r.count ?? 0);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        clearTimeout(timeout);
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="title">Quick Stats</div>
        <div className="muted" style={{ marginTop: 8 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="title">Quick Stats</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Today resets at midnight.
      </div>

      {err ? (
        <div style={{ marginTop: 10, fontWeight: 900, color: "#b91c1c" }}>
          Stats error: {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <StatCard label="Total Members" value={String(membersCount)} />
        <StatCard label="Purchases Today" value={String(todayPurchases)} />
        <StatCard label="Sales Today" value={`$${money(todaySales)}`} />
        <StatCard label="Redemptions Today" value={String(todayRedemptions)} />
      </div>
    </div>
  );
}


function AdminLogin({
  onDone,
}: {
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setStatus("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setStatus("");
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setStatus("Reset email sent ✅ Check your inbox.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <div className="wrap">
        <div className="card">
          <div className="title">Admin Login</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Sign in to manage your store.
          </div>

          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="btnRow">
            <button
              type="button"
              className="btn btnPrimary"
              onClick={signIn}
              disabled={busy}
              style={{ flex: 1, opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Working..." : "Sign In"}
            </button>
            <button
              type="button"
              className="btn btnSoft"
              onClick={resetPassword}
              disabled={busy}
              style={{ flex: 1, opacity: busy ? 0.7 : 1 }}
            >
              Reset Password
            </button>
          </div>

          {status ? (
            <div style={{ marginTop: 12, fontWeight: 900, color: "#0a2a7a" }}>
              {status}
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
            <Link href="/privacy" style={{ color: "#1d4ed8", textDecoration: "none" }}>
              Privacy Policy
            </Link>
            <Link href="/contact" style={{ color: "#1d4ed8", textDecoration: "none" }}>
              Contact Us
            </Link>
          </div>
        </div>
      </div>

      {/* styles (client component — OK) */}
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        .wrap { max-width: 860px; margin: 0 auto; }
        .card {
          background: #fff; border-radius: 22px; padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
        .input {
          width: 100%; padding: 14px; border-radius: 14px;
          border: 1px solid #c7d2fe; margin-top: 8px; font-weight: 850;
          outline: none;
        }
        .btnRow { display: flex; gap: 10px; margin-top: 12px; }
        .btn {
          padding: 14px; border-radius: 16px; border: 0;
          font-weight: 950; cursor: pointer;
        }
        .btnPrimary { background: #1d4ed8; color: #fff; }
        .btnSoft { background: #e8efff; color: #1d4ed8; }
      `}</style>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const tabClass = (href: string) => "tab " + (path === href ? "tabActive" : "");

  const isDashboard = useMemo(() => path === "/admin", [path]);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;

    if (!user) {
      setAuthed(false);
      setIsAdmin(false);
      return;
    }

    const email = (user.email ?? "").toLowerCase();
    const ok = ADMIN_EMAIL_ALLOWLIST.includes(email);

    setAuthed(true);
    setIsAdmin(ok);
  }

  useEffect(() => {
  let alive = true;

  const init = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;

      if (!alive) return;

      if (!user) {
        setAuthed(false);
        setIsAdmin(false);
      } else {
        const email = (user.email ?? "").toLowerCase();
        setAuthed(true);
        setIsAdmin(ADMIN_EMAIL_ALLOWLIST.includes(email));
      }
    } finally {
      if (alive) setBooting(false); // 🔑 ALWAYS clear booting
    }
  };

  init();

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!alive) return;

    const user = session?.user ?? null;

    if (!user) {
      setAuthed(false);
      setIsAdmin(false);
    } else {
      const email = (user.email ?? "").toLowerCase();
      setAuthed(true);
      setIsAdmin(ADMIN_EMAIL_ALLOWLIST.includes(email));
    }
  });

  return () => {
    alive = false;
    sub.subscription.unsubscribe();
  };
}, []);


  async function signOut() {
    await supabase.auth.signOut();
    // send them to main public app
    router.push("/");
  }

  // Boot screen
  if (booting) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
        <div className="wrap">
          <div className="card">
            <div className="title">Admin</div>
            <div className="muted" style={{ marginTop: 8 }}>Loading…</div>
          </div>
        </div>
        <style jsx global>{`
          .wrap { max-width: 860px; margin: 0 auto; }
          .card {
            background: #fff; border-radius: 22px; padding: 18px;
            border: 1px solid rgba(29,78,216,0.14);
            box-shadow: 0 8px 24px rgba(10,42,122,0.06);
          }
          .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
          .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
        `}</style>
      </div>
    );
  }

  // Not logged in -> show admin login
  if (!authed) {
    return <AdminLogin onDone={checkAuth} />;
  }

  // Logged in but not allowed
  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
        <div className="wrap">
          <div className="card">
            <div className="title">Access denied</div>
            <div className="muted" style={{ marginTop: 6 }}>
              This account is not allowed to access Admin.
            </div>

            <div className="btnRow">
              <button className="btn btnPrimary" type="button" onClick={signOut} style={{ flex: 1 }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
        <style jsx global>{`
          .wrap { max-width: 860px; margin: 0 auto; }
          .card {
            background: #fff; border-radius: 22px; padding: 18px;
            border: 1px solid rgba(29,78,216,0.14);
            box-shadow: 0 8px 24px rgba(10,42,122,0.06);
          }
          .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
          .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
          .btnRow { display: flex; gap: 10px; margin-top: 12px; }
          .btn {
            padding: 14px; border-radius: 16px; border: 0;
            font-weight: 950; cursor: pointer;
          }
          .btnPrimary { background: #1d4ed8; color: #fff; }
        `}</style>
      </div>
    );
  }

  // Authed admin -> render admin UI + tabs
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        a { color: inherit; }
        .wrap { max-width: 860px; margin: 0 auto; }

        .topRow {
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

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

        .btnLink {
          border: 0;
          background: transparent;
          color: #1d4ed8;
          font-weight: 950;
          cursor: pointer;
        }
      `}</style>

      <div className="wrap">
        <div className="topRow">
          <div style={{ fontWeight: 950, color: "#0a2a7a" }}>Tate’s Admin</div>
          <button className="btnLink" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>

        <div className="tabs">
          <Link href="/admin" className={tabClass("/admin")}>Dashboard</Link>
          <Link href="/admin/deals" className={tabClass("/admin/deals")}>Deals</Link>
          <Link href="/admin/members" className={tabClass("/admin/members")}>Members</Link>
          <Link href="/admin/sales" className={tabClass("/admin/sales")}>Sales</Link>
          <Link href="/admin/redemptions" className={tabClass("/admin/redemptions")}>Redemptions</Link>
          <Link href="/admin/settings" className={tabClass("/admin/settings")}>Settings</Link>
        </div>

        {children}

        {/* Quick stats only on /admin */}
        {isDashboard ? <AdminDashboardQuickStats /> : null}
      </div>
    </div>
  );
}
