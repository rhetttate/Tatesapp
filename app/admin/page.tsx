"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminHome() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  // login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      setAuthed(!!data.session);
      setReady(true);
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
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

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 22,
              padding: 18,
              border: "1px solid rgba(29,78,216,0.14)",
              boxShadow: "0 8px 24px rgba(10,42,122,0.06)",
              fontWeight: 900,
              color: "#0a2a7a",
            }}
          >
            Loading…
          </div>
        </div>
      </div>
    );
  }

  // NOT signed in → show admin login UI
  if (!authed) {
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
          .btnPrimary { background: #1d4ed8; color: #fff; flex: 1; }
          .linkRow { margin-top: 14px; display:flex; justify-content: space-between; font-weight: 900; }
        `}</style>

        <div className="wrap">
          <div className="card">
            <div className="title">Admin Sign In</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Sign in to manage deals, members, redemptions, and sales.
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
              <button className="btn btnPrimary" type="button" onClick={signIn} disabled={busy}>
                {busy ? "Working..." : "Sign In"}
              </button>
            </div>

            {msg ? (
              <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{msg}</div>
            ) : null}

            <div className="linkRow">
              <Link href="/reset" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                Reset Password
              </Link>
              <Link href="/" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                Back to App
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Signed in → show admin dashboard landing
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        .wrap { max-width: 900px; margin: 0 auto; }
        .card {
          background: #fff; border-radius: 22px; padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
        .tile {
          display: block;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          background: #ffffff;
          text-decoration: none;
          color: #0a2a7a;
          font-weight: 950;
        }
      `}</style>

      <div className="wrap">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div>
              <div className="title">Admin</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Choose a section.
              </div>
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

          <div className="grid">
            <Link className="tile" href="/admin/deals">Deals</Link>
            <Link className="tile" href="/admin/members">Members</Link>
            <Link className="tile" href="/admin/redemptions">Redemptions</Link>
            <Link className="tile" href="/admin/sales">Sales</Link>
            <Link className="tile" href="/admin/settings">Settings</Link>
          </div>

          {msg ? (
            <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{msg}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
