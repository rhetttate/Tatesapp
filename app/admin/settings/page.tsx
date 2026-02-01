"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminSettingsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [pointsPerDollar, setPointsPerDollar] = useState<number>(4);
  const [pointValueCents, setPointValueCents] = useState<number>(1);

  const adminPin = useMemo(() => process.env.NEXT_PUBLIC_ADMIN_PIN || "1234", []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus("");
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("points_per_dollar, point_value_cents")
          .eq("id", 1)
          .maybeSingle();

        if (error) throw error;

        if (data?.points_per_dollar != null) setPointsPerDollar(data.points_per_dollar);
        if (data?.point_value_cents != null) setPointValueCents(data.point_value_cents);
      } catch (e: any) {
        setStatus("Error loading settings: " + (e?.message ?? String(e)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function tryUnlock() {
    setPinError("");
    if (pin.trim() === adminPin) {
      setUnlocked(true);
      setPin("");
    } else {
      setPinError("Wrong PIN.");
    }
  }

  async function save() {
    setStatus("");
    setSaving(true);
    try {
      const p = Number(pointsPerDollar);
      const v = Number(pointValueCents);

      if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error("points_per_dollar must be 0-100.");
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("point_value_cents must be 0-100.");
      const { data: sess } = await supabase.auth.getSession();
      console.log("SESSION:", sess.session ? "authenticated" : "anon", sess.session?.user?.email);

      const { error } = await supabase
        .from("app_settings")
        .update({
          points_per_dollar: p,
          point_value_cents: v,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setStatus("Saved. Rate is now " + p + " pts per $1, and 1 pt = $" + (v / 100).toFixed(2));
    } catch (e: any) {
      setStatus("Save failed: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--blue)" }} />
          Admin
          <span className="badge">Settings</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn" href="/">Deals</Link>
          <Link className="btn" href="/cashier/member">Cashier</Link>
        </div>
      </div>

      <div className="center">
        <div className="card" style={{ padding: 18, width: "min(560px, 100%)" }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Points Settings</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Change your loyalty rate anytime. Cashier uses this instantly.
          </div>

          <div className="hr" />

          {loading ? (
            <div className="muted">Loading...</div>
          ) : (
            <>
              {!unlocked ? (
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Enter Admin PIN</div>
                  <input
                    className="input"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    inputMode="numeric"
                    placeholder="PIN"
                  />
                  <div style={{ height: 10 }} />
                  <button className="btn btnPrimary" onClick={tryUnlock} style={{ width: "100%" }}>
                    Unlock
                  </button>
                  {pinError && <p style={{ marginTop: 10 }}>{pinError}</p>}
                  <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    Note: This is a client-side PIN for MVP. For production we will secure updates server-side.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <label>
                    Points per $1 (example: 4 for 4 percent back)
                    <input
                      className="input"
                      value={String(pointsPerDollar)}
                      onChange={(e) => setPointsPerDollar(Number(e.target.value || 0))}
                      inputMode="numeric"
                    />
                  </label>

                  <label>
                    Value per point in cents (example: 1 means 1 point = $0.01)
                    <input
                      className="input"
                      value={String(pointValueCents)}
                      onChange={(e) => setPointValueCents(Number(e.target.value || 0))}
                      inputMode="numeric"
                    />
                  </label>

                <div className="card" style={{ padding: 12, borderRadius: 14 }}>
  <div style={{ fontWeight: 900 }}>Preview</div>

  <div className="muted" style={{ marginTop: 6 }}>
    {"$100 spend → "} {Math.round(100 * pointsPerDollar)} points
  </div>

  <div className="muted" style={{ marginTop: 2 }}>
    That equals $
    {(Math.round(100 * pointsPerDollar) * pointValueCents / 100).toFixed(2)}
    {" "}cashback value
  </div>
</div>


                  <button className="btn btnPrimary" onClick={save} disabled={saving} style={{ width: "100%" }}>
                    {saving ? "Saving..." : "Save Settings"}
                  </button>

                  {status && <p>{status}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
