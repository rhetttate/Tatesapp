"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type PurchaseLite = {
  amount: number;
  points_awarded: number;
  created_at: string;
};

type RedemptionLite = {
  cents_off: number;
  points_redeemed: number;
  created_at: string;
};

type SettingsRow = {
  points_per_dollar: number;
  point_value_cents: number;
};

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startEndISO(dateYmd: string) {
  const start = new Date(dateYmd + "T00:00:00");
  const end = new Date(dateYmd + "T23:59:59");
  return { start: start.toISOString(), end: end.toISOString() };
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 14, borderRadius: 16 }}>
      <div className="muted" style={{ fontSize: 12 }}>{title}</div>
      <div style={{ fontWeight: 950, fontSize: 28, marginTop: 6 }}>{value}</div>
      {sub && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function Tile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="card"
      style={{ padding: 14, borderRadius: 16, textDecoration: "none", display: "block" }}
    >
      <div style={{ fontWeight: 950, fontSize: 18 }}>{title}</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{desc}</div>
    </Link>
  );
}

export default function AdminDashboard() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const range = useMemo(() => startEndISO(date), [date]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // settings snapshot
  const [settings, setSettings] = useState<SettingsRow>({ points_per_dollar: 4, point_value_cents: 1 });

  // stats
  const [redeemCount, setRedeemCount] = useState(0);
  const [redeemCents, setRedeemCents] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);

  const [purchaseCount, setPurchaseCount] = useState(0);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [pointsAwarded, setPointsAwarded] = useState(0);

  const [newMembers, setNewMembers] = useState(0);

  const [lastPurchaseAt, setLastPurchaseAt] = useState<string | null>(null);
  const [lastRedeemAt, setLastRedeemAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setStatus("");

    try {
      // Settings (so you always see your current %back config)
      const { data: s } = await supabase
        .from("app_settings")
        .select("points_per_dollar, point_value_cents")
        .eq("id", 1)
        .maybeSingle();
      if (s) setSettings({ points_per_dollar: Number(s.points_per_dollar), point_value_cents: Number(s.point_value_cents) });

      // Redemptions today (limit 5000 rows MVP)
      const { data: r, error: rErr } = await supabase
        .from("redemptions")
        .select("cents_off, points_redeemed, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (rErr) throw rErr;

      const red = (r as any as RedemptionLite[]) || [];
      let rc = 0, rCents = 0, rPts = 0;
      for (const row of red) {
        rc += 1;
        rCents += Number(row.cents_off || 0);
        rPts += Number(row.points_redeemed || 0);
      }
      setRedeemCount(rc);
      setRedeemCents(rCents);
      setRedeemPoints(rPts);
      setLastRedeemAt(red[0]?.created_at ?? null);

      // Purchases today (limit 5000 rows MVP)
      const { data: p, error: pErr } = await supabase
        .from("purchases")
        .select("amount, points_awarded, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (pErr) throw pErr;

      const pur = (p as any as PurchaseLite[]) || [];
      let pc = 0, pTotal = 0, pPts = 0;
      for (const row of pur) {
        pc += 1;
        pTotal += Number(row.amount || 0);
        pPts += Number(row.points_awarded || 0);
      }
      setPurchaseCount(pc);
      setPurchaseTotal(pTotal);
      setPointsAwarded(pPts);
      setLastPurchaseAt(pur[0]?.created_at ?? null);

      // New members today (we only need a count; easiest MVP is select ids and count length)
      const { data: m, error: mErr } = await supabase
        .from("members")
        .select("id, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .limit(5000);

      if (mErr) throw mErr;
      setNewMembers(((m as any[]) || []).length);

    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [range.start, range.end]);

  const redeemedDollars = (redeemCents / 100).toFixed(2);
  const redeemAvg = redeemCount ? (redeemCents / 100 / redeemCount).toFixed(2) : "0.00";

  const salesTotal = purchaseTotal.toFixed(2);
  const avgTicket = purchaseCount ? (purchaseTotal / purchaseCount).toFixed(2) : "0.00";

  const pctBack = (settings.points_per_dollar * settings.point_value_cents).toFixed(2); // cents per $1
  const pctBackAsPercent = (Number(pctBack) / 100 * 100).toFixed(2); // e.g. 4 pts * 1 cent = 4 cents per $1 => 4%

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
      <div style={{ gridColumn: "span 12" }}>
        <div className="card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>Admin HQ</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Daily snapshot (fast on your phone).
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <button className="btn" onClick={load}>Refresh</button>
            </div>
          </div>

          <div className="hr" />

          <div className="muted" style={{ fontSize: 13 }}>
            Earn rate: <b>{settings.points_per_dollar}</b> pts per $1 • Value: <b>{settings.point_value_cents}</b>¢ per point •
            Approx back: <b>{pctBackAsPercent}%</b>
          </div>

          {status && <p style={{ marginTop: 10 }}>{status}</p>}
          {loading && <div className="muted" style={{ marginTop: 10 }}>Loading…</div>}
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 6" }}>
            <Card title="Redemptions" value={String(redeemCount)} sub={lastRedeemAt ? ("Last: " + new Date(lastRedeemAt).toLocaleString()) : "No redemptions yet"} />
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <Card title="Total Redeemed" value={"$" + redeemedDollars} sub={"Avg: $" + redeemAvg} />
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <Card title="Purchases Logged" value={String(purchaseCount)} sub={lastPurchaseAt ? ("Last: " + new Date(lastPurchaseAt).toLocaleString()) : "No purchases yet"} />
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <Card title="Sales Total (logged)" value={"$" + salesTotal} sub={"Avg ticket: $" + avgTicket} />
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <Card title="Points Awarded" value={String(pointsAwarded)} sub={"Estimated value: $" + ((pointsAwarded * settings.point_value_cents) / 100).toFixed(2)} />
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <Card title="New Members" value={String(newMembers)} sub={"Created on " + date} />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <Card title="Points Redeemed" value={String(redeemPoints)} sub={"Value given: $" + redeemedDollars} />
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 12" }}>
            <Tile href="/admin/members" title="Members" desc="Search + full profile + lifetime totals." />
          </div>
          <div style={{ gridColumn: "span 12" }}>
            <Tile href="/admin/redemptions" title="Redemptions" desc="Audit by day + totals." />
          </div>
          <div style={{ gridColumn: "span 12" }}>
            <Tile href="/admin/sales" title="Sales Items" desc="Update cashier swipe list from your phone." />
          </div>
          <div style={{ gridColumn: "span 12" }}>
            <Tile href="/admin/deals" title="Deals" desc="Add/edit deals shown to customers." />
          </div>
          <div style={{ gridColumn: "span 12" }}>
            <Tile href="/admin/settings" title="Percent Back" desc="Change earn rate + point value." />
          </div>
        </div>
      </div>
    </div>
  );
}