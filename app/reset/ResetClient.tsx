"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetClient() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const searchParams = useSearchParams();

  // Supabase processes the recovery token from the URL asynchronously
  // (detectSessionInUrl). A one-shot getSession() often runs BEFORE that
  // finishes, so we also listen for the auth event and flip ready then.
  useEffect(() => {
    let alive = true;
    searchParams?.toString(); // mark this as client-only logic

    const finish = (ok: boolean) => {
      if (!alive) return;
      setReady(ok);
      setChecking(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) finish(true);
      })
      .catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
        finish(true);
      }
    });

    // Give the URL-token exchange a moment before concluding it failed.
    const t = setTimeout(() => {
      if (alive && !ready) setChecking(false);
    }, 2500);

    return () => {
      alive = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function updatePassword() {
    setStatus("");
    setBusy(true);
    try {
      if (!pw1 || pw1.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pw1 !== pw2) throw new Error("Passwords do not match.");

      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      setStatus("Password updated ✅ Taking you to sign in…");
      setTimeout(() => {
        window.location.href = "/member";
      }, 800);
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pageFrame">
      <div className="pageFrameInner" style={{ maxWidth: 560 }}>
        <div className="card fadeIn">
          <div className="title">Reset Password</div>
          <div className="muted" style={{ marginTop: 6 }}>Enter a new password.</div>

          {checking ? (
            <div className="muted" style={{ marginTop: 14 }}>Verifying your reset link…</div>
          ) : !ready ? (
            <div className="statusMsg statusErr">
              This reset link isn’t active. Open the link from your email on this device, or request a new one.
            </div>
          ) : (
            <>
              <input
                className="input"
                type="password"
                placeholder="New password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
              <button className="btn btnPrimary" onClick={updatePassword} disabled={busy} style={{ width: "100%", marginTop: 12 }}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </>
          )}

          {status ? <div className="statusMsg">{status}</div> : null}
        </div>
      </div>
    </div>
  );
}
