"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type RedemptionRow = {
  id: string;
  member_id: string;
  points_redeemed: number;
  cents_off: number;
  coupon_upc: string | null;
  tablet_id: string | null;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
};


function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminRedemptionsPage() {
  const [date, setDate] = useState<string>(() => ymd(new Date()));
  const [rows, setRows] = useState<RedemptionRow[]>([]);
  const [status, setStatus] = useState("");

  const range = useMemo(() => {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");
    return { start: start.toISOString(), end: end.toISOString() };
  }, [date]);

  async function load() {
  setStatus("");
  try {
    const { data, error } = await supabase
      .from("redemption_requests")
      .select("id,member_id,points_redeemed,cents_off,coupon_upc,tablet_id,status,created_at,fulfilled_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end)
      .eq("status", "fulfilled")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    setRows((data as any) || []);
  } catch (e: any) {
    setStatus("Load error: " + (e?.message ?? String(e)));
  }
}


  useEffect(() => { load(); }, [range.start, range.end]);

  const totalCents = rows.reduce((s, r) => s + Number(r.cents_off || 0), 0);
  const totalDollars = (totalCents / 100).toFixed(2);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Redemptions</div>
          <div className="muted" style={{ marginTop: 6 }}>Daily totals + history.</div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="hr" />

      <label style={{ display: "block" }}>
        Date
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <div className="hr" />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Count</div>
          <div style={{ fontWeight: 950, fontSize: 34 }}>{rows.length}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 12 }}>Total Redeemed</div>
          <div style={{ fontWeight: 950, fontSize: 34 }}>${totalDollars}</div>
        </div>
      </div>

      <div className="hr" />

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>${(Number(r.cents_off) / 100).toFixed(2)} off</div>
              <div style={{ fontWeight: 900 }}>{r.points_redeemed} pts</div>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              {new Date(r.created_at).toLocaleString()}
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {r.member_id}
            </div>
          </div>
        ))}
        {rows.length === 0 && !status && <div className="muted">No redemptions for this date.</div>}
      </div>
    </div>
  );
}