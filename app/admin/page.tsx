"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminHome() {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ CHANGE THIS to YOUR admin email
  const ADMIN_EMAIL = "support@tatessupermarket.com";

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;

    setAuthUid(user?.id ?? null);

    // Optional: if logged in but not your admin email, boot them
    const userEmail = (user?.email || "").toLowerCase();
    if (user && userEmail && userEmail !== ADMIN_EMAIL.toLowerCase()) {
      await supabase.auth.signOut();
      setAuthUid(null);
      setMsg("Not authorized for admin.");
    }
  }

  useEffect(() => {
    refreshSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshSession();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) setMsg(error.message);
    } catch (e: any) {
      setMsg("Sign in error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setMsg(error.message);
    } catch (e: any) {
      setMsg("Sign out error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setMsg("");
    setBusy(true);
    try {
      const target = email.trim();
      if (!target) {
        setMsg("Enter your email above first.");
        return;
      }

      // Sends reset email. Make sure redirect URL is allowed in Supabase Auth settings.
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: "https://admin.tatessupermarket.com/reset",
      });

      if (error) setMsg(error.message);
      else setMsg("Password reset email sent ✅");
    } catch (e: any) {
      setMsg("Reset error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        .wrap { max-width: 560px; margin: 0 auto; }
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
        a { color: #1d4ed8; text-decoration: none; font-weight: 950; }
        .divider { height: 1px; background: rgba(29,78,216,0.12); margin: 14px 0; }
      `}</style>

      <div className="wrap">
        {!authUid ? (
          <div className="card">
            <div className="title">Admin Sign In</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Admin access is restricted.
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

            {msg ? <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{msg}</div> : null}

            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/contact">Contact Us</Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div>
                <div className="title">Admin</div>
                <div className="muted" style={{ marginTop: 6 }}>Choose a section:</div>
              </div>

              <button
                type="button"
                onClick={signOut}
                disabled={busy}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#1d4ed8",
                  fontWeight: 950,
                  opacity: busy ? 0.7 : 1,
                  cursor: "pointer",
                }}
              >
                {busy ? "..." : "Sign out"}
              </button>
            </div>

            <div className="divider" />

            <div style={{ display: "grid", gap: 12 }}>
              <Link href="/admin/deals">Deals</Link>
              <Link href="/admin/members">Members</Link>
              <Link href="/admin/sales">Sales</Link>
              <Link href="/admin/redemptions">Redemptions</Link>
              <Link href="/admin/settings">Settings</Link>
            </div>

            {msg ? <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{msg}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
