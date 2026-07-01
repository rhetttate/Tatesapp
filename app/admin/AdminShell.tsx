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
    <div className="statCard">
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
      {sub ? <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{sub}</div> : null}
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
      setErr((e) => e || "Stats are taking longer than usual. Try Refresh.");
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

  return (
    <div className="card fadeIn" style={{ marginTop: 16 }}>
      <div className="title">Quick Stats</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Today resets at midnight.
      </div>

      {err ? (
        <div className="statusMsg statusErr" style={{ marginTop: 10 }}>
          Stats error: {err}
        </div>
      ) : null}

      <div className="statGrid">
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="statCard">
              <div className="skeleton" style={{ height: 13, width: "60%" }} />
              <div className="skeleton" style={{ height: 30, width: "45%", marginTop: 10 }} />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Members" value={String(membersCount)} />
            <StatCard label="Purchases Today" value={String(todayPurchases)} />
            <StatCard label="Sales Today" value={`$${money(todaySales)}`} />
            <StatCard label="Redemptions Today" value={String(todayRedemptions)} />
          </>
        )}
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
    <div className="pageFrame">
      <div className="pageFrameInner" style={{ maxWidth: 560 }}>
        <div className="card fadeIn">
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
              style={{ flex: 1 }}
            >
              {busy ? "Working..." : "Sign In"}
            </button>
            <button
              type="button"
              className="btn btnSoft"
              onClick={resetPassword}
              disabled={busy}
              style={{ flex: 1 }}
            >
              Reset Password
            </button>
          </div>

          {status ? <div className="statusMsg">{status}</div> : null}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
            <Link href="/privacy" style={{ color: "var(--blue2)", fontWeight: 800 }}>
              Privacy Policy
            </Link>
            <Link href="/contact" style={{ color: "var(--blue2)", fontWeight: 800 }}>
              Contact Us
            </Link>
          </div>
        </div>
      </div>
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
      <div className="pageFrame">
        <div className="pageFrameInner" style={{ maxWidth: 980 }}>
          <div className="card">
            <div className="title">Admin</div>
            <div className="muted" style={{ marginTop: 8 }}>Loading…</div>
          </div>
        </div>
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
      <div className="pageFrame">
        <div className="pageFrameInner" style={{ maxWidth: 560 }}>
          <div className="card fadeIn">
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
      </div>
    );
  }

  // Authed admin -> render admin UI + tabs
  return (
    <div className="pageFrame">
      <div className="pageFrameInner" style={{ maxWidth: 980 }}>
        <div className="adminTopRow">
          <div className="adminBrand">Tate’s Admin</div>
          <button className="btnLink" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>

        <div className="adminTabs">
          <Link href="/admin" className={tabClass("/admin")}>Dashboard</Link>
          <Link href="/admin/coupon" className={tabClass("/admin/coupon")}>Coupons</Link>
          <Link href="/admin/deals" className={tabClass("/admin/deals")}>Deals</Link>
          <Link href="/admin/sales" className={tabClass("/admin/sales")}>Sales</Link>
          <Link href="/admin/plus" className={tabClass("/admin/plus")}>PLUs</Link>
          <Link href="/admin/members" className={tabClass("/admin/members")}>Members</Link>
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
