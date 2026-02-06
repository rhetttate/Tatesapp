"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

/* ---------- helpers ---------- */
function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}
function centsTextToNumber(raw: string) {
  const d = digitsOnly(raw);
  if (!d) return 0;
  return parseInt(d, 10) / 100;
}
function formatMoneyFromRaw(raw: string) {
  return "$" + centsTextToNumber(raw).toFixed(2);
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

/* ---------- types ---------- */
type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
  active: boolean;
  sort_order: number;
};

function getRegFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const r = (p.get("reg") || "").toUpperCase().trim();
  if (/^REG[1-9]$/.test(r)) return r;
  return null;
}

/* ---------- barcode ---------- */
function BarcodeCanvas({ upc, tall }: { upc: string; tall?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("bwip-js");
        const bwipjs = mod?.default ?? mod;
        if (cancelled) return;

        const canvas = ref.current;
        if (!canvas) return;

        bwipjs.toCanvas(canvas, {
          bcid: "upca",
          text: digitsOnly(upc).slice(0, 12),
          scale: tall ? 4 : 3,
          height: tall ? 16 : 10,
          includetext: false,
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [upc, tall]);

  return (
    <div style={{ width: "100%" }}>
      <canvas
        ref={ref}
        style={{
          width: "100%",
          height: tall ? 120 : 90,
          borderRadius: 14,
          background: "#fff",
        }}
      />
    </div>
  );
}

export default function CashierPage() {
  /* ✅ tab typing that NEVER breaks */
  const TAB_MEMBER = 0 as const;
  const TAB_SALE = 1 as const;
  type Tab = typeof TAB_MEMBER | typeof TAB_SALE;

  const [tab, setTab] = useState<Tab>(TAB_MEMBER);

  const [tabletId, setTabletId] = useState("REG1");
  useEffect(() => {
    const fromQuery = getRegFromQuery();
    const saved = localStorage.getItem("sunstop_tablet_id");

    if (fromQuery) {
      setTabletId(fromQuery);
      localStorage.setItem("sunstop_tablet_id", fromQuery);
      return;
    }
    if (saved) setTabletId(saved);
  }, []);

  const [memberId, setMemberId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [status, setStatus] = useState("");
  const [scanStatus, setScanStatus] = useState("");

  // keypad popup
  const [padOpen, setPadOpen] = useState(false);

  // QR scanner overlay
  const [scanning, setScanning] = useState(false);
  const qrRef = useRef<any>(null);
  const readerDivId = "qr-reader";

  // Sale items
  const [sale, setSale] = useState<SaleItem[]>([]);
  const [saleStatus, setSaleStatus] = useState("");
  const [saleLoading, setSaleLoading] = useState(true);

  // swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // redeem popup
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemUpc, setRedeemUpc] = useState<string | null>(null);
  const [redeemCents, setRedeemCents] = useState<number>(0);
  const [redeemMsg, setRedeemMsg] = useState<string>("");

  const saleMode = tab === TAB_SALE;

  /* ---------- LOCKED SCREEN ---------- */
  useEffect(() => {
    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevTouch = (document.body.style as any).touchAction;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    (document.body.style as any).touchAction = "none";

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    const onGesture = (e: any) => {
      e.preventDefault?.();
      return false;
    };

    window.addEventListener("wheel", onWheel, { passive: false } as any);
    window.addEventListener("gesturestart", onGesture as any, { passive: false } as any);
    window.addEventListener("gesturechange", onGesture as any, { passive: false } as any);
    window.addEventListener("gestureend", onGesture as any, { passive: false } as any);

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
      (document.body.style as any).touchAction = prevTouch;

      window.removeEventListener("wheel", onWheel as any);
      window.removeEventListener("gesturestart", onGesture as any);
      window.removeEventListener("gesturechange", onGesture as any);
      window.removeEventListener("gestureend", onGesture as any);
    };
  }, []);

  /* ---------- swipe ---------- */
  function onTouchStart(e: React.TouchEvent) {
    if (scanning || padOpen || redeemOpen) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (scanning || padOpen || redeemOpen) return;

    const sx = touchStartX.current;
    const sy = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (sx == null || sy == null) return;

    const ex = e.changedTouches[0]?.clientX ?? sx;
    const ey = e.changedTouches[0]?.clientY ?? sy;

    const dx = ex - sx;
    const dy = ey - sy;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) setTab(TAB_SALE);
      if (dx > 0) setTab(TAB_MEMBER);
    }
  }

  /* ---------- scanner ---------- */
  async function stopScanner() {
    try {
      const qr = qrRef.current;
      if (qr) {
        await qr.stop();
        await qr.clear();
      }
    } catch {}
    qrRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    setScanStatus("");
    setStatus("");
    setScanning(true);

    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = (mod as any).Html5Qrcode;

      const qr = new Html5Qrcode(readerDivId);
      qrRef.current = qr;

      await qr.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 260, height: 260 } },
        async (decodedText: string) => {
          const token = decodedText.trim();
          setMemberId(token);

          beep(980, 110);
          vibrate(30);

          setScanStatus("Scanned ✅");

          const { error } = await supabase.rpc("open_cashier_link", {
            p_tablet_id: tabletId,
            p_member_token: token,
          });

          if (error) setStatus("Link error: " + error.message);
          else setStatus("Connected.");

          stopScanner();
        }
      );
    } catch (e: any) {
      setScanStatus("Scanner error: " + (e?.message ?? String(e)));
      setScanning(false);
    }
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- heartbeat ---------- */
  useEffect(() => {
    if (!memberId.trim()) return;
    const t = setInterval(async () => {
      try {
        await supabase.rpc("heartbeat_cashier_link", { p_tablet_id: tabletId });
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [tabletId, memberId]);

  /* ---------- auto disconnect ---------- */
  useEffect(() => {
    if (!memberId.trim()) return;

    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 60_000) {
        setMemberId("");
        setScanStatus("");
        setStatus("Disconnected (timeout).");
        setAmountRaw("");
        setPadOpen(false);
      }
    }, 1000);

    return () => clearInterval(t);
  }, [memberId]);

  async function disconnect() {
    setScanStatus("");
    setStatus("Disconnected.");
    setMemberId("");
    setAmountRaw("");
    setPadOpen(false);
    try {
      await supabase.rpc("disconnect_cashier_link", { p_tablet_id: tabletId });
    } catch {}
  }

  /* ---------- purchases ---------- */
  async function recordPurchase() {
    setStatus("");
    try {
      if (!memberId.trim()) throw new Error("Scan member QR first.");
      const amount = centsTextToNumber(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter amount (ex: 1298 for $12.98).");
      }

      const { data, error } = await supabase.rpc("award_purchase", {
        p_member_token: memberId.trim(),
        p_amount: Number(amount.toFixed(2)),
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const pts = Number(row?.points_awarded ?? 0);
      const newPts = Number(row?.new_points ?? 0);

      beep(1120, 120);
      vibrate(45);

      setStatus(`Saved ✅ Awarded ${pts} points. New total: ${newPts}`);
      setAmountRaw("");
      setPadOpen(false);
    } catch (e: any) {
      beep(220, 160);
      vibrate(120);
      setStatus("Error: " + (e?.message ?? String(e)));
    }
  }

  /* ---------- sale items ---------- */
  async function loadSale() {
    setSaleLoading(true);
    setSaleStatus("");
    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id,name,upc,price,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .limit(8); // ✅ always 8 max
      if (error) throw error;
      setSale((data as any) || []);
    } catch (e: any) {
      setSaleStatus("Sale load error: " + (e?.message ?? String(e)));
    } finally {
      setSaleLoading(false);
    }
  }

  useEffect(() => {
    loadSale();
    const t = setInterval(loadSale, 10_000);
    return () => clearInterval(t);
  }, []);

  /* ---------- redeem poll ---------- */
  useEffect(() => {
    if (!tabletId) return;

    const t = setInterval(async () => {
      try {
        const { data, error } = await supabase.rpc("fulfill_latest_redemption_for_tablet", {
          p_tablet_id: tabletId,
        });

        if (error) return;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;

        const upc = String(row.coupon_upc || "");
        if (!upc) return;

        beep(1200, 140);
        vibrate(70);

        setRedeemUpc(upc);
        const cents = Number(row.cents_off ?? 0);
        setRedeemCents(cents);
        setRedeemMsg(`Coupon ready ✅ $${(cents / 100).toFixed(2)} OFF`);
        setRedeemOpen(true);

        setTimeout(() => {
          setRedeemOpen(false);
          setRedeemUpc(null);
          setRedeemCents(0);
          setRedeemMsg("");
        }, 60_000);
      } catch {}
    }, 1000);

    return () => clearInterval(t);
  }, [tabletId]);

  /* ---------- keypad ---------- */
  function keyPress(k: string) {
    if (k === "done") {
      setPadOpen(false);
      return;
    }
    if (k === "back") {
      setAmountRaw((x) => x.slice(0, -1));
      return;
    }
    if (k === "clear") {
      setAmountRaw("");
      return;
    }
    if (/^\d$/.test(k)) {
      setAmountRaw((x) => (x + k).slice(0, 8));
    }
  }

  return (
    <div className="kioskRoot" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style jsx global>{`
        html, body { height: 100%; background: #f3f7ff; }
        body { margin: 0; }
        * { -webkit-tap-highlight-color: transparent; user-select: none; }
        input { user-select: text; }

        /* wrapper */
        .kioskWrap {
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          padding: 14px;
          box-sizing: border-box;
        }

        .topBar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid rgba(10, 60, 160, 0.10);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }

        .brand {
          display: flex; align-items: center; gap: 10px;
          font-weight: 950; color: #0a2a7a; font-size: 18px;
          min-width: 0;
        }
        .dot { width: 10px; height: 10px; border-radius: 999px; background: #1d4ed8; }

        .pill {
          padding: 7px 10px; border-radius: 999px;
          background: rgba(29,78,216,0.12);
          color: #1d4ed8; font-weight: 950; font-size: 12px;
          white-space: nowrap;
        }

        .tabs { display: flex; gap: 10px; align-items: center; }
        .tabBtn {
          padding: 12px 14px; border-radius: 16px;
          border: 1px solid rgba(10,60,160,0.14);
          background: #fff; font-weight: 950; font-size: 16px;
          cursor: pointer;
        }
        .tabBtnActive { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
        .tabBtnDanger { background: #fff; border-color: rgba(220,38,38,0.25); color: #b91c1c; }

        /* main container that fills remaining height */
        .main {
          flex: 1;
          min-height: 0;
          margin-top: 12px;
          border-radius: 22px;
          background: #fff;
          border: 1px solid rgba(10, 60, 160, 0.10);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .pane {
          flex: 1;
          min-height: 0;
          padding: 16px;
          display: none;
          overflow: auto;
          box-sizing: border-box;
        }
        .paneActive { display: block; }

        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 850; }

        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
        }
        @media (max-width: 900px){
          .grid2 { grid-template-columns: 1fr; }
        }

        .label { font-size: 12px; font-weight: 950; color: rgba(10,42,122,0.70); margin-bottom: 6px; }

        .bigInput {
          width: 100%; padding: 16px;
          font-size: 18px; font-weight: 900;
          border-radius: 18px;
          border: 1px solid rgba(10,60,160,0.18);
          outline: none;
          background: #fff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
        }

        .amountBox {
          width: 100%;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(10,60,160,0.18);
          background: #fff;
          font-size: 22px;
          font-weight: 950;
          color: #0a2a7a;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
        }
        .amountHint { font-size: 13px; font-weight: 850; color: rgba(10,42,122,0.55); }

        .moneyPreview { font-size: 20px; font-weight: 950; color: #0a2a7a; margin-top: 8px; }

        .bigBtnRow { display: flex; gap: 12px; margin-top: 14px; }
        .bigBtn {
          flex: 1; padding: 16px; border-radius: 18px;
          border: 1px solid rgba(10,60,160,0.18);
          background: #fff; font-weight: 950; font-size: 18px;
          cursor: pointer;
        }
        .bigBtnPrimary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }

        .statusBox {
          margin-top: 12px; padding: 12px 14px; border-radius: 16px;
          background: rgba(29,78,216,0.08);
          border: 1px solid rgba(29,78,216,0.16);
          color: #0a2a7a; font-weight: 850;
          min-height: 44px; display: flex; align-items: center;
        }

        .overlay {
          position: fixed; inset: 0;
          background: rgba(10, 18, 40, 0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 18px; z-index: 50;
        }
        .overlayCard {
          width: min(680px, 96vw);
          background: #fff; border-radius: 22px;
          padding: 14px;
          border: 1px solid rgba(10,60,160,0.14);
          box-shadow: 0 18px 50px rgba(10,42,122,0.18);
        }

        /* Sale grid default */
        .saleGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .saleCard {
          border-radius: 22px;
          border: 1px solid rgba(10,60,160,0.14);
          background: #f8fbff;
          padding: 12px;
          display: grid;
          gap: 10px;
          align-content: start;
          min-height: 0;
        }

        .saleName { font-weight: 950; font-size: 18px; color: #0a2a7a; }
        .salePrice { font-weight: 950; font-size: 22px; color: #1d4ed8; }
        .saleUpc { font-weight: 900; color: rgba(10,42,122,0.60); font-size: 12px; }

        .keypad {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .key {
          padding: 18px 0;
          border-radius: 18px;
          border: 1px solid rgba(10,60,160,0.16);
          background: #fff;
          font-weight: 950;
          font-size: 22px;
          color: #0a2a7a;
          cursor: pointer;
        }
        .keyAlt { background: rgba(29,78,216,0.08); }
        .keyDone { background: #1d4ed8; color: #fff; border-color: #1d4ed8; grid-column: 1 / -1; }

        /* ============================
           SALE FULLSCREEN MODE
           - hide everything except sale grid
           ============================ */
        .saleMode .topBar { display: none !important; }
        .saleMode .main { margin-top: 0 !important; }
        .saleMode .pane {
          padding: 10px !important;
          overflow: hidden !important;
        }

        /* Fill the panel with 2x4 grid */
        .saleMode .saleGrid{
          margin-top: 10px !important;
          height: calc(100% - 40px);
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 12px;
        }

        .saleMode .saleCard{
          height: 100%;
          min-height: 0 !important;
          padding: 12px;
          grid-template-rows: auto 1fr auto;
        }

        .saleMode .saleName{ font-size: 20px; }
        .saleMode .salePrice{ font-size: 26px; }
        .saleMode .saleUpc{ font-size: 13px; }
      `}</style>

      <div className={"kioskWrap " + (saleMode ? "saleMode" : "")}>
        {/* TOP BAR (hidden in saleMode by CSS; still rendered okay) */}
        <div className="topBar">
          <div className="brand">
            <span className="dot" />
            Cashier
            <span className="pill">{tabletId}</span>
            <span className="pill">{memberId ? "CONNECTED" : "NOT CONNECTED"}</span>
          </div>

          <div className="tabs">
            <button
              className={"tabBtn " + (tab === TAB_MEMBER ? "tabBtnActive" : "")}
              onClick={() => setTab(TAB_MEMBER)}
            >
              Member
            </button>
            <button
              className={"tabBtn " + (tab === TAB_SALE ? "tabBtnActive" : "")}
              onClick={() => setTab(TAB_SALE)}
            >
              Sale
            </button>
            <button className="tabBtn tabBtnDanger" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </div>

        <div className="main">
          {/* MEMBER TAB */}
          <div className={"pane " + (tab === TAB_MEMBER ? "paneActive" : "")}>
            <div className="title">Member</div>

            <div className="grid2">
              <div>
                <div className="label">Receipt Amount</div>
                <div className="amountBox" onClick={() => setPadOpen(true)}>
                  <div>
                    <div style={{ lineHeight: 1.1 }}>{amountRaw ? amountRaw : "Tap to enter"}</div>
                    <div className="amountHint">Type cents: 1298 = $12.98</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 950, color: "#1d4ed8" }}>
                    {formatMoneyFromRaw(amountRaw)}
                  </div>
                </div>
                <div className="moneyPreview">{formatMoneyFromRaw(amountRaw)}</div>
              </div>

              <div>
                <div className="label">Member ID</div>
                <div className="bigInput">{memberId ? memberId : "Scan member QR"}</div>
              </div>
            </div>

            <div className="bigBtnRow">
              {!scanning ? (
                <button className="bigBtn bigBtnPrimary" onClick={startScanner}>
                  Scan Member QR
                </button>
              ) : (
                <button className="bigBtn" onClick={stopScanner}>
                  Stop Camera
                </button>
              )}
              <button className="bigBtn bigBtnPrimary" onClick={recordPurchase}>
                Save Purchase
              </button>
            </div>

            <div className="statusBox">{scanStatus || status || "Ready."}</div>
          </div>

          {/* SALE TAB (fullscreen mode auto via saleMode) */}
          <div className={"pane " + (tab === TAB_SALE ? "paneActive" : "")}>
            <div className="title saleTitle">Sale Items</div>

            {saleLoading ? (
              <div className="statusBox" style={{ marginTop: 14 }}>
                Loading sale items…
              </div>
            ) : saleStatus ? (
              <div className="statusBox" style={{ marginTop: 14 }}>
                {saleStatus}
              </div>
            ) : sale.length === 0 ? (
              <div className="statusBox" style={{ marginTop: 14 }}>
                No active sale items.
              </div>
            ) : (
              <div className="saleGrid">
                {sale.slice(0, 8).map((it) => (
                  <div key={it.id} className="saleCard">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div className="saleName">{it.name}</div>
                      <div className="salePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                    </div>

                    <BarcodeCanvas upc={it.upc} tall />

                    <div className="saleUpc">UPC: {digitsOnly(it.upc)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CAMERA OVERLAY */}
        {scanning && (
          <div className="overlay" onClick={stopScanner}>
            <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
              <div className="title" style={{ fontSize: 18 }}>
                Scan QR
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Center the member QR in the box.
              </div>
              <div style={{ marginTop: 12 }}>
                <div id={readerDivId} style={{ width: "100%" }} />
              </div>
              <div className="bigBtnRow" style={{ marginTop: 12 }}>
                <button className="bigBtn" onClick={stopScanner}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* KEYPAD OVERLAY */}
        {padOpen && (
          <div className="overlay" onClick={() => setPadOpen(false)}>
            <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
              <div className="title" style={{ fontSize: 18 }}>
                Enter Amount
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Type cents: 1298 = $12.98
              </div>

              <div className="moneyPreview" style={{ textAlign: "center", marginTop: 12 }}>
                {formatMoneyFromRaw(amountRaw)}
              </div>

              <div className="keypad">
                {"123456789".split("").map((d) => (
                  <button key={d} className="key" onClick={() => keyPress(d)}>
                    {d}
                  </button>
                ))}
                <button className="key keyAlt" onClick={() => keyPress("clear")}>
                  Clear
                </button>
                <button className="key" onClick={() => keyPress("0")}>
                  0
                </button>
                <button className="key keyAlt" onClick={() => keyPress("back")}>
                  ⌫
                </button>
                <button className="key keyDone" onClick={() => keyPress("done")}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REDEEM POPUP */}
        {redeemOpen && redeemUpc && (
          <div className="overlay" onClick={() => setRedeemOpen(false)}>
            <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
              <div className="title">Redeem Coupon</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {redeemMsg}
              </div>

              <div style={{ marginTop: 14 }}>
                <BarcodeCanvas upc={redeemUpc} tall />
                <div className="muted" style={{ marginTop: 8, fontWeight: 900 }}>
                  Scan this on the POS: ${(redeemCents / 100).toFixed(2)} OFF
                </div>
              </div>

              <div className="bigBtnRow" style={{ marginTop: 14 }}>
                <button className="bigBtn bigBtnPrimary" onClick={() => setRedeemOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
