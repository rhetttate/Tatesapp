"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  sendToPos,
  connectBluetooth,
  disconnectBluetooth,
  getBridgeStatus,
  isBluetoothSupported,
  onBridgeChange,
} from "../../lib/posBridge";

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

/* sleep window: 7:30 PM – 6:00 AM local time */
function inSleepWindow(d = new Date()) {
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 19 * 60 + 30 || mins < 6 * 60;
}

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
  const TAB_PLU = 2 as const;
  type Tab = 0 | 1 | 2;

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

  // sleep mode (7:30pm–6am): all polling stops; tap wakes for 15 min
  const [asleep, setAsleep] = useState(false);
  const wakeUntilRef = useRef(0);

  // swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // redeem popup
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemUpc, setRedeemUpc] = useState<string | null>(null);
  const [redeemCents, setRedeemCents] = useState<number>(0);
  const [redeemMsg, setRedeemMsg] = useState<string>("");

  // tap-to-send toast (Sale + PLU tabs)
  const [toast, setToast] = useState<string>("");
  const toastTimer = useRef<any>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }
  // barcode-on-demand popup (fallback when the POS bridge isn't linked)
  const [showCode, setShowCode] = useState<{ name: string; code: string } | null>(null);

  // quantity multiplier for sale items (cycles ×1–×9, resets after use)
  const [qty, setQty] = useState(1);
  function bumpQty() {
    vibrate(10);
    setQty((q) => (q >= 9 ? 1 : q + 1));
  }

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function ringItem(name: string, code: string, count = 1) {
    beep(980, 80);
    vibrate(20);
    setQty(1);
    if (getBridgeStatus() !== "connected") {
      // no bridge — show a scannable barcode instead
      setShowCode({ name, code });
      return;
    }

    let sent = 0;
    let lastMsg = "";
    for (let i = 0; i < count; i++) {
      if (i > 0) await pause(150); // give the bridge time to type each code
      const res = await sendToPos(code);
      if (!res.delivered) {
        lastMsg = res.message;
        break;
      }
      sent++;
    }

    if (sent === count) {
      showToast(`Sent ${name}${count > 1 ? ` ×${count}` : ""} to register ✅`);
    } else {
      showToast(`${name}: sent ${sent}/${count} — ${lastMsg}`);
    }
  }

  // PLU lookup
  type Plu = { id: string; plu: string; name: string; price: number | null; department: string | null };
  const [plus, setPlus] = useState<Plu[]>([]);
  const [pluLoading, setPluLoading] = useState(true);
  const [pluQuery, setPluQuery] = useState("");

  // custom on-screen keyboard (the OS keyboard would cover the results)
  function pluKey(k: string) {
    vibrate(10);
    if (k === "back") setPluQuery((q) => q.slice(0, -1));
    else if (k === "clear") setPluQuery("");
    else if (k === "space") setPluQuery((q) => (q ? (q + " ").slice(0, 40) : q));
    else setPluQuery((q) => (q + k).slice(0, 40));
  }

  async function loadPlus() {
    setPluLoading(true);
    try {
      const { data, error } = await supabase
        .from("plus")
        .select("id,plu,name,price,department,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (!error) setPlus((data as any) || []);
    } finally {
      setPluLoading(false);
    }
  }
  useEffect(() => {
    loadPlus();
  }, []);

  const pluFiltered = useMemo(() => {
    const q = pluQuery.trim().toLowerCase();
    if (!q) return plus;
    return plus
      .map((it) => {
        const name = it.name.toLowerCase();
        const code = it.plu.toLowerCase();
        let s = -1;
        if (code.startsWith(q)) s = 0;
        else if (name.startsWith(q)) s = 1;
        else if (code.includes(q)) s = 2;
        else if (name.includes(q)) s = 3;
        return { it, s };
      })
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name))
      .map((x) => x.it);
  }, [plus, pluQuery]);

  // POS bridge (Bluetooth) status
  const [bridgeStatus, setBridgeStatus] = useState<"connected" | "disconnected">("disconnected");
  const [btSupported, setBtSupported] = useState(true);
  useEffect(() => {
    setBridgeStatus(getBridgeStatus());
    setBtSupported(isBluetoothSupported());
    const off = onBridgeChange(setBridgeStatus);
    return off;
  }, []);
  async function connectRegister() {
    const res = await connectBluetooth();
    showToast(res.message);
  }


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
    if (scanning || padOpen || redeemOpen || showCode) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (scanning || padOpen || redeemOpen || showCode) return;

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
      // swipe left -> next tab, swipe right -> previous tab (Member ↔ Sale ↔ PLU)
      setTab((t) => (dx < 0 ? Math.min(TAB_PLU, t + 1) : Math.max(TAB_MEMBER, t - 1)) as Tab);
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
  // Background refreshes never flash the loading state and never trigger a
  // re-render unless the data actually changed.
  async function loadSale(showSpinner = false) {
    if (showSpinner) setSaleLoading(true);
    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id,name,upc,price,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .limit(12); // barcode-free cards fit 12 on screen
      if (error) throw error;
      setSaleStatus("");
      const next = ((data as any) || []) as SaleItem[];
      setSale((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch (e: any) {
      setSaleStatus("Sale load error: " + (e?.message ?? String(e)));
    } finally {
      setSaleLoading(false);
    }
  }

  useEffect(() => {
    loadSale(sale.length === 0); // spinner only on the very first load
    if (asleep) return;

    // slow background refresh while awake + visible
    const t = setInterval(() => {
      if (!document.hidden) loadSale();
    }, 60_000);

    // refresh right away when the tablet screen comes back
    const onVis = () => {
      if (!document.hidden) loadSale();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asleep]);

  /* ---------- redeem poll ----------
     1s while a customer is connected (redemptions land instantly at the
     register), relaxed 5s safety net when idle, fully stopped while asleep. */
  useEffect(() => {
    if (!tabletId || asleep) return;

    const pollMs = memberId.trim() ? 1000 : 5000;

    const t = setInterval(async () => {
      if (document.hidden) return;
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
    }, pollMs);

    return () => clearInterval(t);
  }, [tabletId, asleep, memberId]);

  /* ---------- sleep mode ----------
     Enters sleep during 7:30pm–6am unless a customer is connected or the
     screen was tapped awake (15 min grace). Checked every 30s. */
  useEffect(() => {
    function evalSleep() {
      const shouldSleep =
        inSleepWindow() && !memberId.trim() && Date.now() > wakeUntilRef.current;
      setAsleep((prev) => (prev === shouldSleep ? prev : shouldSleep));
    }
    evalSleep();
    const t = setInterval(evalSleep, 30_000);
    return () => clearInterval(t);
  }, [memberId]);

  function wake() {
    wakeUntilRef.current = Date.now() + 15 * 60_000;
    setAsleep(false);
    loadSale(); // fresh items the moment it wakes
  }

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
          gap: 10px; flex-wrap: wrap;
          padding: 12px 16px;
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
          padding: 7px 12px; border-radius: 999px;
          background: rgba(29,78,216,0.12);
          color: #1d4ed8; font-weight: 800; font-size: 12px;
          white-space: nowrap;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .pillOn { background: rgba(22,163,74,0.14); color: #15803d; }
        .pillOff { background: rgba(10,42,122,0.08); color: rgba(10,42,122,0.6); }
        .pillDot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; display: inline-block; }

        .tabs { display: flex; gap: 10px; align-items: center; }
        .tabBtn {
          padding: 12px 18px; border-radius: 14px;
          border: 1px solid rgba(10,60,160,0.14);
          background: #fff; font-weight: 800; font-size: 16px;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .18s ease, background .15s ease;
        }
        .tabBtn:active { transform: translateY(1px); }
        .tabBtnActive {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
          color: #fff; border-color: transparent;
          box-shadow: 0 6px 16px rgba(29,78,216,0.3);
        }
        .tabBtnDanger { background: #fff; border-color: rgba(220,38,38,0.25); color: #b91c1c; }
        .tabBtnDanger:hover { background: #fef2f2; }

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
          flex: 1; padding: 18px; border-radius: 16px;
          border: 1px solid rgba(10,60,160,0.18);
          background: #fff; font-weight: 800; font-size: 18px;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .18s ease, background .15s ease;
        }
        .bigBtn:active { transform: translateY(1px) scale(.995); }
        .bigBtn:hover { background: #f7f9fe; }
        .bigBtnPrimary {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
          color: #fff; border-color: transparent;
          box-shadow: 0 8px 20px rgba(29,78,216,0.3);
        }
        .bigBtnPrimary:hover { background: linear-gradient(180deg, #2f6bf0, #1e51e0); }

        .statusBox {
          margin-top: 12px; padding: 12px 14px; border-radius: 16px;
          background: rgba(29,78,216,0.08);
          border: 1px solid rgba(29,78,216,0.16);
          color: #0a2a7a; font-weight: 850;
          min-height: 44px; display: flex; align-items: center;
        }

        .overlay {
          position: fixed; inset: 0;
          background: rgba(10, 18, 40, 0.5);
          backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center;
          padding: 18px; z-index: 50;
          animation: kioskFade .2s ease both;
        }
        @keyframes kioskFade { from { opacity: 0; } to { opacity: 1; } }
        .overlayCard {
          width: min(680px, 96vw);
          background: #fff; border-radius: 24px;
          padding: 18px;
          border: 1px solid rgba(10,60,160,0.14);
          box-shadow: 0 18px 50px rgba(10,42,122,0.22);
          animation: kioskPop .26s cubic-bezier(.22,.61,.36,1) both;
        }
        @keyframes kioskPop {
          from { opacity: 0; transform: translateY(14px) scale(.97); }
          to { opacity: 1; transform: none; }
        }

        /* Sale grid default */
        .saleGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .saleCard {
          border-radius: 20px;
          border: 1px solid rgba(10,60,160,0.12);
          background: linear-gradient(180deg, #ffffff, #f6faff);
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
          min-height: 0;
          box-shadow: 0 4px 14px rgba(10,42,122,0.05);
          transition: transform .12s ease, box-shadow .18s ease;
        }

        .saleName { font-weight: 900; font-size: 24px; color: #0a2a7a; letter-spacing: -0.01em; line-height: 1.12; }
        .salePrice { font-weight: 950; font-size: 26px; color: #1d4ed8; letter-spacing: -0.02em; }
        .saleCardTap { cursor: pointer; }
        .saleCardTap:active { transform: scale(.98); }

        .sleepOverlay {
          position: fixed; inset: 0; z-index: 90;
          background: linear-gradient(180deg, #060b1d, #0a1230 70%, #0d1738);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 14px;
          cursor: pointer;
          animation: kioskFade .6s ease both;
        }
        .sleepMoon { font-size: 72px; opacity: .9; }
        .sleepTitle { color: rgba(255,255,255,0.92); font-size: 28px; font-weight: 900; letter-spacing: -0.01em; }
        .sleepHint { color: rgba(255,255,255,0.45); font-size: 16px; font-weight: 700; }

        .posToast {
          position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
          background: #0a2a7a; color: #fff; font-weight: 800; font-size: 16px;
          padding: 14px 20px; border-radius: 999px;
          box-shadow: 0 14px 36px rgba(10,42,122,0.34); z-index: 60;
          animation: kioskPop .22s ease both; max-width: 90vw;
        }

        /* PLU lookup tab */
        .pluBar2 {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
        }
        /* PLU tab fills the pane so results scroll next to the keyboard */
        .pluPane.paneActive { display: flex; flex-direction: column; }
        .pluBar2 { flex: 0 0 auto; }
        .pluSplit {
          display: flex;
          gap: 14px;
          flex: 1;
          min-height: 0;
        }
        .pluLeft {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .pluResults {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }

        .pluSearchBox {
          flex: 0 0 auto;
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px; min-height: 58px;
          border-radius: 16px; border: 1px solid rgba(10,60,160,0.18);
          background: #fff; color: #0a2a7a;
          font-size: 22px; font-weight: 900;
          margin-bottom: 12px;
        }
        .pluQueryText {
          min-width: 0; overflow: hidden; white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .pluPlaceholder { color: rgba(10,42,122,0.35); font-weight: 800; }
        .pluCaret {
          width: 3px; height: 26px; border-radius: 2px;
          background: #1d4ed8; flex: 0 0 auto;
          animation: caretBlink 1.1s steps(1) infinite;
        }
        @keyframes caretBlink { 50% { opacity: 0; } }
        .pluClearBtn {
          margin-left: auto; flex: 0 0 auto;
          width: 38px; height: 38px; border-radius: 999px;
          border: 0; background: rgba(10,42,122,0.08);
          color: rgba(10,42,122,0.6); font-weight: 900; font-size: 16px;
          cursor: pointer;
        }
        .pluClearBtn:active { transform: scale(.92); }

        /* built-in keyboard (right side in landscape) */
        .pluKeyboard {
          flex: 0 0 clamp(320px, 38vw, 470px);
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          border-radius: 18px;
          background: #eef3fc;
          border: 1px solid rgba(10,60,160,0.10);
          align-self: flex-start;
        }
        .kbRow { display: flex; gap: 8px; height: 60px; }
        .kbSpacer { pointer-events: none; }
        .kbKey {
          flex: 1;
          border-radius: 12px;
          border: 1px solid rgba(10,60,160,0.14);
          background: #fff;
          color: #0a2a7a;
          font-weight: 900;
          font-size: 21px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0;
          touch-action: manipulation;
          transition: transform .08s ease, background .12s ease;
        }
        .kbKey:active { transform: scale(.93); background: #e3ecff; }
        .kbKeyAlt { background: rgba(29,78,216,0.08); font-size: 17px; }

        /* portrait / narrow fallback: keyboard drops below the results */
        @media (max-width: 900px) {
          .pluSplit { flex-direction: column; }
          .pluKeyboard { flex: 0 0 auto; align-self: stretch; }
          .kbRow { height: 48px; }
        }

        .pluGrid2 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        .pluTile2 {
          text-align: left; cursor: pointer;
          background: linear-gradient(180deg, #ffffff, #f6faff);
          border: 1px solid rgba(10,60,160,0.14); border-radius: 18px; padding: 16px;
          display: flex; flex-direction: column; gap: 6px; min-height: 96px;
          transition: transform .1s ease;
        }
        .pluTile2:active { transform: scale(.97); }
        .pluName2 { font-weight: 950; font-size: 19px; color: #0a2a7a; line-height: 1.1; }
        .pluMeta2 { font-weight: 900; color: #1d4ed8; font-size: 14px; }
        .pluPrice2 { margin-top: auto; font-weight: 950; font-size: 20px; color: #0a2a7a; }

        .keypad {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .key {
          padding: 20px 0;
          border-radius: 16px;
          border: 1px solid rgba(10,60,160,0.16);
          background: #fff;
          font-weight: 800;
          font-size: 24px;
          color: #0a2a7a;
          cursor: pointer;
          transition: transform .1s ease, background .12s ease;
        }
        .key:active { transform: scale(.96); background: #eef3ff; }
        .keyAlt { background: rgba(29,78,216,0.08); }
        .keyDone {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
          color: #fff; border-color: transparent; grid-column: 1 / -1;
          box-shadow: 0 8px 20px rgba(29,78,216,0.3);
        }

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
        /* let the grid stretch to fill the screen */
        .saleMode .paneActive {
          display: flex;
          flex-direction: column;
        }
        .saleMode .saleHead { flex: 0 0 auto; margin-bottom: 8px; }

        .saleHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .qtyBtn {
          min-width: 64px;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(10,60,160,0.18);
          background: #fff;
          color: #0a2a7a;
          font-weight: 950;
          font-size: 20px;
          cursor: pointer;
          transition: transform .1s ease, background .15s ease, color .15s ease, box-shadow .18s ease;
        }
        .qtyBtn:active { transform: scale(.94); }
        .qtyBtnOn {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 6px 16px rgba(29,78,216,0.3);
        }

        /* Fullscreen sale grid: no barcodes, so tiles are short and
           up to 12 fit without scrolling */
        .saleMode .saleGrid{
          margin-top: 0 !important;

          flex: 1;
          min-height: 0;
          padding-bottom: 48px;

          display: grid;

          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          grid-auto-rows: minmax(110px, 1fr);
          grid-auto-flow: dense;

          align-content: stretch;
          overflow: hidden;

          gap: 12px;
        }

        /* fewer items = more breathing room */
        .saleMode.saleCount1 .saleGrid,
        .saleMode.saleCount2 .saleGrid,
        .saleMode.saleCount3 .saleGrid,
        .saleMode.saleCount4 .saleGrid,
        .saleMode.saleCount5 .saleGrid,
        .saleMode.saleCount6 .saleGrid{
          gap: 24px;
        }
        .saleMode.saleCount7 .saleGrid,
        .saleMode.saleCount8 .saleGrid{
          gap: 18px;
        }

        .saleMode .saleCard{
          height: 100%;
          min-height: 0 !important;
          padding: 14px 16px;
        }

        .saleMode .saleName{ font-size: 26px; }
        .saleMode .salePrice{ font-size: 30px; }
      `}</style>

      <div className={"kioskWrap " + (saleMode ? "saleMode " : "") + "saleCount" + Math.min(12, sale.length)}>
        {/* TOP BAR (hidden in saleMode by CSS; still rendered okay) */}
        <div className="topBar">
          <div className="brand">
            <span className="dot" />
            Cashier
            <span className="pill">{tabletId}</span>
            <span className={"pill " + (memberId ? "pillOn" : "pillOff")}>
              <span className="pillDot" />
              {memberId ? "CONNECTED" : "NOT CONNECTED"}
            </span>
            <span className={"pill " + (bridgeStatus === "connected" ? "pillOn" : "pillOff")}>
              <span className="pillDot" />
              {bridgeStatus === "connected" ? "POS LINKED" : "POS OFF"}
            </span>
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
            <button
              className={"tabBtn " + (tab === TAB_PLU ? "tabBtnActive" : "")}
              onClick={() => setTab(TAB_PLU)}
            >
              PLU
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
            <div className="saleHead">
              <div className="title saleTitle">Sale Items</div>
              <button
                className={"qtyBtn " + (qty > 1 ? "qtyBtnOn" : "")}
                onClick={bumpQty}
                title="Tap to set quantity — next item rings this many times"
              >
                ×{qty}
              </button>
            </div>

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
                {sale.slice(0, 12).map((it) => (
                  <div
                    key={it.id}
                    className="saleCard saleCardTap"
                    role="button"
                    tabIndex={0}
                    onClick={() => ringItem(it.name, it.upc, qty)}
                    title="Tap to send to register"
                  >
                    <div className="saleName">{it.name}</div>
                    <div className="salePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PLU LOOKUP TAB */}
          <div className={"pane pluPane " + (tab === TAB_PLU ? "paneActive" : "")}>
            <div className="pluBar2">
              <div className="title">PLU Lookup</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {bridgeStatus === "connected" ? (
                  <button className="bigBtn" onClick={() => disconnectBluetooth()} style={{ flex: "0 0 auto" }}>
                    Unlink register
                  </button>
                ) : (
                  <button
                    className="bigBtn bigBtnPrimary"
                    onClick={connectRegister}
                    disabled={!btSupported}
                    style={{ flex: "0 0 auto" }}
                  >
                    Connect register
                  </button>
                )}
              </div>
            </div>

            <div className="pluSplit">
              {/* LEFT: search readout + results (always visible while typing) */}
              <div className="pluLeft">
                <div className="pluSearchBox">
                  <span aria-hidden>🔍</span>
                  <span className={"pluQueryText " + (pluQuery ? "" : "pluPlaceholder")}>
                    {pluQuery || "Search item or PLU…"}
                  </span>
                  <span className="pluCaret" aria-hidden />
                  {pluQuery ? (
                    <button className="pluClearBtn" onClick={() => setPluQuery("")} aria-label="Clear search">
                      ✕
                    </button>
                  ) : null}
                </div>

                <div className="pluResults">
                  {pluLoading ? (
                    <div className="statusBox">Loading PLUs…</div>
                  ) : pluFiltered.length === 0 ? (
                    <div className="statusBox">
                      {pluQuery ? `No match for “${pluQuery}”.` : "No PLUs yet — add them in Admin → PLUs."}
                    </div>
                  ) : (
                    <div className="pluGrid2">
                      {pluFiltered.map((it) => (
                        <div
                          key={it.id}
                          className="pluTile2"
                          role="button"
                          tabIndex={0}
                          onClick={() => ringItem(it.name, it.plu)}
                          title="Tap to send to register"
                        >
                          <div className="pluName2">{it.name}</div>
                          <div className="pluMeta2">
                            PLU {it.plu}
                            {it.department ? ` • ${it.department}` : ""}
                          </div>
                          <div className="pluPrice2">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: built-in keyboard (never covers the results) */}
              <div className="pluKeyboard">
                {[
                  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
                  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
                  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
                  ["Z", "X", "C", "V", "B", "N", "M"],
                ].map((row, i) => (
                  <div className="kbRow" key={i}>
                    {i === 2 && <span className="kbSpacer" style={{ flex: 0.5 }} />}
                    {i === 3 && <span className="kbSpacer" style={{ flex: 0.5 }} />}
                    {row.map((k) => (
                      <button key={k} className="kbKey" onClick={() => pluKey(k)}>
                        {k}
                      </button>
                    ))}
                    {i === 2 && <span className="kbSpacer" style={{ flex: 0.5 }} />}
                    {i === 3 && (
                      <button className="kbKey kbKeyAlt" style={{ flex: 2 }} onClick={() => pluKey("back")}>
                        ⌫
                      </button>
                    )}
                  </div>
                ))}
                <div className="kbRow">
                  <button className="kbKey kbKeyAlt" style={{ flex: 1 }} onClick={() => pluKey("clear")}>
                    Clear
                  </button>
                  <button className="kbKey" style={{ flex: 3 }} onClick={() => pluKey("space")}>
                    Space
                  </button>
                </div>
              </div>
            </div>
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

        {/* ITEM BARCODE POPUP (fallback when POS bridge is not linked) */}
        {showCode && (
          <div className="overlay" onClick={() => setShowCode(null)}>
            <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
              <div className="title">{showCode.name}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                POS bridge not linked — scan this barcode on the register.
              </div>

              <div style={{ marginTop: 14 }}>
                {digitsOnly(showCode.code).length >= 11 ? (
                  <>
                    <BarcodeCanvas upc={showCode.code} tall />
                    <div className="muted" style={{ marginTop: 8, fontWeight: 900 }}>
                      UPC {digitsOnly(showCode.code)}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 64,
                        fontWeight: 950,
                        color: "#0a2a7a",
                        textAlign: "center",
                        letterSpacing: "0.06em",
                        padding: "18px 0",
                      }}
                    >
                      {digitsOnly(showCode.code)}
                    </div>
                    <div className="muted" style={{ fontWeight: 900, textAlign: "center" }}>
                      Key this PLU on the register.
                    </div>
                  </>
                )}
              </div>

              <div className="bigBtnRow" style={{ marginTop: 14 }}>
                <button className="bigBtn bigBtnPrimary" onClick={() => setShowCode(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAP-TO-SEND TOAST */}
        {toast ? <div className="posToast">{toast}</div> : null}

        {/* SLEEP MODE (7:30pm–6am) */}
        {asleep && (
          <div
            className="sleepOverlay"
            onClick={wake}
            onTouchEnd={(e) => {
              e.stopPropagation();
              wake();
            }}
            role="button"
            tabIndex={0}
          >
            <div className="sleepMoon">🌙</div>
            <div className="sleepTitle">Register is sleeping</div>
            <div className="sleepHint">Tap anywhere to wake it up</div>
          </div>
        )}
      </div>
    </div>
  );
}
