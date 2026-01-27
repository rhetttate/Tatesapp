"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return setMsg(error.message);

      // go to admin home
      router.push("/admin");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) return setMsg(error.message);
      setMsg("Password reset email sent ✅");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
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
          <div style={{ fontSize: 22, fontWeight: 950, color: "#0a2a7a" }}>Admin Sign In</div>
          <div style={{ color: "rgba(10,42,122,0.65)", fontWeight: 800, marginTop: 6 }}>
            Use your admin email + password.
          </div>

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
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />

          <input
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 14,
              border: "1px solid #c7d2fe",
              marginTop: 8,
              fontWeight: 850,
              outline: "none",
            }}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={signIn}
              disabled={busy}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 16,
                border: 0,
                fontWeight: 950,
                cursor: "pointer",
                background: "#1d4ed8",
                color: "#fff",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Working..." : "Sign In"}
            </button>

            <button
              type="button"
              onClick={resetPassword}
              disabled={busy || !email.trim()}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 16,
                border: 0,
                fontWeight: 950,
                cursor: "pointer",
                background: "#e8efff",
                color: "#1d4ed8",
                opacity: busy ? 0.7 : 1,
              }}
            >
              Reset Password
            </button>
          </div>

          {msg ? <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
