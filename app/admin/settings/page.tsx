"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [pointsPerDollar, setPointsPerDollar] = useState<number>(4);
  const [pointValueCents, setPointValueCents] = useState<number>(1);
  const [doublePointsEnabled, setDoublePointsEnabled] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus("");
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("points_per_dollar, point_value_cents, double_points_enabled")
          .eq("id", 1)
          .maybeSingle();

        if (error) throw error;

        if (data?.points_per_dollar != null) setPointsPerDollar(data.points_per_dollar);
        if (data?.point_value_cents != null) setPointValueCents(data.point_value_cents);

        // ✅ new
        setDoublePointsEnabled(!!data?.double_points_enabled);
      } catch (e: any) {
        setStatus("Error loading settings: " + (e?.message ?? String(e)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setStatus("");
    setSaving(true);
    try {
      const p = Number(pointsPerDollar);
      const v = Number(pointValueCents);

      if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error("points_per_dollar must be 0-100.");
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("point_value_cents must be 0-100.");

      const { error } = await supabase
        .from("app_settings")
        .update({
          points_per_dollar: p,
          point_value_cents: v,
          double_points_enabled: !!doublePointsEnabled, // ✅ new
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setStatus(
        `Saved ✅ Rate: ${p} pts/$1, 1 pt = $${(v / 100).toFixed(2)}. ` +
          (doublePointsEnabled ? "DOUBLE POINTS is ON." : "Double points is OFF.")
      );
    } catch (e: any) {
      setStatus("Save failed: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  const previewSpend = 100;
  const basePts = Math.floor(previewSpend * pointsPerDollar);
  const multiplier = doublePointsEnabled ? 2 : 1;
  const previewPts = basePts * multiplier;
  const previewCash = (previewPts * pointValueCents) / 100;

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
              {(
                <div style={{ display: "grid", gap: 12 }}>
                  <label>
                    Points per $1 (example: 3 means 3 points per dollar)
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

                  {/* ✅ Double points toggle */}
                  <label
                    className="card"
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>Double Points Day</div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                        When ON, cashier awards 2× points automatically.
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={doublePointsEnabled}
                      onChange={(e) => setDoublePointsEnabled(e.target.checked)}
                      style={{ width: 22, height: 22 }}
                    />
                  </label>

                  <div className="card" style={{ padding: 12, borderRadius: 14 }}>
                    <div style={{ fontWeight: 900 }}>Preview</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      ${previewSpend} spend → {previewPts} points {doublePointsEnabled ? "(double points)" : ""}
                    </div>
                    <div className="muted" style={{ marginTop: 2 }}>
                      That equals ${previewCash.toFixed(2)} cashback value
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
