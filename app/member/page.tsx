"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";
import TopNav from "../components/topnav";

// ---------- helpers ----------
function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

// Basic US E.164 normalizer (good enough for now; later you can swap to libphonenumber)
function toE164US(raw: string): string | null {
  const d = digitsOnly(raw);
  if (!d) return null;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (raw.trim().startsWith("+") && d.length >= 10) return "+" + d;
  return null;
}

export default function MemberPage() {
  const router = useRouter();

  // auth
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // signup extras
  const [signupOpen, setSignupOpen] = useState(false);
  const [name, setName] = useState(""); // ✅ NEW
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);

  // prevent overwriting while user edits
  const [nameDirty, setNameDirty] = useState(false);
  const [phoneDirty, setPhoneDirty] = useState(false);
  const [smsDirty, setSmsDirty] = useState(false);

  const [authBusy, setAuthBusy] = useState(false);

  // member data
  const [memberUuid, setMemberUuid] = useState<string | null>(null);
  const [points, setPoints] = useState<number>(0);
  const pointsRef = useRef<number>(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // connection state
  const [connected, setConnected] = useState(false);
  const [connectedTablet, setConnectedTablet] = useState<string | null>(null);
  const [lastSeenMsAgo, setLastSeenMsAgo] = useState<number | null>(null);

  // redeem UI
  const [redeemStatus, setRedeemStatus] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSheetOpen, setRedeemSheetOpen] = useState(false);

  // settings modal + reset password
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const POLL_MS = 2000;
  const qrBuiltFor = useRef<string | null>(null);

  // ----------------------------
  // Load points + QR
  // ----------------------------
  async function loadPointsById(id: string) {
    const { data, error } = await supabase
      .from("members")
      .select("id, points")
      .eq("id", id)
      .single();

    if (error) throw error;

    const p = Number((data as any)?.points ?? 0);
    setPoints(p);
    pointsRef.current = p;

    // Build QR once per member UUID (cashier scans member UUID)
    if (qrBuiltFor.current !== id) {
      const url = await QRCode.toDataURL(id, { margin: 1, width: 280 });
      setQrUrl(url);
      qrBuiltFor.current = id;
    }
  }

  // ----------------------------
  // Load phone/name settings from members
  // ----------------------------
  async function loadMemberSettingsById(id: string) {
    const { data, error } = await supabase
      .from("members")
      .select("name, phone, phone_e164, sms_opt_in")
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!nameDirty) setName(((data as any)?.name ?? "") as string);
    if (!phoneDirty) setPhone((((data as any)?.phone ?? "") as string) || "");
    if (!smsDirty) setSmsOptIn(!!(data as any)?.sms_opt_in);
  }

  // ------------------------------------------
  // Connection: active AND last_seen < 60s
  // ------------------------------------------
  async function refreshConnection(memberId: string) {
    try {
      const { data, error } = await supabase.rpc("get_cashier_link_for_member", {
        p_member_token: memberId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setConnected(false);
        setConnectedTablet(null);
        setLastSeenMsAgo(null);
        return;
      }

      const lastSeen = row?.last_seen ? new Date(row.last_seen).getTime() : 0;
      const msAgo = lastSeen ? Date.now() - lastSeen : null;

      const fresh = msAgo != null && msAgo < 60_000;
      const isConnected = !!row?.active && fresh;

      setConnected(isConnected);
      setConnectedTablet(isConnected ? (row.tablet_id as string) : null);
      setLastSeenMsAgo(msAgo);

      // Open redeem sheet automatically only when connected and points > 0
      if (isConnected && pointsRef.current > 0) setRedeemSheetOpen(true);

      if (!isConnected) {
        setRedeemSheetOpen(false);
        setRedeemStatus("");
        setRedeeming(false);
      }
    } catch {
      setConnected(false);
      setConnectedTablet(null);
      setLastSeenMsAgo(null);
      setRedeemSheetOpen(false);
    }
  }

  // ----------------------------
  // Clear all local state on logout/no-session
  // ----------------------------
  function clearLocalStateForLoggedOut() {
    setAuthUid(null);

    setMemberUuid(null);
    setPoints(0);
    pointsRef.current = 0;

    setQrUrl(null);
    qrBuiltFor.current = null;

    setConnected(false);
    setConnectedTablet(null);
    setLastSeenMsAgo(null);
    setRedeemSheetOpen(false);

    // reset editable fields (but keep email typed if you want; leaving as-is is fine)
    setName("");
    setNameDirty(false);

    setPhone("");
    setSmsOptIn(false);
    setPhoneDirty(false);
    setSmsDirty(false);

    setSettingsOpen(false);
    setResetStatus("");
    setRedeemStatus("");
  }

  // ----------------------------
  // Ensure member exists for auth user (SESSION-DRIVEN)
  // ----------------------------
  async function ensureMemberAndLoadWithSession(session: any | null) {
    const uid = session?.user?.id ?? null;
    setAuthUid(uid);

    if (!uid) {
      clearLocalStateForLoggedOut();
      return;
    }

    // Ensure member row exists and get member token/id
    const { data: memberId, error } = await supabase.rpc("ensure_member_for_auth_user");
    if (error) {
      setRedeemStatus("Account setup error: " + error.message);
      return;
    }

    const id = memberId as string;
    setMemberUuid(id);

    // reset "dirty" so DB values can populate after login
    setNameDirty(false);
    setPhoneDirty(false);
    setSmsDirty(false);

    // Sync name/email from auth metadata into members table (non-blocking)
    try {
      const authName = (session?.user?.user_metadata?.name as string | undefined)?.trim() ?? "";
      const authEmail = (session?.user?.email as string | undefined)?.trim() ?? "";

      const patch: any = { updated_at: new Date().toISOString() };

      if (authName) patch.name = authName;
      if (authEmail) patch.email = authEmail;

      // Only send update if we actually have something to write
      if (patch.name || patch.email) {
        await supabase.from("members").update(patch).eq("id", id);
      }
    } catch {
      // ignore; do not block app
    }

    await loadPointsById(id);
    await loadMemberSettingsById(id);
  }

  // ----------------------------
  // Boot + auth listener (session-first; no stale getSession reliance)
  // ----------------------------
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        await ensureMemberAndLoadWithSession(data.session ?? null);
      } catch (e: any) {
        setRedeemStatus("Init error: " + (e?.message ?? String(e)));
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;
      try {
        await ensureMemberAndLoadWithSession(session);
      } catch (e: any) {
        setRedeemStatus("Auth error: " + (e?.message ?? String(e)));
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ----------------------------
  // Poll: points
  // ----------------------------
  useEffect(() => {
    if (!memberUuid) return;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      try {
        await loadPointsById(memberUuid);
      } catch {}
    };

    tick();
    const t = setInterval(tick, 2500);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [memberUuid]);

  // ----------------------------
  // Poll: connection freshness (NOT dependent on points)
  // ----------------------------
  useEffect(() => {
    if (!memberUuid) return;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      await refreshConnection(memberUuid);
    };

    tick();
    const t = setInterval(tick, POLL_MS);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberUuid]);

  // ----------------------------
  // Auth actions
  // ----------------------------
  async function signIn() {
    setRedeemStatus("");
    setResetStatus("");
    setAuthBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setRedeemStatus(error.message);
        return;
      }

      // ✅ Immediate session-driven load (no "waiting for listener")
      await ensureMemberAndLoadWithSession(data.session ?? null);
    } catch (e: any) {
      setRedeemStatus("Sign in error: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signUp() {
    setRedeemStatus("");
    setResetStatus("");
    setAuthBusy(true);

    try {
      const cleanName = name.trim();
      if (!cleanName) {
        setRedeemStatus("Please enter your name.");
        return;
      }

      const cleanPhone = phone.trim();
      const phoneE164 = cleanPhone ? toE164US(cleanPhone) : null;

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: cleanName, // ✅ NEW
            phone: cleanPhone || null,
            phone_e164: phoneE164,
            sms_opt_in: smsOptIn,
          },
        },
      });

      if (error) {
        setRedeemStatus(error.message);
        return;
      }

      setRedeemStatus("Account created. Now sign in.");
      setSignupOpen(false);
    } catch (e: any) {
      setRedeemStatus("Sign up error: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOutToHome() {
    setRedeemStatus("");
    setResetStatus("");
    setAuthBusy(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setRedeemStatus(error.message);
        return;
      }

      // ✅ Clear UI immediately (no refresh needed)
      await ensureMemberAndLoadWithSession(null);

      // ✅ App-router navigation
      router.replace("/");
      router.refresh();
    } catch (e: any) {
      setRedeemStatus("Sign out error: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveMemberSettings() {
    setRedeemStatus("");
    try {
      if (!memberUuid) throw new Error("Not signed in.");

      // read current opt-in timestamps so we don't wipe them
      const { data: current, error: readErr } = await supabase
        .from("members")
        .select("sms_opt_in_at, sms_opt_in_source")
        .eq("id", memberUuid)
        .single();

      if (readErr) throw readErr;

      const nowIso = new Date().toISOString();
      const cleanName = name.trim() || null;

      const cleanPhone = phone.trim() || null;
      const phoneE164 = cleanPhone ? toE164US(cleanPhone) : null;

      const patch: any = {
        name: cleanName,
        phone: cleanPhone,
        phone_e164: phoneE164,
        sms_opt_in: smsOptIn,
        updated_at: nowIso,
      };

      // Only set opt-in timestamp when turning ON and it's not already set
      if (smsOptIn) {
        patch.sms_opt_in_at = (current as any)?.sms_opt_in_at ?? nowIso;
        patch.sms_opt_in_source = (current as any)?.sms_opt_in_source ?? "member_settings";
      }

      const { error } = await supabase.from("members").update(patch).eq("id", memberUuid);
      if (error) throw error;

      setNameDirty(false);
      setPhoneDirty(false);
      setSmsDirty(false);

      setRedeemStatus("Saved ✅");
      await loadMemberSettingsById(memberUuid);
    } catch (e: any) {
      setRedeemStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  async function sendReset(emailOverride?: string) {
    setResetStatus("");
    setRedeemStatus("");
    setResetBusy(true);
    try {
      const em = (emailOverride ?? email).trim();
      if (!em) throw new Error("Enter your email first.");

      const site = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
      const redirectTo = `${site}/reset`;

      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) throw error;

      setResetStatus("Reset email sent ✅ Check your inbox.");
    } catch (e: any) {
      setResetStatus("Reset error: " + (e?.message ?? String(e)));
    } finally {
      setResetBusy(false);
    }
  }

  // ----------------------------
  // Redeem request
  // ----------------------------
  async function requestRedeem() {
    setRedeemStatus("");
    try {
      if (!memberUuid) throw new Error("Not signed in.");
      if (!connected) throw new Error("Not connected to cashier tablet.");
      if (pointsRef.current <= 0) throw new Error("No points to redeem.");

      setRedeeming(true);

      const { error } = await supabase.rpc("request_redemption_for_active_link", {
        p_member_token: memberUuid,
      });
      if (error) throw error;

      setRedeemStatus("Redeem requested ✅ Cashier will get the coupon popup.");
      setRedeemSheetOpen(true);
    } catch (e: any) {
      setRedeemStatus("Redeem error: " + (e?.message ?? String(e)));
    } finally {
      setRedeeming(false);
    }
  }

  const connText = useMemo(() => {
    if (!connected) return "Not connected";
    return `Connected to ${connectedTablet ?? "cashier"} ✅`;
  }, [connected, connectedTablet]);

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        .wrap { max-width: 560px; margin: 0 auto; }
        .card {
          background: #fff; border-radius: 18px; padding: 18px;
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
        .bigPoints { font-size: 46px; font-weight: 950; color: #0a2a7a; margin-top: 8px; }
        .divider { height: 1px; background: rgba(29,78,216,0.12); margin: 14px 0; }
        .qrBox { display: flex; justify-content: center; margin-top: 14px; }
        .badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 999px;
          background: rgba(29,78,216,0.10); color: #1d4ed8;
          font-weight: 950;
        }
        .xBtn {
          border: 0; background: transparent; color: rgba(10,42,122,0.55);
          font-weight: 950; font-size: 18px; cursor: pointer;
        }

        /* Redeem bottom sheet */
        .sheetWrap {
          position: fixed; left: 0; right: 0; bottom: 0;
          display: flex; justify-content: center;
          padding: 12px 16px;
          pointer-events: none;
        }
        .sheet {
          width: min(560px, calc(100vw - 32px));
          background: #ffffff;
          border-radius: 22px;
          border: 1px solid rgba(29,78,216,0.16);
          box-shadow: 0 18px 50px rgba(10,42,122,0.18);
          padding: 14px;
          transform: translateY(110%);
          transition: transform 220ms ease;
          pointer-events: auto;
        }
        .sheetOpen { transform: translateY(0); }
        .sheetTop {
          display: flex; justify-content: space-between; align-items: center;
          gap: 10px;
        }
        .sheetBtn {
          width: 100%;
          padding: 16px;
          border-radius: 18px;
          border: 0;
          background: #1d4ed8;
          color: #fff;
          font-weight: 950;
          font-size: 18px;
          cursor: pointer;
        }
        .sheetBtn:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Popup overlay */
        .overlay {
          position: fixed; inset: 0;
          background: rgba(10, 18, 40, 0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 18px; z-index: 50;
        }
        .overlayCard {
          width: min(560px, 95vw);
          background: #fff; border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 18px 50px rgba(10,42,122,0.18);
        }
        .checkRow {
          display: flex; gap: 10px; margin-top: 12px; align-items: flex-start;
        }
      `}</style>

      <div className="wrap">
        <TopNav />

        {!authUid ? (
          <div className="card">
            <div className="title">Sign in</div>
            <div className="muted" style={{ marginTop: 6 }}>Use email + password.</div>

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
                disabled={authBusy}
                style={{ flex: 1, opacity: authBusy ? 0.7 : 1 }}
              >
                {authBusy ? "Working..." : "Sign In"}
              </button>

              <button
                type="button"
                className="btn btnSoft"
                onClick={() => setSignupOpen(true)}
                disabled={authBusy}
                style={{ flex: 1, opacity: authBusy ? 0.7 : 1 }}
              >
                Create Account
              </button>
            </div>

            <button
              type="button"
              onClick={() => sendReset()}
              disabled={resetBusy || authBusy || !email.trim()}
              style={{
                marginTop: 10,
                width: "100%",
                border: 0,
                background: "transparent",
                color: "#1d4ed8",
                fontWeight: 950,
                cursor: "pointer",
                opacity: (!email.trim() || resetBusy || authBusy) ? 0.6 : 1,
              }}
            >
              {resetBusy ? "Sending…" : "Reset password"}
            </button>

            {(redeemStatus || resetStatus) ? (
              <div style={{ marginTop: 12 }}>{redeemStatus || resetStatus}</div>
            ) : null}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
              <Link href="/privacy" style={{ color: "#1d4ed8", textDecoration: "none" }}>Privacy Policy</Link>
              <Link href="/contact" style={{ color: "#1d4ed8", textDecoration: "none" }}>Contact Us</Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div className="title">Your Points</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  <span className="badge">{connText}</span>
                  {connected && lastSeenMsAgo != null ? (
                    <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                      (seen {Math.max(0, Math.floor(lastSeenMsAgo / 1000))}s ago)
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  if (memberUuid) loadMemberSettingsById(memberUuid).catch(() => {});
                }}
                aria-label="Settings"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: "1px solid rgba(29,78,216,0.18)",
                  background: "#fff",
                  color: "#1d4ed8",
                  fontWeight: 950,
                  cursor: "pointer",
                  lineHeight: "42px",
                  textAlign: "center",
                  fontSize: 18,
                }}
              >
                ⚙️
              </button>
            </div>

            <div className="bigPoints">{points}</div>

            <div className="divider" />

            {qrUrl ? (
              <div className="qrBox">
                <img src={qrUrl} alt="Member QR" style={{ borderRadius: 18 }} />
              </div>
            ) : (
              <div className="muted">Loading QR…</div>
            )}

            <div className="muted" style={{ marginTop: 14 }}>
              Show this QR to the cashier to connect.
            </div>

            {redeemStatus ? (
              <div style={{ marginTop: 10, fontWeight: 850, color: "#0a2a7a" }}>
                {redeemStatus}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Settings popup */}
      {settingsOpen && authUid && (
        <div className="overlay" onClick={() => setSettingsOpen(false)}>
          <div className="overlayCardScrollable" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="title">Settings</div>
              <button type="button" className="xBtn" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="divider" />

            <div className="title" style={{ fontSize: 18 }}>Profile</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Update your info anytime.
            </div>

            <input
              className="input"
              placeholder="Full Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameDirty(true);
              }}
              autoComplete="name"
            />

            <input
              className="input"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneDirty(true);
              }}
              inputMode="tel"
            />

            <label className="checkRow">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => {
                  setSmsOptIn(e.target.checked);
                  setSmsDirty(true);
                }}
                style={{ marginTop: 4 }}
              />
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
                Optional: I agree to receive SMS messages from Tate’s Supermarket (promotional and informational).
                Message frequency may vary. Message &amp; data rates may apply. Reply <b>STOP</b> to opt out at any time.
                Reply <b>HELP</b> for assistance or visit{" "}
                <a href="https://www.tatessupermarket.com" target="_blank" rel="noreferrer">
                  https://www.tatessupermarket.com
                </a>
                . See <Link href="/privacy">Privacy Policy</Link> for privacy policy and SMS terms. SMS consent is not shared with
                third parties or affiliates.
              </span>
            </label>

            <div className="btnRow">
              <button type="button" className="btn btnPrimary" onClick={saveMemberSettings} style={{ flex: 1 }}>
                Save
              </button>
            </div>

            <div className="divider" />

            <div className="title" style={{ fontSize: 18 }}>Password</div>
            <div className="muted" style={{ marginTop: 6 }}>
              We’ll email you a reset link.
            </div>

            <button
              type="button"
              className="btn btnSoft"
              onClick={() => sendReset(email)}
              disabled={resetBusy}
              style={{ width: "100%", marginTop: 10 }}
            >
              {resetBusy ? "Sending…" : "Send reset email"}
            </button>

            {resetStatus ? (
              <div style={{ marginTop: 10, fontWeight: 850, color: "#0a2a7a" }}>
                {resetStatus}
              </div>
            ) : null}

            <div className="divider" />

            <button
              type="button"
              className="btn btnPrimary"
              onClick={signOutToHome}
              disabled={authBusy}
              style={{ width: "100%" }}
            >
              {authBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}

      {/* Create Account Popup */}
      {signupOpen && (
        <div className="overlay" onClick={() => setSignupOpen(false)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="title">Create Account</div>
              <button type="button" className="xBtn" onClick={() => setSignupOpen(false)}>×</button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              Name is required. Phone + SMS consent are optional.
            </div>

            <input
              className="input"
              placeholder="Full Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameDirty(true);
              }}
              autoComplete="name"
            />

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
            <input
              className="input"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneDirty(true);
              }}
              inputMode="tel"
            />

            <label className="checkRow">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => {
                  setSmsOptIn(e.target.checked);
                  setSmsDirty(true);
                }}
                style={{ marginTop: 4 }}
              />
              <span className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
                Optional: I agree to receive SMS messages from Tate’s Supermarket (promotional and informational).
                Message frequency may vary. Message &amp; data rates may apply. Reply <b>STOP</b> to opt out at any time.
                Reply <b>HELP</b> for assistance or visit{" "}
                <a href="https://www.tatessupermarket.com" target="_blank" rel="noreferrer">
                  https://www.tatessupermarket.com
                </a>
                . See <Link href="/privacy">Privacy Policy</Link> for privacy policy and SMS terms. SMS consent is not shared with
                third parties or affiliates.
              </span>
            </label>

            <div className="btnRow">
              <button
                type="button"
                className="btn btnPrimary"
                onClick={signUp}
                disabled={authBusy}
                style={{ flex: 1, opacity: authBusy ? 0.7 : 1 }}
              >
                {authBusy ? "Working..." : "Create Account"}
              </button>
              <button
                type="button"
                className="btn btnSoft"
                onClick={() => setSignupOpen(false)}
                disabled={authBusy}
                style={{ flex: 1, opacity: authBusy ? 0.7 : 1 }}
              >
                Cancel
              </button>
            </div>

            {redeemStatus && <div style={{ marginTop: 12 }}>{redeemStatus}</div>}
          </div>
        </div>
      )}

      {/* Redeem bottom sheet */}
      {authUid && (
        <div className="sheetWrap">
          <div className={"sheet " + (redeemSheetOpen && connected ? "sheetOpen" : "")}>
            <div className="sheetTop">
              <div>
                <div style={{ fontWeight: 950, color: "#0a2a7a", fontSize: 16 }}>
                  Redeem Points
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  Cashier will see the barcode popup (you won’t).
                </div>
              </div>
              <button className="xBtn" type="button" onClick={() => setRedeemSheetOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="sheetBtn"
                type="button"
                onClick={requestRedeem}
                disabled={!connected || pointsRef.current <= 0 || redeeming}
              >
                {redeeming ? "Requesting…" : `Redeem ${points} Points`}
              </button>

              {redeemStatus ? (
                <div style={{ marginTop: 10, fontWeight: 850, color: "#0a2a7a" }}>
                  {redeemStatus}
                </div>
              ) : null}

              {!connected ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  Connect to a cashier tablet first.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

