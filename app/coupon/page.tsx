"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import TopNav from "../components/topnav";

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function beep(freq = 880, ms = 120) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, ms + 120);
  } catch {}
}
function vibrate(ms = 40) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      // @ts-ignore
      navigator.vibrate(ms);
    }
  } catch {}
}

function BarcodeCanvas({ upc }: { upc: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setErr("");

    (async () => {
      try {
        const mod: any = await import("bwip-js");
        const bwipjs = mod?.default ?? mod;

        const canvas = ref.current;
        if (!canvas) return;

        const text12 = digitsOnly(upc).slice(0, 12);
        if (text12.length !== 12) {
          setErr(`UPC must be 12 digits. Got "${text12}"`);
          return;
        }

        canvas.width = 600;
        canvas.height = 220;

        bwipjs.toCanvas(canvas, {
          bcid: "upca",
          text: text12,
          scale: 3,
          height: 14,
          includetext: true,
        });
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Barcode render failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [upc]);

  const text12 = digitsOnly(upc).slice(0, 12);

  return (
    <div style={{ width: "100%", display: "grid", justifyContent: "center", gap: 8 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <canvas ref={ref} style={{ width: "100%", height: 110, borderRadius: 14, background: "#fff" }} />
      </div>

      <div style={{ textAlign: "center", fontWeight: 900, color: "#0a2a7a" }}>{text12}</div>

      {err ? (
        <div style={{ textAlign: "center", fontWeight: 800, color: "#b91c1c", fontSize: 12 }}>{err}</div>
      ) : null}
    </div>
  );
}

type CouponRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  upc: string;
  redeem_type: "daily" | "once";
  active: boolean;
  sort_order: number;
};

export default function CouponsPage() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [rows, setRows] = useState<CouponRow[]>([]);
  const [status, setStatus] = useState("");

  // member + usage (to grey out already-used coupons)
  const [memberId, setMemberId] = useState<string | null>(null);
  const [everUsed, setEverUsed] = useState<Set<string>>(new Set());
  const [usedToday, setUsedToday] = useState<Set<string>>(new Set());

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemName, setRedeemName] = useState("");
  const [redeemUpc, setRedeemUpc] = useState("");
  const [redeemType, setRedeemType] = useState<"daily" | "once">("daily");

  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setAuthed(!!data.session?.user);
      } catch {
        if (!alive) return;
        setAuthed(false);
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      setAuthed(!!session?.user);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function load() {
    setStatus("");
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("id,name,description,image_url,upc,redeem_type,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .limit(200);

      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
    }
  }

  // Which coupons has THIS member already used?
  // "once" coupons are used forever once redeemed; "daily" coupons are used for
  // the current day only. We grey those out and sink them to the bottom.
  async function loadUsage(mid: string) {
    try {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("coupon_id,redeem_date")
        .eq("member_id", mid)
        .limit(1000);

      if (error) throw error;

      const ever = new Set<string>();
      const today = new Set<string>();
      const ymd = todayYmd();

      ((data as any[]) || []).forEach((r) => {
        const cid = String(r.coupon_id);
        ever.add(cid);
        const rd = r.redeem_date ? String(r.redeem_date).slice(0, 10) : "";
        if (rd === ymd) today.add(cid);
      });

      setEverUsed(ever);
      setUsedToday(today);
    } catch {
      // If usage can't be read (e.g. RLS), just don't grey anything — fail open.
      setEverUsed(new Set());
      setUsedToday(new Set());
    }
  }

  function isUsed(c: CouponRow) {
    return c.redeem_type === "once" ? everUsed.has(c.id) : usedToday.has(c.id);
  }

  useEffect(() => {
    if (!authed) {
      setMemberId(null);
      return;
    }
    load();
    // Resolve this member's id, then load their coupon usage.
    (async () => {
      try {
        const { data, error } = await supabase.rpc("ensure_member_for_auth_user");
        if (error) throw error;
        const mid = data as string;
        setMemberId(mid);
        if (mid) await loadUsage(mid);
      } catch {
        setMemberId(null);
      }
    })();
  }, [authed]);

  async function redeem(c: CouponRow) {
    setStatus("");
    try {
      const { data, error } = await supabase.rpc("redeem_coupon", {
        p_coupon_id: c.id,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const upc = digitsOnly(String(row?.coupon_upc ?? c.upc)).slice(0, 12);

      setRedeemName(String(row?.coupon_name ?? c.name));
      setRedeemUpc(upc);
      setRedeemType((row?.redeem_type ?? c.redeem_type) as any);
      setRedeemOpen(true);

      // Mark used immediately so it greys out, then re-sync from the server.
      setEverUsed((s) => new Set(s).add(c.id));
      if (c.redeem_type === "daily") setUsedToday((s) => new Set(s).add(c.id));
      if (memberId) loadUsage(memberId);

      beep(1200, 120);
      vibrate(50);
    } catch (e: any) {
      beep(220, 160);
      vibrate(120);
      setStatus(e?.message ? `Redeem error: ${e.message}` : `Redeem error: ${String(e)}`);
    }
  }

  const emptyText = useMemo(() => {
    if (status) return status;
    if (!rows.length) return "No coupons available right now.";
    return "";
  }, [rows.length, status]);

  // Available coupons first (in their sort order), used coupons sunk to the bottom.
  const displayRows = useMemo(() => {
    const used = (c: CouponRow) =>
      c.redeem_type === "once" ? everUsed.has(c.id) : usedToday.has(c.id);
    return [...rows].sort((a, b) => {
      const ua = used(a) ? 1 : 0;
      const ub = used(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [rows, everUsed, usedToday]);

  if (booting) {
    return (
      <div className="pageFrame">
        <div className="pageFrameInner">
          <TopNav />
          <div className="wrap stack">
            {[0, 1, 2].map((i) => (
              <div key={i} className="couponRow">
                <div className="couponImg skeleton" />
                <div style={{ minWidth: 0 }}>
                  <div className="skeleton" style={{ height: 16, width: "60%" }} />
                  <div className="skeleton" style={{ height: 12, width: "85%", marginTop: 8 }} />
                </div>
                <div className="skeleton" style={{ width: 96, height: 44, borderRadius: 16 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="pageFrame">
        <div className="pageFrameInner">
          <TopNav />
          <div className="wrap">
            <div className="card fadeIn">
              <div className="title">Coupons</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Please sign in to view and redeem your coupons.
              </div>

              <div className="btnRow">
                <Link href="/member" className="btn btnPrimary" style={{ flex: 1 }}>
                  Sign in
                </Link>
                <Link href="/" className="btn btnSoft" style={{ flex: 1 }}>
                  Back to Deals
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageFrame">
      <div className="pageFrameInner">
        <TopNav />

        <div className="wrap">
        {status ? (
          <div className="statusMsg statusErr" style={{ textAlign: "center" }}>
            {status}
          </div>
        ) : null}

        {emptyText && !status ? (
          <div className="card fadeIn" style={{ textAlign: "center" }}>
            <div className="muted">{emptyText}</div>
          </div>
        ) : null}

        <div className="stack fadeIn">
          {displayRows.map((c) => {
            const used = isUsed(c);
            return (
              <div key={c.id} className={"couponRow" + (used ? " couponUsed" : "")}>
                <div className="couponImg">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image_url}
                      alt={c.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "rgba(29,78,216,0.08)" }} />
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="couponName">{c.name}</div>
                  <div className="couponDesc">{c.description}</div>
                  <div className="couponMeta">
                    {c.redeem_type === "daily" ? "Reusable daily" : "One-time use"}
                  </div>
                </div>

                {used ? (
                  <span className="couponUsedTag">
                    {c.redeem_type === "daily" ? "Used today" : "Used"}
                  </span>
                ) : (
                  <button className="redeemBtn" onClick={() => redeem(c)}>
                    Redeem
                  </button>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {redeemOpen && redeemUpc ? (
        <div className="overlay" onClick={() => setRedeemOpen(false)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div className="title">Redeem Coupon</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {redeemName} • {redeemType === "daily" ? "Reusable daily" : "One-time use"}
            </div>

            <div style={{ marginTop: 14 }}>
              <BarcodeCanvas upc={redeemUpc} />
              <div className="muted" style={{ marginTop: 10, fontWeight: 800, textAlign: "center" }}>
                Have the cashier scan this barcode.
              </div>
            </div>

            <div className="btnRow">
              <button className="btn btnPrimary" style={{ flex: 1 }} onClick={() => setRedeemOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
