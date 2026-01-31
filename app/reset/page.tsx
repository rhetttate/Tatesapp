"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

function getHashParams() {
  // Supabase sometimes sends tokens in the URL hash
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  return { access_token, refresh_token, type };
}

export default function ResetPage() {
  const sp = useSearchParams();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const code = useMemo(() => sp.get("code") || "", [sp]);

  // ✅ Ensure we have a recovery session from the reset link
  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        setChecking(true);
        setStatus("");

        // 1) If a session already exists, we're ready
        const { data: sess1 } = await supabase.auth.getSession();
        if (!alive) return;

        if (sess1.session) {
          setReady(true);
          return;
        }

        // 2) PKCE flow: link has ?code=...
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!alive) return;
          if (error) throw error;

          setReady(!!data.session);
          return;
        }

        // 3) Implicit flow: link has #access_token=...&refresh_token=...
        const { access_token, refresh_token, type } = getHashParams();
        if (access_token && refresh_token && (type === "recovery" || type === "")) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (!alive) return;
          if (error) throw error;

          // Clean up the URL hash so refreshes don't re-run it
          window.history.replaceState({}, document.title, window.location.pathname);

          setReady(!!data.session);
          return;
        }

        // If we got here, we didn't get a usable recovery session
        setReady(false);
      } catch (e: any) {
        setReady(false);
        setStatus("Error: " + (e?.message ?? String(e)));
      } finally {
        if (!alive) return;
        setChecking(false);
      }
    };

    init();

    return () => {
      alive = false;
    };
  }, [code]);

  async function updatePassword() {
    setStatus("");
    setBusy(true);
    try {
      if (!pw1 || pw1.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pw1 !== pw2) throw new Error("Passwords do not match.");

      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      setStatus("Password updated ✅ Redirecting…");
      setTimeout(() => {
        window.location.href = "/member";
      }, 700);
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

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
          }}
        >
          {/* Optional logo (same file you used on deals) */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            {/* Put /public/tatessign.png */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tatessign.png"
              alt="Tate’s Supermarket"
              style={{ height: 44, width: "auto", objectFit: "contain" }}
            />
          </div>

          <div style={{ fontSize: 22, fontWeight: 950, color: "#0a2a7a" }}>Reset Password</div>
          <div style={{ color: "rgba(10,42,122,0.65)", fontWeight: 800, marginTop: 6 }}>
            Enter a new password.
          </div>

          {checking ? (
            <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>Checking reset link…</div>
          ) : !ready ? (
            <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>
              Open the reset link from your email on this device/browser.
              <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(10,42,122,0.65)", fontSize: 13 }}>
                If it still won’t work, the link might be expired — request a new reset from the Points page.
              </div>
            </div>
          ) : (
            <>
              <input
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #c7d2fe",
                  marginTop: 12,
                  fontWeight: 850,
                  outline: "none",
                }}
                type="password"
                placeholder="New password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />

              <input
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #c7d2fe",
                  marginTop: 10,
                  fontWeight: 850,
                  outline: "none",
                }}
                type="password"
                placeholder="Confirm password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />

              <button
                onClick={updatePassword}
                disabled={busy}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: 14,
                  borderRadius: 16,
                  border: 0,
                  background: "#1d4ed8",
                  color: "#fff",
                  fontWeight: 950,
                  cursor: "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Saving…" : "Update password"}
              </button>
            </>
          )}

          {status ? <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{status}</div> : null}
        </div>
      </div>
    </div>
  );
}
