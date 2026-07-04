"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusOk, setStatusOk] = useState(true);

  // keep raw strings while typing; validate on save
  const [pointsPerDollar, setPointsPerDollar] = useState("4");
  const [pointValueCents, setPointValueCents] = useState("1");
  const [doublePointsEnabled, setDoublePointsEnabled] = useState(false);

  // track edits so we can show "unsaved changes"
  const savedRef = useRef({ p: "4", v: "1", d: false });
  const dirty =
    pointsPerDollar !== savedRef.current.p ||
    pointValueCents !== savedRef.current.v ||
    doublePointsEnabled !== savedRef.current.d;

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

        const p = data?.points_per_dollar != null ? String(data.points_per_dollar) : "4";
        const v = data?.point_value_cents != null ? String(data.point_value_cents) : "1";
        const d = !!data?.double_points_enabled;

        setPointsPerDollar(p);
        setPointValueCents(v);
        setDoublePointsEnabled(d);
        savedRef.current = { p, v, d };
      } catch (e: any) {
        setStatusOk(false);
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
      const p = Number(pointsPerDollar.trim());
      const v = Number(pointValueCents.trim());

      if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error("Points per $1 must be 0–100.");
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("Value per point must be 0–100 cents.");

      const { error } = await supabase
        .from("app_settings")
        .update({
          points_per_dollar: p,
          point_value_cents: v,
          double_points_enabled: doublePointsEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      savedRef.current = { p: pointsPerDollar, v: pointValueCents, d: doublePointsEnabled };
      setStatusOk(true);
      setStatus(
        `Saved ✅ ${p} pts/$1, 1 pt = $${(v / 100).toFixed(2)}` +
          (doublePointsEnabled ? " — double points is ON." : ".")
      );
    } catch (e: any) {
      setStatusOk(false);
      setStatus("Save failed: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  // live preview
  const previewSpend = 100;
  const pNum = Number(pointsPerDollar) || 0;
  const vNum = Number(pointValueCents) || 0;
  const basePts = Math.floor(previewSpend * pNum);
  const previewPts = basePts * (doublePointsEnabled ? 2 : 1);
  const previewCash = (previewPts * vNum) / 100;

  return (
    <div className="card">
      <div className="pageHead">
        <div>
          <div className="title">Points Settings</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Change your loyalty rate anytime. The cashier uses it instantly.
          </div>
        </div>
        {dirty && !loading ? <span className="chip">Unsaved changes</span> : null}
      </div>

      <div className="divider" />

      {loading ? (
        <div className="stack">
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 64 }} />
        </div>
      ) : (
        <div className="stack">
          <div className="formGrid">
            <div className="span6">
              <label className="fieldLabel" htmlFor="ppd">Points per $1</label>
              <input
                id="ppd"
                className="input"
                value={pointsPerDollar}
                onChange={(e) => setPointsPerDollar(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="numeric"
                placeholder="4"
              />
              <div className="fieldHelp">Example: 3 = customers earn 3 points per dollar spent.</div>
            </div>

            <div className="span6">
              <label className="fieldLabel" htmlFor="pvc">Value per point (cents)</label>
              <input
                id="pvc"
                className="input"
                value={pointValueCents}
                onChange={(e) => setPointValueCents(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="numeric"
                placeholder="1"
              />
              <div className="fieldHelp">Example: 1 = each point is worth $0.01 at redemption.</div>
            </div>
          </div>

          <div className="settingRow">
            <div>
              <div className="settingRowTitle">Double Points Day</div>
              <div className="settingRowDesc">When on, the cashier automatically awards 2× points on every purchase.</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={doublePointsEnabled}
                onChange={(e) => setDoublePointsEnabled(e.target.checked)}
                aria-label="Double Points Day"
              />
              <span className="switchTrack" />
              <span className="switchThumb" />
            </label>
          </div>

          <div className="settingRow" style={{ background: "var(--blue-soft2)", borderColor: "var(--border-strong)" }}>
            <div>
              <div className="settingRowTitle">Preview</div>
              <div className="settingRowDesc">
                ${previewSpend} spend → <b>{previewPts} points</b>
                {doublePointsEnabled ? " (double points)" : ""} — worth <b>${previewCash.toFixed(2)}</b> back.
              </div>
            </div>
          </div>

          <button
            className="btn btnPrimary"
            onClick={save}
            disabled={saving || !dirty}
            style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}
          >
            {saving ? "Saving…" : dirty ? "Save Settings" : "Saved"}
          </button>

          {status && <div className={"statusMsg " + (statusOk ? "" : "statusErr")}>{status}</div>}
        </div>
      )}
    </div>
  );
}
