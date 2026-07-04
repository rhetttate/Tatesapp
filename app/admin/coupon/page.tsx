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
    <div className="card">
      <div className="pageHead">
        <div>
          <div className="title">Coupons</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Redemption counts shown per coupon (today / week / month).
          </div>
        </div>

        <div className="pageHeadActions">
          <button className="btn" onClick={() => { load(); loadLog(); }}>Refresh</button>
          <button className="btn btnPrimary" onClick={openNew}>+ New Coupon</button>
        </div>
      </div>

      {status ? <div className="statusMsg">{status}</div> : null}

      <div className="divider" />

      {/* Coupons list */}
      <div className="stack">
        {rows.map((c) => (
          <div key={c.id} className="listRow">
            <div className="listRowTop">
              <div className="listRowName">{c.name}</div>
              <span className={"chip " + (c.active ? "chipOk" : "chipOff")}>
                {c.active ? "Active" : "Off"}
              </span>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>{c.description}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span className="chip">Today {c.redeemed_today ?? 0}</span>
              <span className="chip">Week {c.redeemed_week ?? 0}</span>
              <span className="chip">Month {c.redeemed_month ?? 0}</span>
              <span className="chip chipOff">{c.redeem_type === "daily" ? "Reusable daily" : "One-time use"}</span>
            </div>

            <div className="listRowMeta mono">UPC {c.upc} • Sort {c.sort_order}</div>

            <div className="listRowActions">
              <button className="btn btnSoft" onClick={() => openEdit(c)}>Edit</button>
              <button className="btn btnSoft" onClick={() => toggleActive(c)}>{c.active ? "Disable" : "Enable"}</button>
              <button className="btn btnDanger" onClick={() => remove(c)}>Delete</button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <div className="muted">No coupons yet.</div> : null}
      </div>

      <div className="divider" />

      {/* Redemption log */}
      <div className="pageHead">
        <div>
          <div className="subtitle">Recent Coupon Redemptions</div>
          <div className="muted" style={{ marginTop: 6 }}>Latest 150 redemptions.</div>
        </div>
        <button className="btn" onClick={loadLog}>Refresh Log</button>
      </div>

      {logStatus ? <div className="statusMsg">{logStatus}</div> : null}

      <div className="stack" style={{ marginTop: 12 }}>
        {logRows.map((r) => (
          <div key={r.id} className="listRow" style={{ padding: 12 }}>
            <div className="listRowTop">
              <div style={{ fontWeight: 900, color: "var(--ink)" }}>
                {r.coupons?.name ?? "Coupon"}{" "}
                <span className="chip chipOff" style={{ marginLeft: 6 }}>
                  {r.redeem_type === "daily" ? "Daily" : "Once"}
                </span>
              </div>
              <div className="muted" style={{ fontWeight: 800, fontSize: 13 }}>
                {new Date(r.redeemed_at).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </div>

            <div className="listRowMeta mono">
              Member {r.member_id} • UPC {r.upc}
            </div>
          </div>
        ))}
        {logRows.length === 0 ? <div className="muted">No redemptions logged yet.</div> : null}
      </div>

      {/* Modal */}
      {open ? (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="overlayCardScrollable" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div className="title" style={{ fontSize: 20 }}>{editing ? "Edit Coupon" : "New Coupon"}</div>
              <button className="xBtn" onClick={() => setOpen(false)} type="button">×</button>
            </div>

            <div className="divider" />

            <div className="formGrid">
              <div className="span12">
                <label className="fieldLabel">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="span12">
                <label className="fieldLabel">Description</label>
                <textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ resize: "vertical" }} />
              </div>

              <div className="span12">
                <label className="fieldLabel">Photo</label>
                <input
                  className="input"
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
                <div className="fieldHelp">Or paste an image URL below.</div>
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
              </div>

              <div className="span12">
                <label className="fieldLabel">UPC-A</label>
                <input
                  className="input"
                  value={upc}
                  onChange={(e) => setUpc(normalizeUpcA(e.target.value))}
                  placeholder="Enter 11 digits (we'll add check digit)"
                  inputMode="numeric"
                />
                <div className="fieldHelp mono">Stored UPC: {cleanUpc || "—"}</div>
              </div>

              <div className="span6">
                <label className="fieldLabel">Type</label>
                <select className="input" value={redeemType} onChange={(e) => setRedeemType(e.target.value as any)}>
                  <option value="daily">Reusable daily</option>
                  <option value="once">One-time use</option>
                </select>
              </div>

              <div className="span6">
                <label className="fieldLabel">Sort order</label>
                <input className="input" value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value || 0))} inputMode="numeric" />
              </div>

              <div className="span6">
                <label className="fieldLabel">Starts at (optional)</label>
                <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="span6">
                <label className="fieldLabel">Ends at (optional)</label>
                <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>

              <div className="span12">
                <label style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                  <span className="switch">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    <span className="switchTrack" />
                    <span className="switchThumb" />
                  </span>
                  <span style={{ fontWeight: 800, color: "var(--ink)" }}>Active</span>
                </label>
              </div>

              <div className="span12" style={{ display: "flex", gap: 10 }}>
                <button className="btn btnPrimary" style={{ flex: 1 }} onClick={save}>Save</button>
                <button className="btn btnSoft" style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
