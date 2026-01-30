"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
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

  useEffect(() => {
    if (!authed) return;
    load();
    // no refresh button — but you still get a load when you open the page
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

  if (booting) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
        <div className="wrap">
        
          <div className="muted" style={{ marginTop: 10, textAlign: "center" }}>Loading…</div>
        </div>
        <Style />
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
        <div className="wrap">
        
          <div className="card" style={{ marginTop: 12 }}>
            <div className="title">Coupons</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Please sign in to view and redeem coupons.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <Link href="/member" className="btn btnPrimary" style={{ flex: 1, textAlign: "center" }}>
                Sign in
              </Link>
              <Link href="/" className="btn btnSoft" style={{ flex: 1, textAlign: "center" }}>
                Back to Deals
              </Link>
            </div>
          </div>
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <Style />

      <div className="wrap">
        

        {status ? (
          <div style={{ marginTop: 10, fontWeight: 850, color: "#0a2a7a", textAlign: "center" }}>
            {status}
          </div>
        ) : null}

        {emptyText && !status ? (
          <div className="muted" style={{ marginTop: 14, textAlign: "center" }}>
            {emptyText}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {rows.map((c) => (
            <div key={c.id} className="couponRow">
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

              <button className="redeemBtn" onClick={() => redeem(c)}>
                Redeem
              </button>
            </div>
          ))}
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
              <div className="muted" style={{ marginTop: 10, fontWeight: 900, textAlign: "center" }}>
                Have the cashier scan this barcode.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
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

function Style() {
  return (
    <style jsx global>{`
      * { -webkit-tap-highlight-color: transparent; }
      a { color: inherit; }
      .wrap { max-width: 560px; margin: 0 auto; }

      .card {
        background: #fff;
        border-radius: 22px;
        padding: 18px;
        border: 1px solid rgba(29,78,216,0.14);
        box-shadow: 0 8px 24px rgba(10,42,122,0.06);
      }

      .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
      .muted { color: rgba(10,42,122,0.65); font-weight: 800; }

      .btn {
        padding: 12px 14px;
        border-radius: 16px;
        border: 0;
        font-weight: 950;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }
      .btnPrimary { background: #1d4ed8; color: #fff; }
      .btnSoft { background: #e8efff; color: #1d4ed8; }

      .couponRow {
        display: grid;
        grid-template-columns: 78px 1fr 110px;
        gap: 12px;
        align-items: center;
        background: #fff;
        border-radius: 18px;
        padding: 10px 10px;
        border: 1px solid rgba(29,78,216,0.14);
        box-shadow: 0 8px 24px rgba(10,42,122,0.05);
      }

      .couponImg {
        width: 78px;
        height: 58px;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(29,78,216,0.14);
        background: #fff;
      }

      .couponName {
        font-weight: 950;
        color: #0a2a7a;
        font-size: 16px;
        line-height: 1.1;
      }

      .couponDesc {
        margin-top: 4px;
        color: rgba(10,42,122,0.65);
        font-weight: 800;
        font-size: 12px;
        line-height: 1.25;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .couponMeta {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 900;
        color: rgba(10,42,122,0.55);
      }

      .redeemBtn {
        width: 110px;
        padding: 12px 10px;
        border-radius: 16px;
        border: 0;
        background: #1d4ed8;
        color: #fff;
        font-weight: 950;
        cursor: pointer;
      }

      .overlay {
        position: fixed; inset: 0;
        background: rgba(10, 18, 40, 0.45);
        display: flex; align-items: center; justify-content: center;
        padding: 18px; z-index: 50;
      }
      .overlayCard {
        width: min(560px, 95vw);
        background: #fff; border-radius: 22px;
        padding: 18px;
        border: 1px solid rgba(29,78,216,0.14);
        box-shadow: 0 18px 50px rgba(10,42,122,0.18);
      }
    `}</style>
  );
}
