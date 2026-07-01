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
    <div className="pageFrame">
      <div className="pageFrameInner" style={{ maxWidth: 560 }}>
        <div className="card fadeIn">
          <div className="title">Admin Sign In</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Use your admin email + password.
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
            <button type="button" className="btn btnPrimary" onClick={signIn} disabled={busy} style={{ flex: 1 }}>
              {busy ? "Working..." : "Sign In"}
            </button>
            <button
              type="button"
              className="btn btnSoft"
              onClick={resetPassword}
              disabled={busy || !email.trim()}
              style={{ flex: 1 }}
            >
              Reset Password
            </button>
          </div>

          {msg ? <div className="statusMsg">{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
