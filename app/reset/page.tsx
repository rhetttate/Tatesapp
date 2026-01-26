"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ResetPage() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase sets a recovery session when user opens the link
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
  }, []);

  async function updatePassword() {
    setStatus("");
    setBusy(true);
    try {
      if (!pw1 || pw1.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pw1 !== pw2) throw new Error("Passwords do not match.");

      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      setStatus("Password updated ✅ You can go back and sign in.");
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
          <div style={{ fontSize: 22, fontWeight: 950, color: "#0a2a7a" }}>Reset Password</div>
          <div style={{ color: "rgba(10,42,122,0.65)", fontWeight: 800, marginTop: 6 }}>
            Enter a new password.
          </div>

          {!ready ? (
            <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>
              Open the reset link from your email on this device/browser.
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
