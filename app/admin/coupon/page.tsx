"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type CouponRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  upc: string;
  redeem_type: "daily" | "once";
  active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  redeem_taps: number;

  // ✅ new fields (from RPC)
  redeemed_today?: number;
  redeemed_week?: number;
  redeemed_month?: number;
};

type RedemptionRow = {
  id: string;
  coupon_id: string;
  member_id: string;
  redeemed_at: string;
  redeem_date: string;
  upc: string;
  redeem_type: "daily" | "once";
  source: string;
  coupons?: { name: string } | null;
};

type CouponStatsRow = {
  coupon_id: string;
  redeemed_today: number;
  redeemed_week: number;
  redeemed_month: number;
};

async function uploadCouponImage(file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `coupons/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("coupon-images")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("coupon-images").getPublicUrl(path);
  return data.publicUrl;
}

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

function upcaCheckDigit(upc11: string) {
  const d = digitsOnly(upc11).slice(0, 11);
  if (d.length !== 11) return null;

  let sumOdd = 0;
  let sumEven = 0;

  for (let i = 0; i < 11; i++) {
    const n = parseInt(d[i], 10);
    const pos = i + 1;
    if (pos % 2 === 1) sumOdd += n;
    else sumEven += n;
  }

  const total = sumOdd * 3 + sumEven;
  const mod = total % 10;
  const check = (10 - mod) % 10;
  return String(check);
}

function normalizeUpcA(input: string) {
  const d = digitsOnly(input);

  if (d.length === 11) {
    const cd = upcaCheckDigit(d);
    if (cd == null) return d;
    return d + cd;
  }

  if (d.length >= 12) return d.slice(0, 12);

  return d;
}

export default function AdminCouponsPage() {
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [status, setStatus] = useState("");

  const [logRows, setLogRows] = useState<RedemptionRow[]>([]);
  const [logStatus, setLogStatus] = useState("");

  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [open, setOpen] = useState(false);

  // form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [upc, setUpc] = useState("");
  const [redeemType, setRedeemType] = useState<"daily" | "once">("daily");
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(100);

  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");

  const cleanUpc = useMemo(() => digitsOnly(upc).slice(0, 12), [upc]);

  function resetForm() {
    setName("");
    setDesc("");
    setImageUrl("");
    setUpc("");
    setRedeemType("daily");
    setActive(true);
    setSortOrder(100);
    setStartsAt("");
    setEndsAt("");
  }

  function openNew() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(c: CouponRow) {
    setEditing(c);
    setName(c.name);
    setDesc(c.description ?? "");
    setImageUrl(c.image_url ?? "");
    setUpc(c.upc ?? "");
    setRedeemType(c.redeem_type);
    setActive(!!c.active);
    setSortOrder(Number(c.sort_order ?? 100));
    setStartsAt(c.starts_at ? c.starts_at.slice(0, 16) : "");
    setEndsAt(c.ends_at ? c.ends_at.slice(0, 16) : "");
    setOpen(true);
  }

  async function load() {
    setStatus("");
    try {
      // 1) coupons
      const { data: couponData, error: couponErr } = await supabase
        .from("coupons")
        .select(
          "id,name,description,image_url,upc,redeem_type,active,sort_order,starts_at,ends_at,created_at,redeem_taps"
        )
        .order("redeem_taps", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(300);

      if (couponErr) throw couponErr;

      // 2) stats (day/week/month counts per coupon)
      const { data: statsData, error: statsErr } = await supabase.rpc("coupon_redemption_stats");
      if (statsErr) throw new Error("Stats error: " + statsErr.message);

      const statsMap = new Map<string, CouponStatsRow>();
      ((statsData as any) || []).forEach((s: CouponStatsRow) => {
        statsMap.set(s.coupon_id, {
          coupon_id: s.coupon_id,
          redeemed_today: Number(s.redeemed_today || 0),
          redeemed_week: Number(s.redeemed_week || 0),
          redeemed_month: Number(s.redeemed_month || 0),
        });
      });

      const merged: CouponRow[] = ((couponData as any) || []).map((c: CouponRow) => {
        const s = statsMap.get(c.id);
        return {
          ...c,
          redeemed_today: s?.redeemed_today ?? 0,
          redeemed_week: s?.redeemed_week ?? 0,
          redeemed_month: s?.redeemed_month ?? 0,
        };
      });

      setRows(merged);
    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
    }
  }

  async function loadLog() {
    setLogStatus("");
    try {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("id,coupon_id,member_id,redeemed_at,redeem_date,upc,redeem_type,source,coupons(name)")
        .order("redeemed_at", { ascending: false })
        .limit(150);

      if (error) throw error;
      setLogRows((data as any) || []);
    } catch (e: any) {
      setLogStatus("Log error: " + (e?.message ?? String(e)));
    }
  }

  useEffect(() => {
    load();
    loadLog();
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  async function save() {
    setStatus("");
    try {
      const u = digitsOnly(upc).slice(0, 12);
      if (u.length !== 12) throw new Error("UPC must be 11 digit (auto check digit) or 12 digits total.");
      if (!name.trim()) throw new Error("Name required.");

      const payload: any = {
        name: name.trim(),
        description: desc.trim(),
        image_url: imageUrl.trim() || null,
        upc: u,
        redeem_type: redeemType,
        active,
        sort_order: Number(sortOrder || 100),
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      setEditing(null);
      resetForm();

      await load();
      setStatus("Saved ✅");
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  async function toggleActive(c: CouponRow) {
    setStatus("");
    try {
      const { error } = await supabase
        .from("coupons")
        .update({ active: !c.active, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setStatus("Update error: " + (e?.message ?? String(e)));
    }
  }

  async function remove(c: CouponRow) {
    setStatus("");
    try {
      const ok = confirm(`Delete coupon "${c.name}"? This cannot be undone.`);
      if (!ok) return;
      const { error } = await supabase.from("coupons").delete().eq("id", c.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setStatus("Delete error: " + (e?.message ?? String(e)));
    }
  }

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Coupons</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Shows redeems per coupon (Today / This Week / This Month).
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => { load(); loadLog(); }}>Refresh</button>
          <button className="btn btnPrimary" onClick={openNew}>New Coupon</button>
        </div>
      </div>

      {status ? <div style={{ marginTop: 10, fontWeight: 900 }}>{status}</div> : null}

      <div className="hr" />

      {/* Coupons list */}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((c) => (
          <div key={c.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>{c.name}</div>
              <div style={{ fontWeight: 950, color: c.active ? "#15803d" : "#b91c1c" }}>
                {c.active ? "ACTIVE" : "OFF"}
              </div>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>{c.description}</div>

            {/* ✅ NEW: Redemption counts */}
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Redeemed:{" "}
              <b>Today {c.redeemed_today ?? 0}</b> •{" "}
              <b>Week {c.redeemed_week ?? 0}</b> •{" "}
              <b>Month {c.redeemed_month ?? 0}</b>
            </div>

            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Type: <b>{c.redeem_type === "daily" ? "Reusable daily" : "One-time use"}</b> • Sort: <b>{c.sort_order}</b>
            </div>

            <div className="muted" style={{ marginTop: 6, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              UPC: {c.upc}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn btnSoft" onClick={() => openEdit(c)}>Edit</button>
              <button className="btn btnSoft" onClick={() => toggleActive(c)}>{c.active ? "Disable" : "Enable"}</button>
              <button className="btn" onClick={() => remove(c)} style={{ color: "#b91c1c", fontWeight: 950 }}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <div className="muted">No coupons yet.</div> : null}
      </div>

      <div className="hr" />

      {/* Redemption log */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Recent Coupon Redemptions</div>
          <div className="muted" style={{ marginTop: 6 }}>Latest 150 redemptions.</div>
        </div>
        <button className="btn" onClick={loadLog}>Refresh Log</button>
      </div>

      {logStatus ? <div style={{ marginTop: 10, fontWeight: 900 }}>{logStatus}</div> : null}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {logRows.map((r) => (
          <div key={r.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 950 }}>
                {r.coupons?.name ?? "Coupon"} • {r.redeem_type === "daily" ? "Daily" : "Once"}
              </div>
              <div className="muted" style={{ fontWeight: 900 }}>
                {new Date(r.redeemed_at).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </div>

            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Member: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.member_id}</span>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              UPC: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.upc}</span>
            </div>
          </div>
        ))}
        {logRows.length === 0 ? <div className="muted">No redemptions logged yet.</div> : null}
      </div>

      {/* Modal */}
      {open ? (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>{editing ? "Edit Coupon" : "New Coupon"}</div>
              <button className="xBtn" onClick={() => setOpen(false)} type="button">×</button>
            </div>

            <div className="hr" />

            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />

            <label className="label" style={{ marginTop: 10 }}>Description</label>
            <textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />

            <label className="label" style={{ marginTop: 10 }}>Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setStatus("Uploading image...");
                  const url = await uploadCouponImage(file);
                  setImageUrl(url);
                  setStatus("Image uploaded ✅");
                } catch (err: any) {
                  setStatus("Upload error: " + (err?.message ?? String(err)));
                } finally {
                  e.currentTarget.value = "";
                }
              }}
            />

            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Or paste an image URL:
            </div>

            <input
              className="input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />

            {imageUrl ? (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="preview" style={{ width: "100%", borderRadius: 14 }} />
              </div>
            ) : null}

            <label className="label" style={{ marginTop: 10 }}>UPC-A</label>
            <input
              className="input"
              value={upc}
              onChange={(e) => setUpc(normalizeUpcA(e.target.value))}
              placeholder="Enter 11 digits (we'll add check digit)"
              inputMode="numeric"
            />

            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Stored UPC (12 digits):{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                {digitsOnly(upc).slice(0, 12)}
              </span>
            </div>

            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Clean: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{cleanUpc}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label className="label">Type</label>
                <select className="input" value={redeemType} onChange={(e) => setRedeemType(e.target.value as any)}>
                  <option value="daily">Reusable daily</option>
                  <option value="once">One-time use</option>
                </select>
              </div>

              <div>
                <label className="label">Sort Order</label>
                <input className="input" value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value || 0))} inputMode="numeric" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label className="label">Starts At (optional)</label>
                <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <label className="label">Ends At (optional)</label>
                <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, fontWeight: 900 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn btnPrimary" style={{ flex: 1 }} onClick={save}>Save</button>
              <button className="btn btnSoft" style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .hr { height: 1px; background: rgba(29,78,216,0.12); margin: 14px 0; }
        .label { font-size: 12px; font-weight: 950; color: rgba(10,42,122,0.65); display: block; }
        .input {
          width: 100%; padding: 12px; border-radius: 14px;
          border: 1px solid #c7d2fe; margin-top: 6px; font-weight: 850;
          outline: none; box-sizing: border-box;
        }
        textarea.input { resize: vertical; }
        .btn {
          padding: 12px 14px; border-radius: 16px; border: 0;
          font-weight: 950; cursor: pointer;
          background: #e8efff; color: #1d4ed8;
        }
        .btnPrimary { background: #1d4ed8; color: #fff; }
        .btnSoft { background: #e8efff; color: #1d4ed8; }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(10, 18, 40, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 50;
          overscroll-behavior: contain;
          touch-action: none;
        }
        .overlayCard {
          width: min(640px, 95vw);
          background: #fff;
          border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 18px 50px rgba(10,42,122,0.18);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .xBtn {
          border: 0; background: transparent; color: rgba(10,42,122,0.55);
          font-weight: 950; font-size: 18px; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
