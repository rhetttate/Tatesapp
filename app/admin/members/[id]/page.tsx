"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";


type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  points: number;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  amount: number;
  points_awarded: number;
  created_at: string;
};

type RedemptionRow = {
  id: string;
  cents_off: number;
  points_redeemed: number;
  created_at: string;
};

function money(n: number) {
  return "$" + Number(n || 0).toFixed(2);
}

export default function AdminMemberDetail() {
  const params = useParams();
  const id = useMemo(() => String((params as any)?.id || ""), [params]);

  const [member, setMember] = useState<MemberRow | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const lifetimeSales = useMemo(
    () => purchases.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [purchases]
  );
  const lifetimePointsEarned = useMemo(
    () => purchases.reduce((sum, p) => sum + Number(p.points_awarded || 0), 0),
    [purchases]
  );
  const lifetimeCentsOff = useMemo(
    () => redemptions.reduce((sum, r) => sum + Number(r.cents_off || 0), 0),
    [redemptions]
  );
  const lifetimePointsRedeemed = useMemo(
    () => redemptions.reduce((sum, r) => sum + Number(r.points_redeemed || 0), 0),
    [redemptions]
  );

  async function load() {
    if (!id) return;

    setLoading(true);
    setStatus("");

    try {
      const { data: m, error: mErr } = await supabase
        .from("members")
        .select("id,name,email,points,created_at")
        .eq("id", id)
        .maybeSingle();

      if (mErr) throw mErr;
      setMember(m as any);

      const { data: p, error: pErr } = await supabase
        .from("purchases")
        .select("id,amount,points_awarded,created_at")
        .eq("member_id", id)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (pErr) throw pErr;
      setPurchases((p as any) || []);

      const { data: r, error: rErr } = await supabase
        .from("redemptions")
        .select("id,cents_off,points_redeemed,created_at")
        .eq("member_id", id)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (rErr) throw rErr;
      setRedemptions((r as any) || []);
    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  if (!id) {
    return (
      <div className="card" style={{ padding: 16, borderRadius: 18 }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>Missing member id</div>
        <div className="muted" style={{ marginTop: 6 }}>Go back to Members and select a member.</div>
        <div className="hr" />
        <Link className="btn" href="/admin/members">Back</Link>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
      <div style={{ gridColumn: "span 12" }}>
        <div className="card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>Member Profile</div>
              <div className="muted" style={{ marginTop: 6 }}>ID: {id}</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Link className="btn" href="/admin/members">Back</Link>
              <button className="btn" onClick={load}>Refresh</button>
            </div>
          </div>

          {status && <p style={{ marginTop: 10 }}>{status}</p>}
          {loading && <div className="muted" style={{ marginTop: 10 }}>Loading…</div>}
        </div>
      </div>

      {/* Member header */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 20 }}>{member?.name || "Unnamed Member"}</div>
              <div className="muted" style={{ marginTop: 6 }}>{member?.email || "No email"}</div>
              <div className="muted" style={{ marginTop: 6 }}>Joined: {member?.created_at ? new Date(member.created_at).toLocaleString() : ""}</div>
            </div>
            <div className="card" style={{ padding: 14, borderRadius: 16, minWidth: 220 }}>
              <div className="muted" style={{ fontSize: 12 }}>Current Points</div>
              <div style={{ fontWeight: 950, fontSize: 34, marginTop: 6 }}>{member?.points ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Lifetime totals */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 6" }} className="card">
            <div style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Lifetime Sales</div>
              <div style={{ fontWeight: 950, fontSize: 22, marginTop: 6 }}>{money(lifetimeSales)}</div>
            </div>
          </div>
          <div style={{ gridColumn: "span 6" }} className="card">
            <div style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Points Earned</div>
              <div style={{ fontWeight: 950, fontSize: 22, marginTop: 6 }}>{lifetimePointsEarned}</div>
            </div>
          </div>
          <div style={{ gridColumn: "span 6" }} className="card">
            <div style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Total Redeemed</div>
              <div style={{ fontWeight: 950, fontSize: 22, marginTop: 6 }}>{money(lifetimeCentsOff / 100)}</div>
            </div>
          </div>
          <div style={{ gridColumn: "span 6" }} className="card">
            <div style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Points Redeemed</div>
              <div style={{ fontWeight: 950, fontSize: 22, marginTop: 6 }}>{lifetimePointsRedeemed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent purchases */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Recent Purchases</div>
          <div className="muted" style={{ marginTop: 6 }}>Showing up to 2000.</div>
          <div className="hr" />
          {purchases.length === 0 ? (
            <div className="muted">No purchases.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {purchases.slice(0, 50).map((p) => (
                <div key={p.id} className="card" style={{ padding: 12, borderRadius: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{money(Number(p.amount))}</div>
                    <div className="muted">{new Date(p.created_at).toLocaleString()}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    Points awarded: {p.points_awarded}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent redemptions */}
      <div style={{ gridColumn: "span 12" }}>
        <div className="card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Recent Redemptions</div>
          <div className="muted" style={{ marginTop: 6 }}>Showing up to 2000.</div>
          <div className="hr" />
          {redemptions.length === 0 ? (
            <div className="muted">No redemptions.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {redemptions.slice(0, 50).map((r) => (
                <div key={r.id} className="card" style={{ padding: 12, borderRadius: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{money(Number(r.cents_off) / 100)}</div>
                    <div className="muted">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    Points redeemed: {r.points_redeemed}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}