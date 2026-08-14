"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { CameraScanOverlay } from "../../components/scanner";
import {
  Lane,
  LaneEvent,
  LaneStatus,
  connectLane,
  disconnectLane,
  getLaneStatus,
  isBluetoothSupported,
  onLaneEvent,
  onLaneStatus,
  sendToLane,
} from "../../../lib/scoBridge";

/* ---------- types ---------- */
type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
  active: boolean;
  sort_order: number;
};

type FeedLine = {
  id: number;
  lane: Lane;
  text: string;
  kind: "sent" | "ok" | "fail" | "host" | "info";
};

/* Price-entry departments: type-2 (price-embedded) UPCs.
   11 digits = 6-digit dept prefix + 5-digit price in cents; the Pico adds
   the check digit, so $10.00 Grocery goes out as UPC-A 20599001000+C. */
const DEPTS = [
  { key: "grocery", label: "Grocery", prefix: "205990" },
  { key: "meat", label: "Meat", prefix: "205980" },
  { key: "produce", label: "Produce", prefix: "205970" },
  { key: "nonfood", label: "Nonfood Grocery", prefix: "205960" },
] as const;
type DeptKey = (typeof DEPTS)[number]["key"];

function upcaCheckDigit(d11: string) {
  let s = 0;
  for (let i = 0; i < 11; i++) {
    const n = d11.charCodeAt(i) - 48;
    s += i % 2 === 0 ? n * 3 : n;
  }
  return String((10 - (s % 10)) % 10);
}

function beep(freq = 880, ms = 110) {
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
    setTimeout(() => { try { ctx.close(); } catch {} }, ms + 120);
  } catch {}
}
function vibrate(ms = 30) {
  try {
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

let feedSeq = 1;

export default function CashierScoPage() {
  const [sale, setSale] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [lane, setLane] = useState<Lane>(1);
  const [laneStatus, setLaneStatus] = useState<Record<Lane, LaneStatus>>({
    1: "disconnected",
    2: "disconnected",
  });
  const [connecting, setConnecting] = useState<Lane | 0>(0);
  // Set after mount — reading navigator.bluetooth during render makes the
  // server and client disagree (hydration mismatch).
  const [btReady, setBtReady] = useState(false);

  const [screen, setScreen] = useState<"sale" | "price">("sale");
  const [dept, setDept] = useState<DeptKey>("grocery");
  const [cents, setCents] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [banner, setBanner] = useState("");
  const bannerTimer = useRef<any>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  function pushFeed(l: Lane, text: string, kind: FeedLine["kind"]) {
    setFeed((f) => [...f.slice(-59), { id: feedSeq++, lane: l, text, kind }]);
  }

  function flashBanner(msg: string) {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(""), 1800);
  }

  async function load() {
    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,name,upc,price,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) setStatus("Load error: " + error.message);
    setSale((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setBtReady(isBluetoothSupported());
    // Service worker makes Chrome offer the full "install app" (WebAPK)
    // instead of a plain shortcut. Scoped to this screen only.
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sco-sw.js", { scope: "/cashier/sco" }).catch(() => {});
      }
    } catch {}
    setLaneStatus({ 1: getLaneStatus(1), 2: getLaneStatus(2) });
    const offStatus = onLaneStatus((l, s) => setLaneStatus((prev) => ({ ...prev, [l]: s })));
    const offEvent = onLaneEvent((l, e: LaneEvent) => {
      if (e.kind === "scan-ok") pushFeed(l, `✓ Rang ${e.code}`, "ok");
      else if (e.kind === "scan-fail") pushFeed(l, `✗ NCR didn't take ${e.code}`, "fail");
      else if (e.kind === "host") pushFeed(l, `NCR → scanner: ${e.hex}`, "host");
      else if (e.kind === "pong") pushFeed(l, `Bridge alive (${e.name})`, "info");
    });
    return () => {
      offStatus();
      offEvent();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // Keep the expanded feed pinned to the latest line.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed, feedOpen]);

  const deptDef = DEPTS.find((d) => d.key === dept)!;
  const priceValue = cents ? parseInt(cents, 10) / 100 : 0;
  const priceText = "$" + priceValue.toFixed(2);
  const code11 = deptDef.prefix + cents.padStart(5, "0");
  const codePreview = cents ? code11 + upcaCheckDigit(code11) : "";

  async function ring(code: string, label: string) {
    beep(980, 90);
    vibrate(25);
    pushFeed(lane, `→ ${label}`, "sent");
    const res = await sendToLane(lane, code);
    if (!res.delivered) {
      beep(240, 220);
      pushFeed(lane, res.message, "fail");
    }
    flashBanner(res.delivered ? `Sent to self-checkout ${lane} ✅` : res.message);
    return res.delivered;
  }

  async function ringPrice() {
    if (!cents || parseInt(cents, 10) === 0) return;
    const ok = await ring(code11, `${deptDef.label} ${priceText}`);
    if (ok) setCents("");
  }

  async function pickLane(l: Lane) {
    setLane(l);
    // Tapping an unlinked lane also starts the Bluetooth pairing for it.
    if (laneStatus[l] !== "connected" && connecting === 0 && btReady) {
      setConnecting(l);
      const res = await connectLane(l);
      pushFeed(l, res.message, res.ok ? "info" : "fail");
      flashBanner(res.message);
      setConnecting(0);
    }
  }

  function priceKey(k: string) {
    vibrate(10);
    if (k === "back") setCents((c) => c.slice(0, -1));
    else if (k === "clear") setCents("");
    else if (k === "00") setCents((c) => (c ? (c + "00").slice(0, 5) : c));
    else setCents((c) => (c === "" && k === "0" ? c : (c + k).slice(0, 5)));
  }

  const lastLine = feed.length ? feed[feed.length - 1] : null;

  const laneBtn = (l: Lane) => {
    const linked = laneStatus[l] === "connected";
    const selected = lane === l;
    return (
      <button
        className={"laneBtn" + (selected ? " laneBtnSel" : "")}
        onClick={() => pickLane(l)}
        disabled={connecting !== 0 && connecting !== l}
      >
        <span className={"laneDot" + (linked ? " laneDotOn" : "")} />
        Self-Checkout {l}
        <span className="laneSub">
          {connecting === l ? "linking…" : linked ? (selected ? "sending here" : "linked") : "tap to link"}
        </span>
        {linked ? (
          <span
            className="laneUnlink"
            onClick={(e) => {
              e.stopPropagation();
              disconnectLane(l);
              flashBanner(`Self-checkout ${l} unlinked.`);
            }}
          >
            unlink
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className={"scoRoot saleCount" + Math.min(12, sale.length)}>
      <style jsx global>{`
        html, body { height: 100%; background: var(--bg); }
        .scoRoot { height: 100svh; height: 100vh; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }

        /* row 1 — the two lane buttons, alone */
        .laneRow { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 0 0 auto; }
        .laneBtn {
          position: relative; display: flex; align-items: center; justify-content: center; gap: 12px;
          padding: 18px 14px; border-radius: 18px; cursor: pointer;
          border: 2px solid var(--border); background: #fff; color: var(--ink);
          font-size: 22px; font-weight: 900; letter-spacing: -.01em;
          box-shadow: var(--shadow-sm); transition: background .15s ease, border-color .15s ease;
          touch-action: manipulation;
        }
        .laneBtn:active { transform: scale(.985); }
        .laneBtnSel { background: var(--blue2); border-color: var(--blue2); color: #fff; }
        .laneDot { width: 12px; height: 12px; border-radius: 999px; background: #cbd5e1; flex: 0 0 auto; }
        .laneDotOn { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.25); }
        .laneSub { font-size: 13px; font-weight: 800; opacity: .75; }
        .laneUnlink {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          font-size: 12px; font-weight: 800; padding: 6px 10px; border-radius: 999px;
          background: rgba(0,0,0,.12); opacity: .85;
        }
        .laneBtnSel .laneUnlink { background: rgba(255,255,255,.22); }

        /* row 2 — screen switcher + small nav */
        .screenRow { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
        .screenTabs { flex: 1; display: flex; gap: 8px; }
        .screenTab {
          flex: 1; padding: 13px; border-radius: 14px; font-weight: 900; font-size: 17px;
          border: 1px solid var(--border); background: #fff; color: var(--muted); cursor: pointer;
          touch-action: manipulation;
        }
        .screenTabOn { background: #e3ecff; border-color: rgba(37,99,235,.45); color: var(--blue2); }

        .scoMain { flex: 1; min-height: 0; display: flex; flex-direction: column; }

        /* screen: sale items — fills the screen and auto-sizes, like the register */
        .saleGrid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          grid-auto-rows: minmax(110px, 1fr);
          grid-auto-flow: dense;
          align-content: stretch;
          overflow: hidden;
          gap: 12px;
        }
        /* fewer items = more breathing room */
        .saleCount1 .saleGrid, .saleCount2 .saleGrid, .saleCount3 .saleGrid,
        .saleCount4 .saleGrid, .saleCount5 .saleGrid, .saleCount6 .saleGrid { gap: 24px; }
        .saleCount7 .saleGrid, .saleCount8 .saleGrid { gap: 18px; }
        .saleGrid .scoTile { height: 100%; min-height: 0; }
        .saleGrid .scoTileName { font-size: 26px; }
        .saleGrid .scoTilePrice { font-size: 30px; color: var(--blue2); }

        .scoTile {
          text-align: left; cursor: pointer;
          background: linear-gradient(180deg, #ffffff, #f6faff);
          border: 1px solid var(--border); border-radius: 16px; padding: 14px;
          box-shadow: var(--shadow-sm); transition: transform .1s ease;
          display: flex; flex-direction: column; gap: 6px;
          touch-action: manipulation;
        }
        .scoTile:active { transform: scale(.96); }
        .scoTileName { font-weight: 900; font-size: 20px; color: var(--ink); line-height: 1.12; }
        .scoTilePrice { margin-top: auto; font-weight: 900; font-size: 20px; color: var(--ink); }

        /* screen: price entry + scan */
        .priceSplit { flex: 1; min-height: 0; display: flex; gap: 14px; }
        .priceLeft { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
        .deptGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; min-height: 0; }
        .deptBtn {
          border-radius: 18px; border: 2px solid var(--border); background: #fff; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          font-weight: 900; font-size: 22px; color: var(--ink); letter-spacing: -.01em;
          box-shadow: var(--shadow-sm); touch-action: manipulation;
          transition: background .12s ease, border-color .12s ease;
        }
        .deptBtn:active { transform: scale(.97); }
        .deptCode { font-size: 13px; font-weight: 800; opacity: .55; font-family: var(--mono, monospace); }
        .deptOn.deptGrocery { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
        .deptOn.deptMeat { background: #be123c; border-color: #be123c; color: #fff; }
        .deptOn.deptProduce { background: #15803d; border-color: #15803d; color: #fff; }
        .deptOn.deptNonfood { background: #b45309; border-color: #b45309; color: #fff; }
        .deptOn .deptCode { opacity: .8; }
        .scanBtn {
          flex: 0 0 auto; padding: 18px; border-radius: 18px; border: 2px dashed rgba(37,99,235,.5);
          background: #f0f6ff; color: var(--blue2); font-size: 20px; font-weight: 900; cursor: pointer;
          touch-action: manipulation;
        }
        .scanBtn:active { transform: scale(.98); }

        .priceRight { flex: 0 0 clamp(320px, 36vw, 440px); display: flex; flex-direction: column; gap: 10px; }
        .priceDisplay {
          background: #fff; border: 1px solid var(--border); border-radius: 18px;
          padding: 10px 18px; text-align: right;
          font-size: 46px; font-weight: 950; color: var(--ink); letter-spacing: -.02em;
        }
        .priceCode {
          text-align: right; font-family: var(--mono, monospace); font-size: 14px; font-weight: 700;
          color: var(--muted); min-height: 18px; padding-right: 6px;
        }
        .pricePad { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; min-height: 0; }
        .priceKey {
          border-radius: 14px; border: 1px solid rgba(10,60,160,.14); background: #fff;
          color: #0a2a7a; font-weight: 900; font-size: 26px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          touch-action: manipulation; transition: transform .08s ease, background .12s ease;
        }
        .priceKey:active { transform: scale(.93); background: #e3ecff; }
        .priceKeyAlt { background: rgba(29,78,216,.08); font-size: 19px; }
        .priceSend {
          flex: 0 0 auto; padding: 18px; border-radius: 16px; border: none;
          background: var(--blue2); color: #fff; font-size: 21px; font-weight: 900; cursor: pointer;
          touch-action: manipulation;
        }
        .priceSend:disabled { opacity: .4; }
        .priceSend:active { transform: scale(.98); }

        /* bottom activity strip + expandable feed */
        .feedStrip {
          flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
          background: #0f172a; border-radius: 14px; padding: 9px 14px; cursor: pointer;
          font-family: var(--mono, monospace); font-size: 13px; color: #cbd5e1;
          white-space: nowrap; overflow: hidden;
        }
        .feedStrip b { color: #7dd3fc; font-weight: 700; }
        .feedStripHint { margin-left: auto; opacity: .55; font-size: 12px; }
        .feedPanel {
          position: fixed; left: 12px; right: 12px; bottom: 12px; top: 30%;
          background: #0f172a; border-radius: 18px; padding: 14px; z-index: 60;
          display: flex; flex-direction: column; box-shadow: var(--shadow);
        }
        .feedScroll {
          flex: 1; overflow-y: auto; font-family: var(--mono, monospace);
          font-size: 13px; line-height: 1.55; -webkit-overflow-scrolling: touch;
        }
        .feedLine { color: #cbd5e1; }
        .feedLine b { color: #7dd3fc; font-weight: 700; }
        .feedOk { color: #86efac; }
        .feedFail { color: #fca5a5; }
        .feedHost { color: #fcd34d; }

        .scoBanner {
          position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 70;
          background: var(--ink); color: #fff; font-weight: 800; padding: 10px 18px;
          border-radius: 999px; box-shadow: var(--shadow);
        }

        @media (max-width: 900px) {
          .priceSplit { flex-direction: column; }
          .priceRight { flex: 1 1 auto; }
          .deptGrid { min-height: 180px; }
        }
      `}</style>

      {/* row 1 — lanes only */}
      <div className="laneRow">
        {laneBtn(1)}
        {laneBtn(2)}
      </div>

      {/* row 2 — screens + nav */}
      <div className="screenRow">
        <Link href="/cashier" className="btn btnSoft" style={{ textDecoration: "none", padding: "10px 14px" }}>←</Link>
        <div className="screenTabs">
          <button
            className={"screenTab" + (screen === "sale" ? " screenTabOn" : "")}
            onClick={() => setScreen("sale")}
          >
            Sale items
          </button>
          <button
            className={"screenTab" + (screen === "price" ? " screenTabOn" : "")}
            onClick={() => setScreen("price")}
          >
            Price entry
          </button>
        </div>
        <button className="btn" onClick={load} style={{ padding: "10px 14px" }}>Refresh</button>
      </div>

      {status ? <div className="statusMsg statusErr" style={{ paddingLeft: 4 }}>{status}</div> : null}

      <div className="scoMain">
        {screen === "sale" ? (
          <div className="saleGrid">
            {loading ? (
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />
              ))
            ) : sale.length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>No sale items.</div>
            ) : (
              sale.map((it) => (
                <button key={it.id} className="scoTile" onClick={() => ring(it.upc, it.name)}>
                  <div className="scoTileName">{it.name}</div>
                  <div className="scoTilePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="priceSplit">
            <div className="priceLeft">
              <div className="deptGrid">
                {DEPTS.map((d) => (
                  <button
                    key={d.key}
                    className={
                      "deptBtn dept" + d.label.split(" ")[0] + (dept === d.key ? " deptOn" : "")
                    }
                    onClick={() => { vibrate(12); setDept(d.key); }}
                  >
                    {d.label}
                    <span className="deptCode">{d.prefix}·····</span>
                  </button>
                ))}
              </div>
              <button className="scanBtn" onClick={() => setScanOpen(true)}>
                📷 Scan barcode
              </button>
            </div>

            <div className="priceRight">
              <div className="priceDisplay">{priceText}</div>
              <div className="priceCode">{codePreview ? `UPC ${codePreview}` : " "}</div>
              <div className="pricePad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((k) => (
                  <button
                    key={k}
                    className={"priceKey" + (k === "back" ? " priceKeyAlt" : "")}
                    onClick={() => priceKey(k)}
                  >
                    {k === "back" ? "⌫" : k}
                  </button>
                ))}
              </div>
              <button
                className="priceSend"
                disabled={!cents || parseInt(cents, 10) === 0}
                onClick={ringPrice}
              >
                Ring {priceText} {deptDef.label} → SCO {lane}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* bottom activity strip */}
      <div className="feedStrip" onClick={() => setFeedOpen(true)}>
        {lastLine ? (
          <span className={
            lastLine.kind === "ok" ? "feedOk" : lastLine.kind === "fail" ? "feedFail" : lastLine.kind === "host" ? "feedHost" : undefined
          }>
            <b>L{lastLine.lane}</b> {lastLine.text}
          </span>
        ) : (
          <span style={{ opacity: 0.6 }}>Activity — sends, confirmations, NCR messages</span>
        )}
        <span className="feedStripHint">tap for full log ▴</span>
      </div>

      {feedOpen ? (
        <div className="feedPanel" onClick={() => setFeedOpen(false)}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: "#fff", fontWeight: 900 }}>Activity log</div>
            <button className="xBtn" style={{ marginLeft: "auto" }} onClick={() => setFeedOpen(false)}>×</button>
          </div>
          <div className="feedScroll" ref={feedRef} onClick={(e) => e.stopPropagation()}>
            {feed.length === 0 ? (
              <div className="feedLine" style={{ opacity: 0.6 }}>Nothing yet.</div>
            ) : (
              feed.map((l) => (
                <div
                  key={l.id}
                  className={
                    "feedLine" +
                    (l.kind === "ok" ? " feedOk" : l.kind === "fail" ? " feedFail" : l.kind === "host" ? " feedHost" : "")
                  }
                >
                  <b>L{l.lane}</b> {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {scanOpen ? (
        <CameraScanOverlay
          title={`Scan → Self-Checkout ${lane}`}
          hint="Uses the rear camera. Center the barcode in the frame."
          onScan={(code) => {
            setScanOpen(false);
            const digits = (code || "").replace(/\D/g, "");
            if (digits) ring(digits, `scanned ${digits}`);
          }}
          onClose={() => setScanOpen(false)}
        />
      ) : null}

      {banner ? <div className="scoBanner">{banner}</div> : null}
    </div>
  );
}
