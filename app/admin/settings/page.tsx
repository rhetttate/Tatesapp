"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminSettingsPage() {
  const [status, setStatus] = useState("");
  const [pointsPerDollar, setPointsPerDollar] = useState(4);
  const [pointValueCents, setPointValueCents] = useState(1);
  const [kioskEnabled, setKioskEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setStatus("");
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("points_per_dollar, point_value_cents, kiosk_enabled")
      .eq("id", 1)
      .single();

    if (error) setStatus("Load error: " + error.message);
    if (data) {
      setPointsPerDollar(Number(data.points_per_dollar ?? 4));
      setPointValueCents(Number(data.point_value_cents ?? 1));
      setKioskEnabled(!!data.kiosk_enabled);
    }
    setLoading(false);
  }

  async function save() {
    setStatus("");
    try {
      const ppd = Number(pointsPerDollar);
      const pvc = Number(pointValueCents);
      if (!Number.isFinite(ppd) || ppd < 0) throw new Error("Points per dollar must be 0 or more.");
      if (!Number.isFinite(pvc) || pvc < 0) throw new Error("Point value cents must be 0 or more.");

      const { error } = await supabase
        .from("app_settings")
        .upsert({
          id: 1,
          points_per_dollar: ppd,
          point_value_cents: pvc,
          kiosk_enabled: kioskEnabled,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setStatus("Saved.");
      await load();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  useEffect(() => { load(); }, []);

  const previewPoints = Math.round(100 * Number(pointsPerDollar || 0));
  const previewValue = ((previewPoints * Number(pointValueCents || 0)) / 100).toFixed(2);
  const approxPercent = ((Number(pointsPerDollar) * Number(pointValueCents)) / 100 * 100).toFixed(2);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Settings</div>
          <div className="muted" style={{ marginTop: 6 }}>Percent back + cashier kiosk mode.</div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="hr" />

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <>
          <div className="card" style={{ padding: 14, borderRadius: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 950, fontSize: 18 }}>Cashier Kiosk Mode</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              When ON, the checkout tablet stays locked to cashier screens. Exiting requires Admin PIN.
            </div>

            <div className="hr" />

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={kioskEnabled}
                onChange={(e) => setKioskEnabled(e.target.checked)}
                style={{ transform: "scale(1.25)" }}
              />
              Enable Kiosk Mode
            </label>

            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Tablet URL: <b>/cashier</b>
            </div>
          </div>

          <div className="card" style={{ padding: 14, borderRadius: 16 }}>
            <div style={{ fontWeight: 950, fontSize: 18 }}>Percent Back</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              Current approx back: <b>{approxPercent}%</b>
            </div>

            <div className="hr" />

            <label style={{ display: "block", marginBottom: 12 }}>
              Points per $1 (example: 4)
              <input className="input" value={String(pointsPerDollar)} onChange={(e) => setPointsPerDollar(Number(e.target.value))} inputMode="numeric" />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Point value (cents) (example: 1 means $0.01 per point)
              <input className="input" value={String(pointValueCents)} onChange={(e) => setPointValueCents(Number(e.target.value))} inputMode="numeric" />
            </label>

            <button className="btn btnPrimary" onClick={save} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
              Save Settings
            </button>

            {status && <p style={{ marginTop: 10 }}>{status}</p>}

            <div className="hr" />

            <div className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ fontWeight: 950 }}>Preview</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {"$100 spend → "}{previewPoints} points
              </div>
              <div className="muted" style={{ marginTop: 2 }}>
                That equals ${previewValue} cashback value
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}