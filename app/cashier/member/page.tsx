"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function MemberPage() {
  const [memberId, setMemberId] = useState(""); // UUID
  const [points, setPoints] = useState<number>(0);
  const [status, setStatus] = useState("");
  const [linked, setLinked] = useState(false);
  const [linkedTablet, setLinkedTablet] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  // Remember the last member id on this device.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("member_id") : "";
    if (saved) setMemberId(saved);
  }, []);

  useEffect(() => {
    if (memberId) localStorage.setItem("member_id", memberId);
  }, [memberId]);

  async function loadPoints() {
    if (!memberId.trim()) return;
    const { data, error } = await supabase.from("members").select("points").eq("id", memberId.trim()).maybeSingle();
    if (!error && data) setPoints(Number((data as any).points ?? 0));
  }

  // Poll link status (so button appears when cashier connects)
  useEffect(() => {
    if (!memberId.trim()) return;

    const t = setInterval(async () => {
      const { data, error } = await supabase.rpc("get_active_link_for_member", {
        p_member_token: memberId.trim(),
      });
      if (error) return;

      const isLinked = !!data?.linked;
      setLinked(isLinked);
      setLinkedTablet(isLinked ? String(data.tablet_id || "") : "");
      setExpiresAt(isLinked ? String(data.expires_at || "") : "");

      // keep points updated occasionally
      loadPoints();
    }, 1200);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function requestRedeem() {
    setStatus("");
    try {
      if (!memberId.trim()) throw new Error("Missing member id.");
      const { data, error } = await supabase.rpc("request_redemption_for_active_link", {
        p_member_token: memberId.trim(),
      });
      if (error) throw error;

      setStatus("Redeem request sent to cashier ✅");
    } catch (e: any) {
      setStatus("Redeem error: " + (e?.message ?? String(e)));
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--blue)" }} />
          Member <span className="badge">Account</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn" href="/">Home</Link>
        </div>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 18, textAlign: "center" }}>
        <div style={{ fontWeight: 950, fontSize: 22 }}>Your Points</div>
        <div style={{ fontSize: 44, fontWeight: 950, marginTop: 10 }}>{points}</div>

        <div className="hr" />

        <div style={{ textAlign: "left" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Member ID (UUID)</div>
          <input
            className="input bigInput"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="Paste your member id"
          />
          <div className="muted" style={{ marginTop: 8 }}>
            Paste the member’s ID to look up their points and connection status.
          </div>
        </div>

        <div className="hr" />

        {linked ? (
          <div className="card" style={{ padding: 14, borderRadius: 16 }}>
            <div style={{ fontWeight: 950, fontSize: 18 }}>Connected to Cashier ✅</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Register: <b>{linkedTablet}</b>
              {expiresAt ? <> • Expires {new Date(expiresAt).toLocaleTimeString()}</> : null}
            </div>

            <button className="btn bigBtn btnPrimary" onClick={requestRedeem} style={{ width: "100%", marginTop: 12 }}>
              Redeem Points
            </button>

            <div className="muted" style={{ marginTop: 10 }}>
              The coupon barcode will appear on the cashier tablet (not on your phone).
            </div>
          </div>
        ) : (
          <div className="muted">
            Not connected to a cashier tablet. Ask the cashier to scan your member QR.
          </div>
        )}

        {status && <div style={{ marginTop: 12 }}>{status}</div>}
      </div>
    </div>
  );
}
